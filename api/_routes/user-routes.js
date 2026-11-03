import { Router } from "express";
import { z } from "zod";
import { pool } from "../_db/pool.js";
import { parse } from "../_lib/http.js";

const router = Router();

const Search = z.object({
    q: z.string({ error: "Skriv något att söka på" }).trim().min(2, "Skriv minst 2 tecken").max(50, "Söktexten är för lång"),
    excludeGroupId: z.coerce.number().int().positive().optional(),
    exact: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

/* --- GET /api/users/search?q=anna&excludeGroupId=3&exact=true → { data: [{ id, name, username }] } --- */
// To protect people's privacy, you can't browse everyone who has an account. Two kinds of search:
//  - Without exact (as you type): only people I already share a group with, on part of their
//    name or username.
//  - exact=true (the "Sök" button): anyone, but only on their EXACT username (not case-sensitive) –
//    you have to know it.
// excludeGroupId hides people who are already in that group. Never children, never me.
router.get("/search", async (req, res) => {
    const { q, excludeGroupId, exact } = parse(Search, req.query);

    // $1 is the search text – the exact username, or a pattern for part of a name.
    // (Only parameters the query uses may be sent: Postgres can't tell the type of an unused one.)
    let text;
    let match;
    if (exact) {
        text = q.replace(/^@/, "").toLowerCase(); // usernames are stored in lower case
        match = "u.username = $1";
    } else {
        // % and _ are wildcards in ILIKE – escape them, so "50%" means the text "50%"
        text = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
        match = `(u.name ILIKE $1 OR u.username ILIKE $1)
                 AND EXISTS (SELECT 1 FROM group_members a
                             JOIN group_members b ON b.group_id = a.group_id AND b.user_id = $3
                             WHERE a.user_id = u.id)`;
    }

    const { rows } = await pool.query(
        `SELECT u.id, u.name, u.username, u.password_hash IS NOT NULL AS "isActivated"
         FROM users u
         WHERE NOT u.is_child -- children are managed by their parents, never added by search
           AND u.id <> $3
           AND ${match}
           AND ($2::int IS NULL OR u.id NOT IN (SELECT user_id FROM group_members WHERE group_id = $2))
         ORDER BY u.name, u.username
         LIMIT 10`,
        [text, excludeGroupId ?? null, req.user.id]
    );

    res.json({ data: rows });
});

export default router;
