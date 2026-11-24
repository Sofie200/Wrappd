// Notifications - the bell in the top right. Created by the routes where things happen (_lib/notify.js);
// here they're read and marked as read. Old ones are deleted by the nightly cron job (cron-routes.js) -
// and, for the user, when they open the list (so nothing out of date shows even if the job hasn't run).
import { Router } from "express";
import { z } from "zod";
import { pool } from "../_db/pool.js";
import { parse } from "../_lib/http.js";
import { cleanupNotifications } from "../_lib/notify.js";

const router = Router();

const LIMIT = 50;

/* --- GET /api/notifications → { data, unread } - the latest 50 --- */
// Each with what it's about, by id and name/title - looked up now, so a renamed group shows its new name
router.get("/", async (req, res) => {
    await cleanupNotifications(pool, req.user.id);
    const { rows } = await pool.query(
        `SELECT n.id, n.type, n.data, n.read_at IS NOT NULL AS read, n.created_at AS "createdAt", n.gift_id AS "giftId",
                CASE WHEN a.id IS NOT NULL THEN json_build_object('id', a.id, 'name', a.name,
                     'avatarIcon', a.avatar_icon, 'avatarColor', a.avatar_color) END AS actor,
                CASE WHEN g.id IS NOT NULL THEN json_build_object('id', g.id, 'name', g.name) END AS "group",
                CASE WHEN l.id IS NOT NULL THEN json_build_object('id', l.id, 'title', l.title,
                     'recipients', (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM list_recipients lr
                                    JOIN users u ON u.id = lr.user_id WHERE lr.list_id = l.id)) END AS list,
                CASE WHEN s.id IS NOT NULL THEN json_build_object('id', s.id, 'title', s.title, 'date', s.event_date) END AS santa,
                CASE WHEN p.id IS NOT NULL THEN json_build_object('id', p.id, 'name', p.name) END AS person,
                gi.title AS "giftTitle"
         FROM notifications n
         LEFT JOIN users a ON a.id = n.actor_id
         LEFT JOIN groups g ON g.id = n.group_id
         LEFT JOIN lists l ON l.id = n.list_id
         LEFT JOIN secret_santas s ON s.id = n.santa_id
         LEFT JOIN users p ON p.id = n.person_id
         LEFT JOIN gifts gi ON gi.id = n.gift_id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT $2`,
        [req.user.id, LIMIT]
    );
    res.json({ data: rows, unread: rows.filter((r) => !r.read).length });
});

/* --- GET /api/notifications/unread → { count } - for the number on the bell (fetched every minute) --- */
router.get("/unread", async (req, res) => {
    const { rows: [{ count }] } = await pool.query(
        "SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
        [req.user.id]
    );
    res.json({ count });
});

/* --- POST /api/notifications/read  { ids? } → { count } - mark as read: these, or all of mine --- */
const ReadBody = z.object({ ids: z.array(z.coerce.number().int().positive()).max(200).optional() });

router.post("/read", async (req, res) => {
    const { ids } = parse(ReadBody, req.body ?? {});
    await pool.query(
        `UPDATE notifications SET read_at = now()
         WHERE user_id = $1 AND read_at IS NULL AND ($2::int[] IS NULL OR id = ANY($2::int[]))`,
        [req.user.id, ids ?? null]
    );
    const { rows: [{ count }] } = await pool.query(
        "SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
        [req.user.id]
    );
    res.json({ count });
});

export default router;
