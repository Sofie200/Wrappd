import { Router } from "express";
import { pool, TODAY } from "../_db/pool.js";

const router = Router();

const RECIPIENTS = `(SELECT string_agg(u.name, ', ' ORDER BY u.name)
                     FROM list_recipients lr JOIN users u ON u.id = lr.user_id
                     WHERE lr.list_id = l.id)`;

/* --- GET /api/profile → { upcoming, gifts: { current, history }, adminLists } --- */
router.get("/", async (req, res) => {
    const me = req.user.id;

    const [upcoming, gifts, adminLists] = await Promise.all([
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

        // Gifts I share – on wishes, and bought outside the wish list. price is the total;
        // myShare is my custom amount, or the price split equally.
        // A gift outside the list without a list has its own recipient and date.
        pool.query(
            `SELECT g.id, g.title, g.quantity, g.price, g.comment, g.split,
                    g.wish_id IS NULL AS "offList",
                    CASE WHEN g.split = 'custom' THEN me.amount
                         ELSE round(g.price / (SELECT count(*) FROM gift_members WHERE gift_id = g.id), 2)
                    END AS "myShare",
                    (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM gift_members o
                     JOIN users u ON u.id = o.user_id
                     WHERE o.gift_id = g.id AND o.user_id <> $1) AS "sharedWith",
                    w.id AS "wishId", COALESCE(w.image_url, g.image_url) AS "imageUrl",
                    l.id AS "listId", l.title AS "listTitle",
                    COALESCE(l.end_date, g.gift_date) AS "endDate",
                    COALESCE(l.end_date, g.gift_date) < ${TODAY} AS archived,
                    COALESCE(${RECIPIENTS}, g.recipient) AS recipients
             FROM gift_members me
             JOIN gifts g ON g.id = me.gift_id
             LEFT JOIN wishes w ON w.id = g.wish_id
             LEFT JOIN lists l ON l.id = COALESCE(w.list_id, g.list_id)
             WHERE me.user_id = $1
             ORDER BY "endDate" DESC, l.title, g.title`,
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
        gifts: {
            // Current: soonest event first. History: latest first.
            current: gifts.rows.filter((g) => !g.archived).reverse(),
            history: gifts.rows.filter((g) => g.archived),
        },
        adminLists: adminLists.rows,
    });
});

export default router;
