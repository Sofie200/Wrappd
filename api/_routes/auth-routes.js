import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, withTransaction } from "../_db/pool.js";
import { requireAuth, signToken } from "../_middleware/auth.js";
import { HttpError, parse } from "../_lib/http.js";
import { name, password, username } from "../_lib/userSchema.js";
import { hashToken, isTokenFormat } from "../_lib/userLinks.js";

const router = Router();

const Register = z.object({ name, username, password });

const Login = z.object({
    username: z.string({ error: "Ange ditt användarnamn" }).trim().toLowerCase().min(1, "Ange ditt användarnamn"),
    password: z.string({ error: "Ange ditt lösenord" }).min(1, "Ange ditt lösenord"),
});

const LINK_INVALID = "Länken är ogiltig, redan använd eller har gått ut. Be en admin i din grupp om en ny länk.";

/* --- POST /api/auth/register  { name, username, password } → { token, user } --- */
router.post("/register", async (req, res) => {
    const body = parse(Register, req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);

    try {
        const { rows: [user] } = await pool.query(
            "INSERT INTO users (name, username, password_hash) VALUES ($1, $2, $3) RETURNING id, name, username",
            [body.name, body.username, passwordHash]
        );
        res.status(201).json({ token: signToken(user), user });
    } catch (err) {
        if (err.code === "23505") throw new HttpError(409, "Användarnamnet är redan upptaget");
        throw err;
    }
});

/* --- POST /api/auth/login  { username, password } → { token, user } --- */
router.post("/login", async (req, res) => {
    const body = parse(Login, req.body);

    const { rows: [user] } = await pool.query(
        "SELECT id, name, username, password_hash FROM users WHERE username = $1",
        [body.username]
    );
    // Same message whether the user exists, isn't activated yet, or the password is wrong –
    // don't reveal which usernames exist
    const ok = user?.password_hash && (await bcrypt.compare(body.password, user.password_hash));
    if (!ok) throw new HttpError(401, "Fel användarnamn eller lösenord");

    const safeUser = { id: user.id, name: user.name, username: user.username };
    res.json({ token: signToken(safeUser), user: safeUser });
});

/* --- GET /api/auth/me → { user } – checks that the saved token still works --- */
router.get("/me", requireAuth, async (req, res) => {
    const { rows: [user] } = await pool.query("SELECT id, name, username FROM users WHERE id = $1", [req.user.id]);
    if (!user) throw new HttpError(401, "Kontot finns inte längre. Logga in igen.");
    res.json({ user });
});

/* --- GET /api/auth/link/:token → { purpose, name, username } – who the link is for --- */
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

/* --- POST /api/auth/link/:token  { password } → { token, user } – choose a password, and log in --- */
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
            "UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, name, username",
            [passwordHash, link.user_id]
        );
        // This link – and any other open link for the same user – is now used up
        await db.query("UPDATE user_links SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [link.user_id]);
        return updated;
    });

    res.json({ token: signToken(user), user });
});

export default router;
