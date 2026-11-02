import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../_db/pool.js";
import { requireAuth, signToken } from "../_middleware/auth.js";
import { HttpError, parse } from "../_lib/http.js";

const router = Router();

const Register = z.object({
    name: z
        .string({ error: "Ange ditt namn" })
        .trim()
        .min(1, "Ange ditt namn")
        .max(80, "Namnet får vara högst 80 tecken"),
    username: z
        .string({ error: "Ange ett användarnamn" })
        .trim()
        .toLowerCase()
        .regex(
            /^[a-z0-9._-]{3,30}$/,
            "Användarnamnet ska vara 3–30 tecken: a–z, siffror, punkt, bindestreck eller understreck"
        ),
    password: z
        .string({ error: "Ange ett lösenord" })
        .min(8, "Lösenordet ska vara minst 8 tecken")
        .max(200, "Lösenordet får vara högst 200 tecken"),
});

const Login = z.object({
    username: z.string({ error: "Ange ditt användarnamn" }).trim().toLowerCase().min(1, "Ange ditt användarnamn"),
    password: z.string({ error: "Ange ditt lösenord" }).min(1, "Ange ditt lösenord"),
});

/* --- POST /api/auth/register  { name, username, password } → { token, user } --- */
router.post("/register", async (req, res) => {
    const { name, username, password } = parse(Register, req.body);
    const passwordHash = await bcrypt.hash(password, 10);

    try {
        const { rows: [user] } = await pool.query(
            "INSERT INTO users (name, username, password_hash) VALUES ($1, $2, $3) RETURNING id, name, username",
            [name, username, passwordHash]
        );
        res.status(201).json({ token: signToken(user), user });
    } catch (err) {
        if (err.code === "23505") throw new HttpError(409, "Användarnamnet är redan upptaget");
        throw err;
    }
});

/* --- POST /api/auth/login  { username, password } → { token, user } --- */
router.post("/login", async (req, res) => {
    const { username, password } = parse(Login, req.body);

    const { rows: [user] } = await pool.query(
        "SELECT id, name, username, password_hash FROM users WHERE username = $1",
        [username]
    );
    // Same message whether the user exists or not – don't reveal which usernames are taken
    const ok = user && (await bcrypt.compare(password, user.password_hash));
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

export default router;
