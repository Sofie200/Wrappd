import { Router } from "express";
import { pool, TODAY } from "../_db/pool.js";

const router = Router();

const RECIPIENTS = `(SELECT string_agg(u.name, ', ' ORDER BY u.name)
                     FROM list_recipients lr JOIN users u ON u.id = lr.user_id
                     WHERE lr.list_id = l.id)`;

/* --- GET /api/profile → { upcoming, gifts: { current, history }, adminLists, santas, profileEmpty } --- */
router.get("/", async (req, res) => {
    const me = req.user.id;

    const [upcoming, gifts, adminLists, santas, profile] = await Promise.all([
        // Coming events: public lists in my groups whose end date hasn't passed – also lists to me
        pool.query(
            `SELECT l.id, l.title, l.end_date AS "endDate",
                    EXISTS (SELECT 1 FROM list_admins WHERE list_id = l.id AND user_id = $1) AS "isAdmin",
                    EXISTS (SELECT 1 FROM list_recipients WHERE list_id = l.id AND user_id = $1) AS "isRecipient",
                    ${RECIPIENTS} AS recipients,
                    (SELECT count(*)::int FROM wishes WHERE list_id = l.id) AS "wishCount",
                    -- Fully reserved wishes – never for lists to me (that's a surprise)
                    CASE WHEN EXISTS (SELECT 1 FROM list_recipients WHERE list_id = l.id AND user_id = $1) THEN NULL
                         ELSE (SELECT count(*)::int FROM wishes w
                               WHERE w.list_id = l.id
                                 AND (SELECT COALESCE(sum(gi.quantity), 0) FROM gifts gi WHERE gi.wish_id = w.id) >= w.quantity)
                    END AS "reservedCount",
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
                    wo.id AS "personId",
                    COALESCE(l.end_date, g.gift_date) AS "endDate",
                    -- A gift from a wish profile has no date, so it stays current until it's removed
                    COALESCE(COALESCE(l.end_date, g.gift_date) < ${TODAY}, false) AS archived,
                    COALESCE(${RECIPIENTS}, g.recipient, wo.name) AS recipients
             FROM gift_members me
             JOIN gifts g ON g.id = me.gift_id
             LEFT JOIN wishes w ON w.id = g.wish_id
             LEFT JOIN users wo ON wo.id = w.user_id
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

        // Coming Secret Santas I take part in, or made. receiver = who *I* give to – never anyone else's pair.
        pool.query(
            `SELECT s.id, s.title, s.event_date AS "date", s.budget, g.name AS "groupName",
                    s.created_by = $1 AS "isCreator",
                    (SELECT count(*)::int FROM secret_santa_pairs WHERE santa_id = s.id) AS "participantCount",
                    (SELECT json_build_object('id', u.id, 'name', u.name,
                                              'avatarIcon', u.avatar_icon, 'avatarColor', u.avatar_color)
                     FROM secret_santa_pairs p JOIN users u ON u.id = p.receiver_id
                     WHERE p.santa_id = s.id AND p.giver_id = $1) AS receiver
             FROM secret_santas s
             JOIN groups g ON g.id = s.group_id
             WHERE s.event_date >= ${TODAY}
               AND (s.created_by = $1
                    OR EXISTS (SELECT 1 FROM secret_santa_pairs WHERE santa_id = s.id AND giver_id = $1))
             ORDER BY s.event_date, s.title`,
            [me]
        ),

        // Have I filled in my wish profile? (Nothing written, no categories and no wishes = empty)
        pool.query(
            `SELECT (wish_about IS NULL AND cardinality(likes) = 0 AND cardinality(dislikes) = 0
                     AND NOT EXISTS (SELECT 1 FROM wishes WHERE user_id = u.id)) AS empty
             FROM users u WHERE u.id = $1`,
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
        santas: santas.rows,
        profileEmpty: profile.rows[0]?.empty ?? false,
    });
});

export default router;
