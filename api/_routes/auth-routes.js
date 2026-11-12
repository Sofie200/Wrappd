import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, withTransaction } from "../_db/pool.js";
import { clearAuthCookie, requireAuth, setAuthCookie } from "../_middleware/auth.js";
import { HttpError, parse } from "../_lib/http.js";
import { avatarColor, avatarIcon, email, name, password, username } from "../_lib/userSchema.js";
import { hashToken, isTokenFormat } from "../_lib/userLinks.js";
import { verifyGoogleIdToken } from "../_lib/googleAuth.js";
import { deleteAccount, planAccountDeletion } from "../_lib/deleteAccount.js";
import { syncChildGroups } from "../_lib/childGroups.js";
import { removeUnusedImages } from "../_lib/imageCleanup.js";

const router = Router();

// Email is required here - the alternative is signing up with Google (POST /google), which brings its own
const Register = z.object({ name, username, email, password });

const Login = z.object({
    username: z.string({ error: "Ange ditt användarnamn" }).trim().toLowerCase().min(1, "Ange ditt användarnamn"),
    password: z.string({ error: "Ange ditt lösenord" }).min(1, "Ange ditt lösenord"),
});

// What the frontend gets to know about the logged-in user
// googleConnected / hasPassword: for the profile page (whether Google can be disconnected without locking yourself out)
const USER_FIELDS = `id, name, username, email, email_verified AS "emailVerified", avatar_icon AS "avatarIcon", avatar_color AS "avatarColor",
    google_sub IS NOT NULL AS "googleConnected", password_hash IS NOT NULL AS "hasPassword"`;

const LINK_INVALID = "Länken är ogiltig, redan använd eller har gått ut. Be en admin i din grupp om en ny länk.";

/* --- POST /api/auth/register  { name, username, email, password } → { user } (+ the login cookie) --- */
router.post("/register", async (req, res) => {
    const body = parse(Register, req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);

    try {
        const { rows: [user] } = await pool.query(
            `INSERT INTO users (name, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING ${USER_FIELDS}`,
            [body.name, body.username, body.email, passwordHash]
        );
        setAuthCookie(res, user);
        res.status(201).json({ user });
    } catch (err) {
        if (err.code === "23505" && err.constraint === "users_email_key") {
            throw new HttpError(409, "Det finns redan ett konto med den e-postadressen");
        }
        if (err.code === "23505") throw new HttpError(409, "Användarnamnet är redan upptaget");
        throw err;
    }
});

/* --- POST /api/auth/login  { username, password } → { user } (+ the login cookie) --- */
router.post("/login", async (req, res) => {
    const body = parse(Login, req.body);

    const { rows: [user] } = await pool.query(
        `SELECT ${USER_FIELDS}, password_hash FROM users WHERE username = $1`,
        [body.username]
    );
    // Same message whether the user exists, isn't activated yet, or the password is wrong -
    // don't reveal which usernames exist
    const ok = user?.password_hash && (await bcrypt.compare(body.password, user.password_hash));
    if (!ok) throw new HttpError(401, "Fel användarnamn eller lösenord");

    const { password_hash, ...safeUser } = user; // eslint-disable-line no-unused-vars
    setAuthCookie(res, safeUser);
    res.json({ user: safeUser });
});

/* --- POST /api/auth/google  { credential } → { user } (+ the login cookie)  OR  { signup } - log in with Google --- */
// 1. A user already connected to this Google account → log in.
// 2. Otherwise an adult whose VERIFIED email is the same → connect the Google account and log in.
//    (Never on a typed-in email: anyone can type anyone's address and would get the owner's Google login.)
// 3. The email belongs to an account with an unverified email → 409; log in there and connect Google instead.
// 4. Otherwise NO account is created yet: { signup: { name, username, email } } - suggestions for the last step,
//    where the user picks a username and sends everything to POST /google/signup.
const GoogleLogin = z.object({ credential: z.string({ error: "Inloggningen med Google saknas" }).min(1).max(4096) });

function googleEmail(google) {
    return google.email_verified && google.email ? google.email.toLowerCase() : null;
}

// Steps 1-3 above: the user this Google account belongs to, or null if it's a new person
async function findGoogleUser(db, google) {
    const email = googleEmail(google);
    const { rows: [known] } = await db.query(`SELECT ${USER_FIELDS} FROM users WHERE google_sub = $1`, [google.sub]);
    if (known) return known;
    if (!email) return null;

    const { rows: [sameEmail] } = await db.query(
        `UPDATE users SET google_sub = $1
         WHERE email = $2 AND email_verified AND NOT is_child AND google_sub IS NULL
         RETURNING ${USER_FIELDS}`,
        [google.sub, email]
    );
    if (sameEmail) return sameEmail;

    const { rowCount: emailTaken } = await db.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (emailTaken) {
        throw new HttpError(
            409,
            "Det finns redan ett konto med den här e-postadressen. Logga in med användarnamn och lösenord, och koppla sedan Google under Min profil."
        );
    }
    return null;
}

router.post("/google", async (req, res) => {
    const { credential } = parse(GoogleLogin, req.body);
    const google = await verifyGoogleIdToken(credential);

    const user = await withTransaction((db) => findGoogleUser(db, google));
    if (user) {
        setAuthCookie(res, user);
        return res.json({ user });
    }

    // A new person: suggestions only. The username comes from the first name - not from the email,
    // since usernames are visible to others and searchable.
    const suggestedUsername = await freeUsername(pool, google.given_name || google.name?.split(" ")[0] || "user");
    res.json({
        signup: {
            name: (google.name || "").trim().slice(0, 80),
            username: suggestedUsername,
            email: googleEmail(google),
        },
    });
});

/* --- POST /api/auth/google/signup  { credential, name, username } → { user } (+ the login cookie) --- */
// The last step of signing up with Google. The same Google token is checked again (it's valid for an hour),
// so the email and Google id can't be made up - only the name and username come from the form.
const GoogleSignup = GoogleLogin.extend({ name, username });

router.post("/google/signup", async (req, res) => {
    const body = parse(GoogleSignup, req.body);
    const google = await verifyGoogleIdToken(body.credential);
    const email = googleEmail(google);

    try {
        const user = await withTransaction(async (db) => {
            // Signed up in another tab in the meantime, or the email now matches → just log in
            const existing = await findGoogleUser(db, google);
            if (existing) return existing;

            const { rows: [created] } = await db.query(
                `INSERT INTO users (name, username, email, email_verified, google_sub)
                 VALUES ($1, $2, $3::text, $3::text IS NOT NULL, $4) RETURNING ${USER_FIELDS}`,
                [body.name, body.username, email, google.sub]
            );
            return created;
        });
        setAuthCookie(res, user);
        res.status(201).json({ user });
    } catch (err) {
        if (err.code === "23505" && err.constraint === "users_username_key") {
            throw new HttpError(409, "Användarnamnet är redan upptaget");
        }
        if (err.code === "23505") throw new HttpError(409, "Kontot finns redan. Försök logga in med Google igen.");
        throw err;
    }
});

/* --- POST /api/auth/google/connect  { credential } → { user } - connect a Google account to my account --- */
// Also saves Google's (verified) email, if I have none and nobody else uses it.
// If my email is the same as Google's, it now counts as verified.
router.post("/google/connect", requireAuth, async (req, res) => {
    const { credential } = parse(GoogleLogin, req.body);
    const google = await verifyGoogleIdToken(credential);
    const email = google.email_verified && google.email ? google.email.toLowerCase() : null;

    const user = await withTransaction(async (db) => {
        const { rows: [owner] } = await db.query("SELECT id FROM users WHERE google_sub = $1", [google.sub]);
        if (owner && owner.id !== req.user.id) {
            throw new HttpError(409, "Det här Google-kontot är redan kopplat till ett annat konto.");
        }

        const { rows: [updated] } = await db.query(
            `UPDATE users
             SET google_sub = $1,
                 email = COALESCE(email, (SELECT $2::text WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = $2::text))),
                 email_verified = email_verified OR COALESCE(
                     COALESCE(email, (SELECT $2::text WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = $2::text))) = $2::text,
                     false
                 )
             WHERE id = $3 AND NOT is_child
             RETURNING ${USER_FIELDS}`,
            [google.sub, email, req.user.id]
        );
        if (!updated) throw new HttpError(401, "Kontot finns inte längre. Logga in igen.");
        return updated;
    });

    res.json({ user });
});

/* --- DELETE /api/auth/google → { user } - disconnect Google from my account --- */
router.delete("/google", requireAuth, async (req, res) => {
    const { rows: [current] } = await pool.query("SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1", [
        req.user.id,
    ]);
    if (!current) throw new HttpError(401, "Kontot finns inte längre. Logga in igen.");
    // Without a password, Google is the only way in
    if (!current.has_password) {
        throw new HttpError(400, "Du har inget lösenord, så utan Google skulle du inte kunna logga in.");
    }

    const { rows: [user] } = await pool.query(
        `UPDATE users SET google_sub = NULL WHERE id = $1 RETURNING ${USER_FIELDS}`,
        [req.user.id]
    );
    res.json({ user });
});

// "Anna" → "anna", or "anna4821" if that one is taken
async function freeUsername(db, wanted) {
    // "Åsa" → "asa": strip accents first, then everything a username can't contain
    let base = String(wanted)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 25);
    if (base.length < 3) base = `${base}user`.slice(0, 25);
    for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
        const { rowCount } = await db.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
        if (rowCount === 0) return candidate;
    }
    throw new HttpError(500, "Kunde inte hitta ett ledigt användarnamn. Försök igen.");
}

/* --- POST /api/auth/logout → 204 - removes the login cookie (JavaScript can't, it's httpOnly) --- */
router.post("/logout", (req, res) => {
    clearAuthCookie(res);
    res.status(204).end();
});

/* --- GET /api/auth/me → { user } - checks that the login still works --- */
router.get("/me", requireAuth, async (req, res) => {
    const { rows: [user] } = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [req.user.id]);
    if (!user) {
        clearAuthCookie(res);
        throw new HttpError(401, "Kontot finns inte längre. Logga in igen.");
    }
    // Logged in the old way (a token from localStorage): move the login into the cookie
    if (req.authFromHeader) setAuthCookie(res, user);
    res.json({ user });
});

/* --- PUT /api/auth/me  { name, username, avatarIcon, avatarColor } → { user } (+ the login cookie) - edit my profile --- */
// A new cookie, since the name and username are in the token
const EditProfile = z.object({ name, username, avatarIcon, avatarColor });

router.put("/me", requireAuth, async (req, res) => {
    const body = parse(EditProfile, req.body);
    try {
        const { rows: [user] } = await pool.query(
            `UPDATE users SET name = $1, username = $2, avatar_icon = $3, avatar_color = $4
             WHERE id = $5 RETURNING ${USER_FIELDS}`,
            [body.name, body.username, body.avatarIcon, body.avatarColor, req.user.id]
        );
        if (!user) throw new HttpError(401, "Kontot finns inte längre. Logga in igen.");
        setAuthCookie(res, user);
        res.json({ user });
    } catch (err) {
        if (err.code === "23505") throw new HttpError(409, "Användarnamnet är redan upptaget");
        throw err;
    }
});

/* --- PUT /api/auth/me/email  { email } → { user } - add my email (only if I have none) --- */
// Once set, the email can't be changed here. A typed-in email is unverified (see migration 016).
const EditEmail = z.object({ email });

router.put("/me/email", requireAuth, async (req, res) => {
    const body = parse(EditEmail, req.body);
    try {
        const { rows: [user] } = await pool.query(
            `UPDATE users SET email = $1, email_verified = false
             WHERE id = $2 AND NOT is_child AND email IS NULL RETURNING ${USER_FIELDS}`,
            [body.email, req.user.id]
        );
        if (!user) {
            const { rowCount } = await pool.query("SELECT 1 FROM users WHERE id = $1", [req.user.id]);
            if (!rowCount) throw new HttpError(401, "Kontot finns inte längre. Logga in igen.");
            throw new HttpError(409, "Du har redan en e-postadress, och den kan inte ändras.");
        }
        res.json({ user });
    } catch (err) {
        if (err.code === "23505") throw new HttpError(409, "Det finns redan ett konto med den e-postadressen");
        throw err;
    }
});

/* --- GET /api/auth/me/deletion → what deleting my account would mean - for the confirmation dialog --- */
router.get("/me/deletion", requireAuth, async (req, res) => {
    const plan = await planAccountDeletion(pool, req.user.id);
    res.json({
        children: plan.children.map((c) => c.name),
        lists: plan.lists.map((l) => l.title),
        emptyGroups: plan.emptyGroups.map((g) => g.name),
        keptGroups: plan.keptGroups.length,
        sharedGifts: plan.sharedGifts,
    });
});

/* --- DELETE /api/auth/me  { username } → 204 - delete my account (see _lib/deleteAccount.js) --- */
// The username is typed in as confirmation, so it can't happen by mistake
const DeleteMe = z.object({
    username: z.string({ error: "Skriv ditt användarnamn för att bekräfta" }).trim().toLowerCase().min(1, "Skriv ditt användarnamn för att bekräfta"),
});

router.delete("/me", requireAuth, async (req, res) => {
    const body = parse(DeleteMe, req.body ?? {});

    const { imageUrls } = await withTransaction(async (db) => {
        const { rows: [me] } = await db.query("SELECT username FROM users WHERE id = $1", [req.user.id]);
        if (!me) throw new HttpError(401, "Kontot finns inte längre.");
        if (me.username !== body.username.replace(/^@/, "")) {
            throw new HttpError(400, "Användarnamnet stämmer inte. Skriv ditt användarnamn för att bekräfta.");
        }
        const result = await deleteAccount(db, req.user.id);
        // Other people's children leave groups where none of their parents is left
        await syncChildGroups(db);
        return result;
    });

    clearAuthCookie(res);
    await removeUnusedImages(imageUrls, "ACCOUNT");
    res.status(204).end();
});

/* --- GET /api/auth/link/:token → { purpose, name, username } - who the link is for --- */
router.get("/link/:token", async (req, res) => {
    const { token } = req.params;
    if (!isTokenFormat(token)) throw new HttpError(404, LINK_INVALID);

    const { rows: [link] } = await pool.query(
        `SELECT ul.purpose, u.name, u.username
         FROM user_links ul
         JOIN users u ON u.id = ul.user_id
         WHERE ul.token_hash = $1 AND ul.used_at IS NULL AND ul.expires_at > now()`,
        [hashToken(token)]
    );
    if (!link) throw new HttpError(404, LINK_INVALID);

    res.json(link);
});

/* --- POST /api/auth/link/:token  { password } → { user } (+ the login cookie) - choose a password, and log in --- */
const ChoosePassword = z.object({ password });

router.post("/link/:token", async (req, res) => {
    const { token } = req.params;
    if (!isTokenFormat(token)) throw new HttpError(404, LINK_INVALID);
    const body = parse(ChoosePassword, req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await withTransaction(async (db) => {
        // Lock the link, so it can't be used twice at the same time
        const { rows: [link] } = await db.query(
            `SELECT ul.id, ul.user_id
             FROM user_links ul
             WHERE ul.token_hash = $1 AND ul.used_at IS NULL AND ul.expires_at > now()
             FOR UPDATE`,
            [hashToken(token)]
        );
        if (!link) throw new HttpError(404, LINK_INVALID);

        const { rows: [updated] } = await db.query(
            `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING ${USER_FIELDS}`,
            [passwordHash, link.user_id]
        );
        // This link - and any other open link for the same user - is now used up
        await db.query("UPDATE user_links SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [link.user_id]);
        return updated;
    });

    setAuthCookie(res, user);
    res.json({ user });
});

export default router;
