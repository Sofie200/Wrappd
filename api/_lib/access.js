// Who may do what with a list. All permission rules for lists live here, in one place.
import { TODAY } from "../_db/pool.js";
import { HttpError } from "./http.js";

/**
 * Loads a list and the current user's role in it.
 * Throws 404 if the list doesn't exist OR the user may not see it – so nobody can find out
 * that a list exists by guessing ids.
 *
 * Rules:
 *  - Admins always see the list (also before it is public, and also if they are a recipient).
 *  - Others see it when it is public AND they are a member of one of its groups – but never recipients.
 *  - Recipients never see reservations, not even when they are admins.
 *  - Nothing can be changed or reserved once the list is archived (the day after end_date).
 */
export async function getListAccess(db, listId, userId) {
    const { rows: [list] } = await db.query(
        `SELECT l.id, l.title, l.description, l.end_date, l.is_public, l.published_at,
                l.end_date < ${TODAY} AS archived,
                EXISTS (SELECT 1 FROM list_admins WHERE list_id = l.id AND user_id = $2) AS is_admin,
                EXISTS (SELECT 1 FROM list_recipients WHERE list_id = l.id AND user_id = $2) AS is_recipient,
                EXISTS (SELECT 1 FROM list_groups lg
                        JOIN group_members gm ON gm.group_id = lg.group_id
                        WHERE lg.list_id = l.id AND gm.user_id = $2) AS in_group
         FROM lists l
         WHERE l.id = $1`,
        [listId, userId]
    );

    const canView = list && (list.is_admin || (list.is_public && list.in_group && !list.is_recipient));
    if (!canView) throw new HttpError(404, "Listan finns inte");

    return {
        list,
        isAdmin: list.is_admin,
        isRecipient: list.is_recipient,
        archived: list.archived,
        canEdit: list.is_admin && !list.archived,
        canReserve: !list.is_recipient && !list.archived,
        seesReservations: !list.is_recipient,
    };
}

export function requireEditor(access) {
    if (access.archived) throw new HttpError(403, "Listan är arkiverad och kan inte ändras");
    if (!access.isAdmin) throw new HttpError(403, "Bara listans admins kan göra det här");
}

export function requireReserver(access) {
    if (access.isRecipient) throw new HttpError(403, "Du kan inte reservera på en lista till dig själv");
    if (access.archived) throw new HttpError(403, "Listan är arkiverad och kan inte ändras");
}

/**
 * Checks the groups and people of a list before it is saved:
 *  - every group exists
 *  - groups that are ADDED must be groups the editor is a member of
 *  - every recipient and admin is a member of at least one of the list's groups
 */
export async function checkListPeople(db, editorId, { groupIds, recipientIds, adminIds }, currentGroupIds = []) {
    const { rows: groups } = await db.query("SELECT id FROM groups WHERE id = ANY($1::int[])", [groupIds]);
    if (groups.length !== groupIds.length) throw new HttpError(400, "En av grupperna finns inte");

    const added = groupIds.filter((id) => !currentGroupIds.includes(id));
    if (added.length > 0) {
        const { rows: [{ count }] } = await db.query(
            "SELECT count(*)::int AS count FROM group_members WHERE user_id = $1 AND group_id = ANY($2::int[])",
            [editorId, added]
        );
        if (count !== added.length) {
            throw new HttpError(403, "Du kan bara lägga till grupper som du själv är med i");
        }
    }

    const people = [...new Set([...recipientIds, ...adminIds])];
    const { rows: outside } = await db.query(
        `SELECT p.id FROM unnest($1::int[]) AS p(id)
         WHERE NOT EXISTS (SELECT 1 FROM group_members gm
                           WHERE gm.user_id = p.id AND gm.group_id = ANY($2::int[]))`,
        [people, groupIds]
    );
    if (outside.length > 0) {
        throw new HttpError(400, "Mottagare och admins måste vara med i någon av listans grupper");
    }
}
