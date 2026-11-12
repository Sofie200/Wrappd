// Which groups a child is in is never chosen by hand - it follows from two rules:
//  1. A group with "Inkludera barn" (include_children) has ALL its members' children as members.
//     A group without it has no children at all.
//  2. A child is never in a group where none of its parents is a member.
//
// Call syncChildGroups(db) inside the transaction, after anything that changes who is in a group,
// who a child's parents are, or a group's include_children. It fixes every group in one go.
import { TODAY } from "../_db/pool.js";
import { HttpError } from "./http.js";

export async function syncChildGroups(db) {
    // Out: children in a group without the flag, or without any parent in it
    const { rows: removed } = await db.query(
        `DELETE FROM group_members gm
         USING users u, groups g
         WHERE gm.user_id = u.id AND u.is_child AND g.id = gm.group_id
           AND (NOT g.include_children
                OR NOT EXISTS (SELECT 1 FROM child_parents cp
                               JOIN group_members pm ON pm.user_id = cp.parent_id AND pm.group_id = gm.group_id
                               WHERE cp.child_id = u.id))
         RETURNING gm.user_id`
    );

    // In: every member's children, in every group with the flag
    await db.query(
        `INSERT INTO group_members (group_id, user_id)
         SELECT DISTINCT gm.group_id, cp.child_id
         FROM group_members gm
         JOIN groups g ON g.id = gm.group_id AND g.include_children
         JOIN child_parents cp ON cp.parent_id = gm.user_id
         ON CONFLICT DO NOTHING`
    );

    if (removed.length === 0) return;

    // A recipient must stay in one of the list's groups - stop (and roll back) instead of
    // leaving a child on a current list it no longer belongs to
    const { rows: [stranded] } = await db.query(
        `SELECT u.name, l.title
         FROM list_recipients lr
         JOIN users u ON u.id = lr.user_id
         JOIN lists l ON l.id = lr.list_id
         WHERE lr.user_id = ANY($1::int[]) AND l.end_date >= ${TODAY}
           AND NOT EXISTS (SELECT 1 FROM list_groups lg
                           JOIN group_members gm ON gm.group_id = lg.group_id AND gm.user_id = lr.user_id
                           WHERE lg.list_id = l.id)
         LIMIT 1`,
        [[...new Set(removed.map((r) => r.user_id))]]
    );
    if (stranded) {
        throw new HttpError(
            400,
            `${stranded.name} skulle lämna alla grupper på listan "${stranded.title}". ` +
                "Barnet måste vara kvar i någon av listans grupper så länge listan är aktuell."
        );
    }
}
