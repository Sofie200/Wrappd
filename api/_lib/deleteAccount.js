// "Radera mitt konto": what goes, what's handed over to someone else, and the deletion itself.
// Rule of thumb: what is only mine goes - what others share with me is handed over, so nobody else loses anything.
//
// Goes:
//  - my account, and my children where I'm the only parent (with their wish profiles)
//  - lists to only us (every recipient is me or one of those children), with their wishes
//  - lists I created that have no other admin
//    (others' gifts on those lists are kept - the database makes them gifts for an own event, migration 018)
//  - gifts only I am in, my wish profile, my links, my place in Secret Santa draws (ON DELETE CASCADE)
//  - groups where nobody else is left
// Handed over:
//  - lists I created that have another admin → that admin becomes the creator
//  - gifts I created that others share → one of them becomes the creator
//  - groups I created / was the only admin of → another member becomes creator / admin
// Children with another parent stay with that parent.

/** What would happen if userId deleted their account - also used for the confirmation dialog. */
export async function planAccountDeletion(db, userId) {
    // Me, and my children without another parent
    const { rows: soloChildren } = await db.query(
        `SELECT u.id, u.name FROM child_parents cp JOIN users u ON u.id = cp.child_id
         WHERE cp.parent_id = $1
           AND NOT EXISTS (SELECT 1 FROM child_parents o WHERE o.child_id = cp.child_id AND o.parent_id <> $1)
         ORDER BY u.name`,
        [userId]
    );
    const ids = [userId, ...soloChildren.map((c) => c.id)];

    // Lists that go: to only us, or created by me with no other admin
    const { rows: lists } = await db.query(
        `SELECT l.id, l.title FROM lists l
         WHERE (EXISTS (SELECT 1 FROM list_recipients r WHERE r.list_id = l.id)
                AND NOT EXISTS (SELECT 1 FROM list_recipients r WHERE r.list_id = l.id AND r.user_id <> ALL($1::int[])))
            OR (l.created_by = $2
                AND NOT EXISTS (SELECT 1 FROM list_admins a WHERE a.list_id = l.id AND a.user_id <> ALL($1::int[])))
         ORDER BY l.title`,
        [ids, userId]
    );

    // Groups I'm in (or created): no other adult left → go; otherwise kept.
    // (Other people's children can't stay in a group without a parent, so they don't count.)
    const { rows: groups } = await db.query(
        `SELECT g.id, g.name,
                (SELECT count(*)::int FROM group_members m JOIN users u ON u.id = m.user_id
                 WHERE m.group_id = g.id AND m.user_id <> ALL($1::int[]) AND NOT u.is_child) AS "othersLeft"
         FROM groups g
         WHERE g.created_by = $2 OR EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = $2)
         ORDER BY g.name`,
        [ids, userId]
    );

    // Gifts I'm in that others share too - they stay, without me
    const { rows: [{ count: sharedGifts }] } = await db.query(
        `SELECT count(DISTINCT gm.gift_id)::int AS count FROM gift_members gm
         WHERE gm.user_id = $1
           AND EXISTS (SELECT 1 FROM gift_members o WHERE o.gift_id = gm.gift_id AND o.user_id <> $1)`,
        [userId]
    );

    return {
        ids,
        children: soloChildren,
        lists,
        emptyGroups: groups.filter((g) => g.othersLeft === 0),
        keptGroups: groups.filter((g) => g.othersLeft > 0),
        sharedGifts,
    };
}

/** Deletes the account. Run inside a transaction. Returns the image URLs to delete once it's committed. */
export async function deleteAccount(db, userId) {
    // Lock me first, so the plan can't change underneath (e.g. a gift being shared at the same moment)
    await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const plan = await planAccountDeletion(db, userId);
    const { ids } = plan;
    const listIds = plan.lists.map((l) => l.id);
    const emptyGroupIds = plan.emptyGroups.map((g) => g.id);

    // Images: of the lists that go, of our wish profiles, and of gifts that go with me
    const { rows: images } = await db.query(
        `SELECT image_url FROM wishes
         WHERE (list_id = ANY($2::int[]) OR user_id = ANY($1::int[])) AND image_url IS NOT NULL
         UNION
         SELECT image_url FROM gifts g
         WHERE image_url IS NOT NULL
           AND (g.list_id = ANY($2::int[])
                OR (g.created_by = $3 AND NOT EXISTS (SELECT 1 FROM gift_members o WHERE o.gift_id = g.id AND o.user_id <> $3)))`,
        [ids, listIds, userId]
    );

    // Lists kept but created by me → another admin becomes the creator
    await db.query(
        `UPDATE lists l SET created_by = (
             SELECT a.user_id FROM list_admins a WHERE a.list_id = l.id AND a.user_id <> ALL($1::int[])
             ORDER BY a.user_id LIMIT 1)
         WHERE l.created_by = $2 AND NOT (l.id = ANY($3::int[]))`,
        [ids, userId, listIds]
    );

    // Shared gifts created by me → another member becomes the creator (otherwise they'd go by cascade)
    await db.query(
        `UPDATE gifts g SET created_by = (
             SELECT o.user_id FROM gift_members o WHERE o.gift_id = g.id AND o.user_id <> $1
             ORDER BY o.user_id LIMIT 1)
         WHERE g.created_by = $1 AND EXISTS (SELECT 1 FROM gift_members o WHERE o.gift_id = g.id AND o.user_id <> $1)`,
        [userId]
    );

    // Groups that are kept: a new creator if it was me, and an admin if none is left
    for (const g of plan.keptGroups) {
        const { rows: [heir] } = await db.query(
            `SELECT m.user_id, m.is_admin FROM group_members m JOIN users u ON u.id = m.user_id
             WHERE m.group_id = $1 AND m.user_id <> ALL($2::int[]) AND NOT u.is_child
             ORDER BY m.is_admin DESC, m.user_id LIMIT 1`,
            [g.id, ids]
        );
        await db.query("UPDATE groups SET created_by = $1 WHERE id = $2 AND created_by = $3", [heir.user_id, g.id, userId]);
        if (!heir.is_admin) {
            const { rowCount: adminsLeft } = await db.query(
                "SELECT 1 FROM group_members WHERE group_id = $1 AND is_admin AND user_id <> ALL($2::int[])",
                [g.id, ids]
            );
            if (!adminsLeft) {
                await db.query("UPDATE group_members SET is_admin = true WHERE group_id = $1 AND user_id = $2", [g.id, heir.user_id]);
            }
        }
    }

    await db.query("DELETE FROM lists WHERE id = ANY($1::int[])", [listIds]);
    await db.query("DELETE FROM list_groups WHERE group_id = ANY($1::int[])", [emptyGroupIds]); // no cascade on that key
    await db.query("DELETE FROM groups WHERE id = ANY($1::int[])", [emptyGroupIds]);
    await db.query("DELETE FROM users WHERE id = ANY($1::int[])", [ids]);

    return { imageUrls: images.map((r) => r.image_url) };
}
