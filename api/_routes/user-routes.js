import { Router } from "express";
import { z } from "zod";
import { pool } from "../_db/pool.js";
import { parse } from "../_lib/http.js";

const router = Router();

const Search = z.object({
    q: z.string({ error: "Skriv något att söka på" }).trim().min(2, "Skriv minst 2 tecken").max(50, "Söktexten är för lång"),
    excludeGroupId: z.coerce.number().int().positive().optional(),
});

/* --- GET /api/users/search?q=anna&excludeGroupId=3 → { data: [{ id, name, username }] } --- */
// Searches both name and username. excludeGroupId hides people who are already in that group.
router.get("/search", async (req, res) => {
    const { q, excludeGroupId } = parse(Search, req.query);

    // % and _ are wildcards in ILIKE – escape them, so "50%" means the text "50%"
    const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

    const { rows } = await pool.query(
        `SELECT id, name, username, password_hash IS NOT NULL AS "isActivated"
         FROM users
         WHERE NOT is_child -- children are managed by their parents, never added by search
           AND (name ILIKE $1 OR username ILIKE $1)
           AND ($2::int IS NULL OR id NOT IN (SELECT user_id FROM group_members WHERE group_id = $2))
         ORDER BY name, username
         LIMIT 10`,
        [pattern, excludeGroupId ?? null]
    );

    res.json({ data: rows });
});

export default router;
