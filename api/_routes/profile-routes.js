import { Router } from "express";
import { pool, TODAY } from "../_db/pool.js";

const router = Router();

const RECIPIENTS = `(SELECT string_agg(u.name, ', ' ORDER BY u.name)
                     FROM list_recipients lr JOIN users u ON u.id = lr.user_id
                     WHERE lr.list_id = l.id)`;

/* --- GET /api/profile → { upcoming, reservations: { current, history }, adminLists } --- */
router.get("/", async (req, res) => {
    const me = req.user.id;

    const [upcoming, reservations, adminLists] = await Promise.all([
        // Coming events: public lists in my groups whose end date hasn't passed – also lists to me
        pool.query(
            `SELECT l.id, l.title, l.end_date AS "endDate",
                    EXISTS (SELECT 1 FROM list_admins WHERE list_id = l.id AND user_id = $1) AS "isAdmin",
                    EXISTS (SELECT 1 FROM list_recipients WHERE list_id = l.id AND user_id = $1) AS "isRecipient",
                    ${RECIPIENTS} AS recipients,
                    (SELECT string_agg(g.name, ', ' ORDER BY g.name)
                     FROM list_groups lg
                     JOIN groups g ON g.id = lg.group_id
                     JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
                     WHERE lg.list_id = l.id) AS groups
             FROM lists l
             WHERE l.is_public
               AND l.end_date >= ${TODAY}
               AND EXISTS (SELECT 1 FROM list_groups lg
                           JOIN group_members gm ON gm.group_id = lg.group_id
                           WHERE lg.list_id = l.id AND gm.user_id = $1)
             ORDER BY l.end_date, l.title`,
            [me]
        ),

        // My reservations, with the wish's price (the item's price, not a share)
        pool.query(
            `SELECT r.quantity, w.id AS "wishId", w.title, w.price, w.image_url AS "imageUrl",
                    l.id AS "listId", l.title AS "listTitle", l.end_date AS "endDate",
                    l.end_date < ${TODAY} AS archived,
                    ${RECIPIENTS} AS recipients
             FROM reservations r
             JOIN wishes w ON w.id = r.wish_id
             JOIN lists l ON l.id = w.list_id
             WHERE r.user_id = $1
             ORDER BY l.end_date DESC, l.title, w.title`,
            [me]
        ),

        // Lists I administer – private, public and archived
        pool.query(
            `SELECT l.id, l.title, l.end_date AS "endDate", l.is_public AS "isPublic",
                    l.end_date < ${TODAY} AS archived,
                    (SELECT count(*)::int FROM wishes WHERE list_id = l.id) AS "wishCount",
                    ${RECIPIENTS} AS recipients
             FROM lists l
             JOIN list_admins la ON la.list_id = l.id AND la.user_id = $1
             ORDER BY archived, l.end_date, l.title`,
            [me]
        ),
    ]);

    res.json({
        upcoming: upcoming.rows,
        reservations: {
            // Current: soonest event first. History: latest first.
            current: reservations.rows.filter((r) => !r.archived).reverse(),
            history: reservations.rows.filter((r) => r.archived),
        },
        adminLists: adminLists.rows,
    });
});

export default router;
