import { TODAY } from "../_db/pool.js";

// Notifications ("notiser" - the bell in the top right). One row per recipient and event; see migration 023.
// Created inside the transaction that does the thing, so a notification never exists for something
// that was rolled back. Never to the one who did it (actorId), and never to children (they can't log in).
//
// Grouping: with `mergeInto`, an UNREAD notification of that type about the same thing (group, list,
// Secret Santa) is updated instead of a new one being added - its data gets `data` merged in, its
// count grows by `addCount`, and it moves to the top. E.g. "added to a group" + "made admin" = one
// notification, and "3 new wishes on the list" instead of three.

/**
 * @param {import("pg").PoolClient} db
 * @param {object} n
 * @param {number[]} n.userIds        who gets it
 * @param {string} n.type
 * @param {number|null} [n.actorId]   who did it - left out of userIds
 * @param {number|null} [n.groupId] @param {number|null} [n.listId] @param {number|null} [n.santaId]
 * @param {number|null} [n.giftId] @param {number|null} [n.personId]
 * @param {object} [n.data]
 * @param {object} [merge]
 * @param {string} [merge.mergeInto]  type of an unread notification to merge into
 * @param {number} [merge.addCount]   add to data.count (new rows start at this count)
 */
export async function notify(db, n, { mergeInto = null, addCount = 0 } = {}) {
    const { type, actorId = null, groupId = null, listId = null, santaId = null, giftId = null, personId = null } = n;
    const data = { ...(n.data ?? {}), ...(addCount ? { count: addCount } : {}) };

    // Adults only, not the one who did it
    const { rows } = await db.query(
        "SELECT id FROM users WHERE id = ANY($1::int[]) AND NOT is_child AND id IS DISTINCT FROM $2::int",
        [[...new Set((n.userIds ?? []).filter(Boolean))], actorId]
    );
    let userIds = rows.map((r) => r.id);
    if (userIds.length === 0) return;

    if (mergeInto) {
        const { rows: merged } = await db.query(
            `UPDATE notifications
             SET data = data || $3::jsonb
                        || CASE WHEN $4::int > 0
                                THEN jsonb_build_object('count', COALESCE((data->>'count')::int, 0) + $4::int)
                                ELSE '{}'::jsonb END,
                 actor_id = COALESCE($5::int, actor_id),
                 created_at = now()
             WHERE read_at IS NULL AND type = $2 AND user_id = ANY($1::int[])
               AND group_id IS NOT DISTINCT FROM $6::int AND list_id IS NOT DISTINCT FROM $7::int
               AND santa_id IS NOT DISTINCT FROM $8::int AND person_id IS NOT DISTINCT FROM $9::int
             RETURNING user_id`,
            [userIds, mergeInto, JSON.stringify(n.data ?? {}), addCount, actorId, groupId, listId, santaId, personId]
        );
        const done = new Set(merged.map((r) => r.user_id));
        userIds = userIds.filter((id) => !done.has(id));
        if (userIds.length === 0) return;
    }

    await db.query(
        `INSERT INTO notifications (user_id, type, actor_id, group_id, list_id, santa_id, gift_id, person_id, data)
         SELECT u, $2, $3, $4, $5, $6, $7, $8, $9::jsonb FROM unnest($1::int[]) AS u`,
        [userIds, type, actorId, groupId, listId, santaId, giftId, personId, JSON.stringify(data)]
    );
}

// Who sees a published list: adults in its groups who aren't its recipients
export async function listViewers(db, listId) {
    const { rows } = await db.query(
        `SELECT DISTINCT gm.user_id AS id
         FROM list_groups lg JOIN group_members gm ON gm.group_id = lg.group_id
         WHERE lg.list_id = $1
           AND NOT EXISTS (SELECT 1 FROM list_recipients WHERE list_id = $1 AND user_id = gm.user_id)`,
        [listId]
    );
    return rows.map((r) => r.id);
}

// Clean-up (the nightly cron job, api/_routes/cron-routes.js - and for one user when they open the panel):
//  - about a list, a Secret Santa or a gift: once its date is more than DATE_GRACE_DAYS behind us
//    (the gift's date is its list's, its Secret Santa's or its own event's)
//  - everything else (groups, invitations): read ones after 30 days, unread ones after 90
// userId: only that user's - null: everyone's. Returns how many were deleted.
const DATE_GRACE_DAYS = 7;

export async function cleanupNotifications(db, userId = null) {
    const { rowCount } = await db.query(
        `DELETE FROM notifications n
         WHERE ($1::int IS NULL OR n.user_id = $1)
           AND (
                COALESCE(
                    (SELECT end_date FROM lists WHERE id = n.list_id),
                    (SELECT event_date FROM secret_santas WHERE id = n.santa_id),
                    (SELECT COALESCE(l.end_date, s.event_date, e.event_date)
                     FROM gifts g
                     LEFT JOIN wishes w ON w.id = g.wish_id
                     LEFT JOIN lists l ON l.id = COALESCE(w.list_id, g.list_id)
                     LEFT JOIN secret_santas s ON s.id = g.santa_id
                     LEFT JOIN gift_events e ON e.id = g.event_id
                     WHERE g.id = n.gift_id)
                ) < ${TODAY} - $2::int
                OR (n.read_at IS NOT NULL AND n.created_at < now() - interval '30 days')
                OR n.created_at < now() - interval '90 days'
           )`,
        [userId, DATE_GRACE_DAYS]
    );
    return rowCount;
}
