// Children: users who can't log in, but can be recipients of lists.
// Rules:
//  - Anyone can create a child of their own, with an optional co-parent (any adult, by username).
//  - A child has 1–2 parents and is always a member of at least one group.
//  - Only parents manage the child: name, parents, and which of THEIR groups the child is in.
//  - Deleting a child deletes the lists where it is the only recipient – reservations included.
import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId } from "../_lib/http.js";
import { name } from "../_lib/userSchema.js";
import { removeWishImages } from "../_integrations/storageAdapter.js";

const router = Router();

const unique = (list) => [...new Set(list)];
const groupIds = z
    .array(z.coerce.number().int().positive(), { error: "Ogiltiga grupper" })
    .max(50)
    .transform(unique);
const usernameText = z.string().trim().toLowerCase().max(30, "Användarnamnet är för långt");

const NewChild = z.object({
    name,
    groupIds: groupIds.refine((ids) => ids.length > 0, "Välj minst en grupp"),
    coParentUsername: usernameText.optional().transform((v) => v || null),
});

const UpdateChild = z.object({
    name,
    // Only the editing parent's own groups – the child's other groups are kept as they are
    groupIds,
    parentUsernames: z
        .array(usernameText.min(1, "Ange ett användarnamn"), { error: "Ange barnets föräldrar" })
        .transform(unique)
        .refine((list) => list.length >= 1, "Barnet måste ha minst en förälder")
        .refine((list) => list.length <= 2, "Ett barn kan ha högst två föräldrar"),
});

// 404 if it isn't a child, or I'm not its parent – nobody else learns that it exists
async function requireParent(db, childId, userId) {
    const { rows: [child] } = await db.query(
        `SELECT u.id, u.name FROM users u
         JOIN child_parents cp ON cp.child_id = u.id AND cp.parent_id = $2
         WHERE u.id = $1 AND u.is_child
         FOR UPDATE OF u`,
        [childId, userId]
    );
    if (!child) throw new HttpError(404, "Barnet finns inte");
    return child;
}

async function myGroupIds(db, userId) {
    const { rows } = await db.query("SELECT group_id FROM group_members WHERE user_id = $1", [userId]);
    return rows.map((r) => r.group_id);
}

function requireOwnGroups(ids, mine) {
    if (ids.some((id) => !mine.includes(id))) {
        throw new HttpError(403, "Du kan bara lägga till barnet i grupper som du själv är med i");
    }
}

// Usernames → ids of adults (children have no username, so they can never be parents)
async function adultIds(db, usernames) {
    const { rows } = await db.query(
        "SELECT id, username FROM users WHERE username = ANY($1::text[]) AND NOT is_child",
        [usernames]
    );
    const missing = usernames.find((u) => !rows.some((r) => r.username === u));
    if (missing) throw new HttpError(404, `Det finns ingen användare med användarnamnet "${missing}"`);
    return usernames.map((u) => rows.find((r) => r.username === u).id);
}

/* --- GET /api/children → { data: [...] } – my children --- */
// Also counts what would be deleted with each child, for the warning before deleting.
router.get("/", async (req, res) => {
    const { rows } = await pool.query(
        `SELECT u.id, u.name,
                COALESCE((SELECT json_agg(json_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
                          FROM group_members gm JOIN groups g ON g.id = gm.group_id
                          WHERE gm.user_id = u.id), '[]') AS groups,
                (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'username', p.username,
                                                   'isActivated', p.password_hash IS NOT NULL) ORDER BY p.name)
                 FROM child_parents cp2 JOIN users p ON p.id = cp2.parent_id
                 WHERE cp2.child_id = u.id) AS parents,
                (SELECT count(*)::int FROM list_recipients WHERE user_id = u.id) AS "listCount",
                (SELECT count(*)::int FROM list_recipients lr
                 WHERE lr.user_id = u.id
                   AND NOT EXISTS (SELECT 1 FROM list_recipients o WHERE o.list_id = lr.list_id AND o.user_id <> u.id))
                    AS "listsDeletedWithChild",
                (SELECT count(*)::int FROM reservations r
                 JOIN wishes w ON w.id = r.wish_id
                 JOIN list_recipients lr ON lr.list_id = w.list_id AND lr.user_id = u.id
                 WHERE NOT EXISTS (SELECT 1 FROM list_recipients o WHERE o.list_id = lr.list_id AND o.user_id <> u.id))
                    AS "reservationsDeletedWithChild"
         FROM users u
         JOIN child_parents cp ON cp.child_id = u.id AND cp.parent_id = $1
         WHERE u.is_child
         ORDER BY u.name`,
        [req.user.id]
    );
    res.json({ data: rows });
});

/* --- POST /api/children  { name, groupIds, coParentUsername? } → { id } – I become a parent --- */
router.post("/", async (req, res) => {
    const body = parse(NewChild, req.body);

    const id = await withTransaction(async (db) => {
        requireOwnGroups(body.groupIds, await myGroupIds(db, req.user.id));

        const parentIds = [req.user.id];
        if (body.coParentUsername) {
            if (body.coParentUsername === req.user.username) {
                throw new HttpError(400, "Du är redan förälder – ange den andra förälderns användarnamn");
            }
            parentIds.push(...(await adultIds(db, [body.coParentUsername])));
        }

        const { rows: [child] } = await db.query(
            "INSERT INTO users (name, is_child, created_by) VALUES ($1, true, $2) RETURNING id",
            [body.name, req.user.id]
        );
        await db.query(
            "INSERT INTO child_parents (child_id, parent_id) SELECT $1, unnest($2::int[])",
            [child.id, parentIds]
        );
        await db.query(
            "INSERT INTO group_members (group_id, user_id) SELECT unnest($2::int[]), $1",
            [child.id, body.groupIds]
        );
        return child.id;
    });

    res.status(201).json({ id });
});

/* --- PUT /api/children/:id  { name, groupIds, parentUsernames } – edit (parent) --- */
router.put("/:id", async (req, res) => {
    const childId = parseId(req.params.id);
    const body = parse(UpdateChild, req.body);

    await withTransaction(async (db) => {
        await requireParent(db, childId, req.user.id);

        // Groups: I decide over MY groups. Groups only the co-parent is in are kept.
        const mine = await myGroupIds(db, req.user.id);
        requireOwnGroups(body.groupIds, mine);
        const { rows: current } = await db.query("SELECT group_id FROM group_members WHERE user_id = $1", [childId]);
        const kept = current.map((r) => r.group_id).filter((id) => !mine.includes(id));
        const finalGroups = unique([...kept, ...body.groupIds]);
        if (finalGroups.length === 0) throw new HttpError(400, "Barnet måste vara med i minst en grupp");

        // A recipient must be a member of one of the list's groups
        const { rows: [stranded] } = await db.query(
            `SELECT l.title FROM list_recipients lr JOIN lists l ON l.id = lr.list_id
             WHERE lr.user_id = $1
               AND NOT EXISTS (SELECT 1 FROM list_groups lg WHERE lg.list_id = l.id AND lg.group_id = ANY($2::int[]))`,
            [childId, finalGroups]
        );
        if (stranded) {
            throw new HttpError(400, `Barnet är mottagare på "${stranded.title}" och måste vara kvar i någon av listans grupper`);
        }

        const parentIds = await adultIds(db, body.parentUsernames);

        await db.query("UPDATE users SET name = $1 WHERE id = $2", [body.name, childId]);
        await db.query("DELETE FROM group_members WHERE user_id = $1", [childId]);
        await db.query("INSERT INTO group_members (group_id, user_id) SELECT unnest($2::int[]), $1", [childId, finalGroups]);
        await db.query("DELETE FROM child_parents WHERE child_id = $1", [childId]);
        await db.query("INSERT INTO child_parents (child_id, parent_id) SELECT $1, unnest($2::int[])", [childId, parentIds]);

        // Only parents may administer lists to children: someone who is no longer a parent
        // of any recipient on such a list stops being its admin.
        await db.query(
            `DELETE FROM list_admins la
             WHERE la.list_id IN (SELECT list_id FROM list_recipients WHERE user_id = $1)
               AND NOT EXISTS (SELECT 1 FROM list_recipients lr
                               JOIN child_parents cp ON cp.child_id = lr.user_id
                               WHERE lr.list_id = la.list_id AND cp.parent_id = la.user_id)`,
            [childId]
        );
        const { rows: [orphan] } = await db.query(
            `SELECT l.title FROM lists l
             WHERE l.id IN (SELECT list_id FROM list_recipients WHERE user_id = $1)
               AND NOT EXISTS (SELECT 1 FROM list_admins WHERE list_id = l.id)`,
            [childId]
        );
        if (orphan) {
            throw new HttpError(
                400,
                `"${orphan.title}" skulle stå utan admin. Gör en av de nya föräldrarna till admin för listan först.`
            );
        }
    });

    res.json({ id: childId });
});

/* --- DELETE /api/children/:id – delete the child, and the lists where it is the only recipient (parent) --- */
router.delete("/:id", async (req, res) => {
    const childId = parseId(req.params.id);

    const { imageUrls, listsDeleted } = await withTransaction(async (db) => {
        await requireParent(db, childId, req.user.id);

        const { rows: lists } = await db.query(
            `SELECT lr.list_id FROM list_recipients lr
             WHERE lr.user_id = $1
               AND NOT EXISTS (SELECT 1 FROM list_recipients o WHERE o.list_id = lr.list_id AND o.user_id <> $1)`,
            [childId]
        );
        const listIds = lists.map((r) => r.list_id);

        const { rows: images } = await db.query(
            "SELECT image_url FROM wishes WHERE list_id = ANY($1::int[]) AND image_url IS NOT NULL",
            [listIds]
        );

        // Lists, wishes and reservations go with ON DELETE CASCADE.
        // On lists with other recipients too, the child is just removed as a recipient (also by cascade).
        await db.query("DELETE FROM lists WHERE id = ANY($1::int[])", [listIds]);
        await db.query("DELETE FROM users WHERE id = $1", [childId]);

        return { imageUrls: images.map((r) => r.image_url), listsDeleted: listIds.length };
    });

    await removeWishImages(imageUrls).catch((err) => console.warn("[CHILD] Could not delete images:", err));
    res.json({ deleted: childId, listsDeleted });
});

export default router;
