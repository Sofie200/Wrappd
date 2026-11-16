// A shared list (wrappd.se/s/<token>): anyone with the link sees the list's wishes and whether they're
// free or reserved - never who reserved them, and nothing about prices people paid or gifts outside the list.
// Reserving happens in the app: logged in, and in one of the list's groups (or an admin) - the page links there.
// Only published lists can be shared; the link stops working if the admin makes a new one or stops sharing.
import { Router } from "express";
import { pool, TODAY } from "../_db/pool.js";
import { HttpError } from "../_lib/http.js";

const router = Router();

/* --- GET /api/share/:token → { list, recipients, wishes, me } - open to everyone (optionalAuth) --- */
router.get("/:token", async (req, res) => {
    const token = String(req.params.token ?? "");
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) throw new HttpError(404, "Länken fungerar inte");
    const userId = req.user?.id ?? null;

    const { rows: [list] } = await pool.query(
        `SELECT l.id, l.title, l.description, l.end_date AS "endDate", l.end_date < ${TODAY} AS archived,
                -- Logged in: may I open it in the app and reserve? (the same rule as getListAccess)
                CASE WHEN $2::int IS NULL THEN false
                     ELSE EXISTS (SELECT 1 FROM list_admins WHERE list_id = l.id AND user_id = $2)
                          OR (EXISTS (SELECT 1 FROM list_groups lg
                                      JOIN group_members gm ON gm.group_id = lg.group_id
                                      WHERE lg.list_id = l.id AND gm.user_id = $2)
                              AND NOT EXISTS (SELECT 1 FROM list_recipients WHERE list_id = l.id AND user_id = $2))
                END AS "canOpen",
                $2::int IS NOT NULL
                    AND EXISTS (SELECT 1 FROM list_recipients WHERE list_id = l.id AND user_id = $2) AS "isRecipient"
         FROM lists l
         WHERE l.share_token = $1 AND l.is_public`,
        [token, userId]
    );
    if (!list) throw new HttpError(404, "Länken fungerar inte. Den kan ha bytts ut, eller så delas listan inte längre.");

    const [recipients, wishes] = await Promise.all([
        pool.query(
            `SELECT u.name FROM list_recipients lr JOIN users u ON u.id = lr.user_id
             WHERE lr.list_id = $1 ORDER BY u.name`,
            [list.id]
        ),
        // How many of each wish are reserved - not by whom
        pool.query(
            `SELECT w.id, w.title, w.description, w.price, w.url, w.image_url AS "imageUrl", w.quantity,
                    COALESCE((SELECT sum(g.quantity) FROM gifts g WHERE g.wish_id = w.id), 0)::int AS reserved
             FROM wishes w WHERE w.list_id = $1
             ORDER BY w.created_at, w.id`,
            [list.id]
        ),
    ]);

    res.json({
        list: {
            id: list.id,
            title: list.title,
            description: list.description,
            endDate: list.endDate,
            archived: list.archived,
        },
        recipients: recipients.rows.map((r) => r.name),
        wishes: wishes.rows,
        me: { loggedIn: userId !== null, canOpen: list.canOpen, isRecipient: list.isRecipient },
    });
});

export default router;
