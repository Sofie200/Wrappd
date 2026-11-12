// Who may do what with a list. All permission rules for lists live here, in one place.
import { TODAY } from "../_db/pool.js";
import { HttpError } from "./http.js";

/**
 * Loads a list and the current user's role in it.
 * Throws 404 if the list doesn't exist OR the user may not see it - so nobody can find out
 * that a list exists by guessing ids.
 *
 * Rules:
 *  - Admins always see the list (also before it is public, and also if they are a recipient).
 *  - Others see it when it is public AND they are a member of one of its groups - but never recipients.
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

/**
 * Loads a person's wish profile and the current user's role in it. 404 if it doesn't exist OR
 * I may not see it. Same shape as getListAccess, so wishes work the same on lists and profiles.
 *
 * Rules:
 *  - I see my own profile, my children's, and everyone's I share at least one group with.
 *  - I edit my own and my children's (children can't log in).
 *  - Everyone but the person themselves can reserve, and sees what is reserved - the person never does.
 *  - A profile is never archived.
 */
export async function getPersonAccess(db, personId, userId) {
    const { rows: [person] } = await db.query(
        `SELECT u.id, u.name, u.username, u.is_child, u.avatar_icon, u.avatar_color,
                u.wish_about, u.likes, u.dislikes,
                u.id = $2 AS is_self,
                EXISTS (SELECT 1 FROM child_parents WHERE child_id = u.id AND parent_id = $2) AS is_parent,
                EXISTS (SELECT 1 FROM group_members a
                        JOIN group_members b ON b.group_id = a.group_id AND b.user_id = $2
                        WHERE a.user_id = u.id) AS shares_group
         FROM users u
         WHERE u.id = $1`,
        [personId, userId]
    );

    const canView = person && (person.is_self || person.is_parent || person.shares_group);
    if (!canView) throw new HttpError(404, "Personen finns inte");

    const canEdit = person.is_self || person.is_parent;
    return {
        person,
        isAdmin: canEdit,
        isRecipient: person.is_self,
        archived: false,
        canEdit,
        canReserve: !person.is_self,
        seesReservations: !person.is_self,
    };
}

// A wish is on a list or on a person's profile - the access rules follow from that
export function getWishAccess(db, wish, userId) {
    return wish.list_id ? getListAccess(db, wish.list_id, userId) : getPersonAccess(db, wish.user_id, userId);
}

export function requireEditor(access) {
    if (access.archived) throw new HttpError(403, "Listan är arkiverad och kan inte ändras");
    if (!access.isAdmin) throw new HttpError(403, "Bara listans admins kan göra det här");
}

export function requireReserver(access) {
    if (access.isRecipient) throw new HttpError(403, "Du kan inte reservera något som är till dig själv");
    if (access.archived) throw new HttpError(403, "Listan är arkiverad och kan inte ändras");
}

/**
 * Checks the groups and people of a list before it is saved:
 *  - every group exists
 *  - groups that are ADDED must be groups the editor is a member of
 *  - every recipient and admin is a member of at least one of the list's groups
 *  - children are only recipients, never admins
 *  - only a child's parents can pick it as a recipient
 *  - a list to children is administered only by their parents
 */
export async function checkListPeople(
    db,
    editorId,
    { groupIds, recipientIds, adminIds },
    currentGroupIds = [],
    currentRecipientIds = []
) {
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

    // Children
    const { rows: childAdmins } = await db.query("SELECT id FROM users WHERE id = ANY($1::int[]) AND is_child", [adminIds]);
    if (childAdmins.length > 0) throw new HttpError(400, "Barn kan bara vara mottagare, inte admins");

    const { rows: children } = await db.query(
        `SELECT u.id, u.name, array_agg(cp.parent_id) AS "parentIds"
         FROM users u JOIN child_parents cp ON cp.child_id = u.id
         WHERE u.id = ANY($1::int[]) AND u.is_child
         GROUP BY u.id, u.name`,
        [recipientIds]
    );
    if (children.length === 0) return;

    // A child that is ADDED as a recipient must be my child. One already on the list may stay.
    for (const child of children) {
        if (!currentRecipientIds.includes(child.id) && !child.parentIds.includes(editorId)) {
            throw new HttpError(403, `Bara föräldrarna till ${child.name} kan göra listor till hen`);
        }
    }

    const parents = new Set(children.flatMap((c) => c.parentIds));
    if (adminIds.some((id) => !parents.has(id))) {
        throw new HttpError(400, "Listor till barn kan bara administreras av barnets föräldrar");
    }
}
