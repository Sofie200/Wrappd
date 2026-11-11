// Children: users who can't log in, but can be recipients of lists.
// Rules:
//  - Anyone can create a child of their own, with an optional co-parent (any adult, by username).
//  - A child has 1–2 parents. Only parents manage the child: name and parents.
//  - Groups are never chosen: a child is in every group with "Inkludera barn" that one of its
//    parents is in, and in no other group (see _lib/childGroups.js).
//  - Deleting a child deletes the lists where it is the only recipient – gifts included.
import { Router } from "express";
import { z } from "zod";
import { pool, TODAY, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId } from "../_lib/http.js";
import { name } from "../_lib/userSchema.js";
import { syncChildGroups } from "../_lib/childGroups.js";
import { removeWishImages } from "../_integrations/storageAdapter.js";

const router = Router();

const unique = (list) => [...new Set(list)];
const usernameText = z.string().trim().toLowerCase().max(30, "Användarnamnet är för långt");

const NewChild = z.object({
    name,
    coParentUsername: usernameText.optional().transform((v) => v || null),
});

const UpdateChild = z.object({
    name,
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

/* --- GET /api/children → { data: [...] } – my children (groups = the child's, parentGroups = the parents', lists) --- */
// Also counts what would be deleted with each child, for the warning before deleting.
router.get("/", async (req, res) => {
    const { rows } = await pool.query(
        `SELECT u.id, u.name,
                COALESCE((SELECT json_agg(json_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
                          FROM group_members gm JOIN groups g ON g.id = gm.group_id
                          WHERE gm.user_id = u.id), '[]') AS groups,
                -- Every group one of the parents is in. The child is in exactly those with includeChildren.
                -- isMember: whether I'm in it myself (a co-parent's group I can't open)
                COALESCE((SELECT json_agg(json_build_object('id', g.id, 'name', g.name,
                                                            'includeChildren', g.include_children,
                                                            'isMember', EXISTS (SELECT 1 FROM group_members mm
                                                                                WHERE mm.group_id = g.id AND mm.user_id = $1))
                                          ORDER BY g.include_children DESC, g.name)
                          FROM groups g
                          WHERE EXISTS (SELECT 1 FROM group_members pm
                                        JOIN child_parents pc ON pc.parent_id = pm.user_id
                                        WHERE pm.group_id = g.id AND pc.child_id = u.id)), '[]') AS "parentGroups",
                (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'username', p.username,
                                                   'isActivated', p.password_hash IS NOT NULL OR p.google_sub IS NOT NULL) ORDER BY p.name)
                 FROM child_parents cp2 JOIN users p ON p.id = cp2.parent_id
                 WHERE cp2.child_id = u.id) AS parents,
                (SELECT count(*)::int FROM list_recipients WHERE user_id = u.id) AS "listCount",
                -- The lists the child is a recipient on
                COALESCE((SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'endDate', l.end_date,
                                                            'isPublic', l.is_public, 'archived', l.end_date < ${TODAY})
                                          ORDER BY l.end_date)
                          FROM list_recipients lr2 JOIN lists l ON l.id = lr2.list_id
                          WHERE lr2.user_id = u.id), '[]') AS lists,
                (SELECT count(*)::int FROM list_recipients lr
                 WHERE lr.user_id = u.id
                   AND NOT EXISTS (SELECT 1 FROM list_recipients o WHERE o.list_id = lr.list_id AND o.user_id <> u.id))
                    AS "listsDeletedWithChild",
                (SELECT count(*)::int FROM gifts g
                 JOIN wishes w ON w.id = g.wish_id
                 JOIN list_recipients lr ON lr.list_id = w.list_id AND lr.user_id = u.id
                 WHERE NOT EXISTS (SELECT 1 FROM list_recipients o WHERE o.list_id = lr.list_id AND o.user_id <> u.id))
                    AS "giftsDeletedWithChild"
         FROM users u
         JOIN child_parents cp ON cp.child_id = u.id AND cp.parent_id = $1
         WHERE u.is_child
         ORDER BY u.name`,
        [req.user.id]
    );
    res.json({ data: rows });
});

/* --- POST /api/children  { name, coParentUsername? } → { id } – I become a parent --- */
// The child joins every group with "Inkludera barn" that one of its parents is in
router.post("/", async (req, res) => {
    const body = parse(NewChild, req.body);

    const id = await withTransaction(async (db) => {
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
        await syncChildGroups(db);
        return child.id;
    });

    res.status(201).json({ id });
});

/* --- PUT /api/children/:id  { name, parentUsernames } – edit (parent) --- */
// New parents can change which groups the child is in – that follows automatically
router.put("/:id", async (req, res) => {
    const childId = parseId(req.params.id);
    const body = parse(UpdateChild, req.body);

    await withTransaction(async (db) => {
        await requireParent(db, childId, req.user.id);

        const parentIds = await adultIds(db, body.parentUsernames);

        await db.query("UPDATE users SET name = $1 WHERE id = $2", [body.name, childId]);
        await db.query("DELETE FROM child_parents WHERE child_id = $1", [childId]);
        await db.query("INSERT INTO child_parents (child_id, parent_id) SELECT $1, unnest($2::int[])", [childId, parentIds]);
        // The child's groups follow its (new) parents. Stops if it would leave a current list's groups.
        await syncChildGroups(db);

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
            // Wishes' images, and the images of gifts bought outside those lists (they go with the lists)
            // – and the images of the child's own wish profile
            `SELECT image_url FROM wishes WHERE (list_id = ANY($1::int[]) OR user_id = $2) AND image_url IS NOT NULL
             UNION ALL
             SELECT image_url FROM gifts WHERE list_id = ANY($1::int[]) AND image_url IS NOT NULL`,
            [listIds, childId]
        );

        // Lists, wishes and gifts go with ON DELETE CASCADE.
        // On lists with other recipients too, the child is just removed as a recipient (also by cascade).
        await db.query("DELETE FROM lists WHERE id = ANY($1::int[])", [listIds]);
        await db.query("DELETE FROM users WHERE id = $1", [childId]);

        return { imageUrls: images.map((r) => r.image_url), listsDeleted: listIds.length };
    });

    await removeWishImages(imageUrls).catch((err) => console.warn("[CHILD] Could not delete images:", err));
    res.json({ deleted: childId, listsDeleted });
});

export default router;
