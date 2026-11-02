import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId, todayInSweden } from "../_lib/http.js";
import { checkListPeople, getListAccess, requireEditor } from "../_lib/access.js";
import { WishBody } from "../_lib/wishSchema.js";
import { receiveImage } from "../_middleware/imageUpload.js";
import { removeWishImages } from "../_integrations/storageAdapter.js";
import { uploadNewWishImage } from "../_lib/wishImage.js";

const router = Router();

// The same message whether the field is missing, empty or broken
const ids = (message) => z.array(z.coerce.number().int().positive(), { error: message }).min(1, message).max(100);
const unique = (list) => [...new Set(list)];

const ListBody = z.object({
    title: z
        .string({ error: "Ange en titel" })
        .trim()
        .min(1, "Ange en titel")
        .max(120, "Titeln får vara högst 120 tecken"),
    description: z
        .string()
        .trim()
        .max(2000, "Beskrivningen får vara högst 2000 tecken")
        .nullish()
        .transform((v) => v || null),
    endDate: z.iso.date({ error: "Ange ett giltigt slutdatum" }),
    groupIds: ids("Välj minst en grupp").transform(unique),
    recipientIds: ids("Välj minst en mottagare").transform(unique),
    // Optional when creating (the creator is added anyway). Editing requires at least one – checked in PUT.
    adminIds: z
        .array(z.coerce.number().int().positive(), { error: "Ogiltiga admins" })
        .max(100)
        .default([])
        .transform(unique),
});

function requireFutureDate(endDate) {
    if (endDate < todayInSweden()) throw new HttpError(400, "Slutdatumet kan inte ha passerat");
}

async function replaceRows(db, table, listId, column, values) {
    await db.query(`DELETE FROM ${table} WHERE list_id = $1`, [listId]);
    await db.query(`INSERT INTO ${table} (list_id, ${column}) SELECT $1, unnest($2::int[])`, [listId, values]);
}

/* --- POST /api/lists  { title, description, endDate, groupIds, recipientIds, adminIds } → { id } --- */
// The creator always becomes admin. The list starts as private.
router.post("/", async (req, res) => {
    const body = parse(ListBody, req.body);
    requireFutureDate(body.endDate);
    const adminIds = unique([req.user.id, ...body.adminIds]);

    const id = await withTransaction(async (db) => {
        await checkListPeople(db, req.user.id, { ...body, adminIds });

        const { rows: [list] } = await db.query(
            "INSERT INTO lists (title, description, end_date, created_by) VALUES ($1, $2, $3, $4) RETURNING id",
            [body.title, body.description, body.endDate, req.user.id]
        );
        await replaceRows(db, "list_groups", list.id, "group_id", body.groupIds);
        await replaceRows(db, "list_admins", list.id, "user_id", adminIds);
        await replaceRows(db, "list_recipients", list.id, "user_id", body.recipientIds);
        return list.id;
    });

    res.status(201).json({ id });
});

/* --- GET /api/lists/:id → { list, me, groups, admins, recipients, wishes } --- */
// Recipients get the wishes WITHOUT anything about reservations.
router.get("/:id", async (req, res) => {
    const listId = parseId(req.params.id);
    const access = await getListAccess(pool, listId, req.user.id);
    const { list } = access;

    const [groups, admins, recipients, wishes] = await Promise.all([
        pool.query(
            `SELECT g.id, g.name FROM list_groups lg JOIN groups g ON g.id = lg.group_id
             WHERE lg.list_id = $1 ORDER BY g.name`,
            [listId]
        ),
        pool.query(
            `SELECT u.id, u.name, u.username FROM list_admins la JOIN users u ON u.id = la.user_id
             WHERE la.list_id = $1 ORDER BY u.name`,
            [listId]
        ),
        pool.query(
            `SELECT u.id, u.name, u.username, u.is_child AS "isChild" FROM list_recipients lr JOIN users u ON u.id = lr.user_id
             WHERE lr.list_id = $1 ORDER BY u.name`,
            [listId]
        ),
        pool.query(
            `SELECT id, title, description, price, url, image_url AS "imageUrl", quantity
             FROM wishes WHERE list_id = $1 ORDER BY created_at, id`,
            [listId]
        ),
    ]);

    let result = wishes.rows;
    if (access.seesReservations) {
        // Per gift: quantity and who shares it. Not the price, the split, or who created it.
        const { rows: gifts } = await pool.query(
            `SELECT g.id, g.wish_id, g.quantity,
                    array_agg(u.name ORDER BY u.name) AS names,
                    bool_or(u.id = $2) AS mine
             FROM gifts g
             JOIN wishes w ON w.id = g.wish_id
             JOIN gift_members gm ON gm.gift_id = g.id
             JOIN users u ON u.id = gm.user_id
             WHERE w.list_id = $1
             GROUP BY g.id
             ORDER BY g.created_at, g.id`,
            [listId, req.user.id]
        );
        result = result.map((wish) => {
            const own = gifts.filter((g) => g.wish_id === wish.id);
            const mine = own.find((g) => g.mine);
            return {
                ...wish,
                reserved: own.reduce((sum, g) => sum + g.quantity, 0),
                myGiftId: mine?.id ?? null,
                myQuantity: mine?.quantity ?? 0,
                gifts: own.map((g) => ({ quantity: g.quantity, names: g.names })),
            };
        });
    }

    res.json({
        list: {
            id: list.id,
            title: list.title,
            description: list.description,
            endDate: list.end_date,
            isPublic: list.is_public,
            publishedAt: list.published_at,
            archived: list.archived,
        },
        me: {
            isAdmin: access.isAdmin,
            isRecipient: access.isRecipient,
            canEdit: access.canEdit,
            canReserve: access.canReserve,
            seesReservations: access.seesReservations,
        },
        groups: groups.rows,
        admins: admins.rows,
        recipients: recipients.rows,
        wishes: result,
    });
});

/* --- PUT /api/lists/:id  { title, description, endDate, groupIds, recipientIds, adminIds } – edit (admin) --- */
// A public list can get more groups, but never lose any (it can't become private again).
router.put("/:id", async (req, res) => {
    const listId = parseId(req.params.id);
    const body = parse(ListBody, req.body);
    if (body.adminIds.length === 0) throw new HttpError(400, "Listan måste ha minst en admin");
    requireFutureDate(body.endDate);

    await withTransaction(async (db) => {
        await db.query("SELECT id FROM lists WHERE id = $1 FOR UPDATE", [listId]);
        const access = await getListAccess(db, listId, req.user.id);
        requireEditor(access);

        const { rows: current } = await db.query("SELECT group_id FROM list_groups WHERE list_id = $1", [listId]);
        const currentGroupIds = current.map((r) => r.group_id);

        if (access.list.is_public && currentGroupIds.some((id) => !body.groupIds.includes(id))) {
            throw new HttpError(400, "En publik lista kan inte tas bort från en grupp, bara få fler grupper");
        }

        const { rows: currentRecipients } = await db.query(
            "SELECT user_id FROM list_recipients WHERE list_id = $1",
            [listId]
        );
        await checkListPeople(db, req.user.id, body, currentGroupIds, currentRecipients.map((r) => r.user_id));

        await db.query(
            "UPDATE lists SET title = $1, description = $2, end_date = $3 WHERE id = $4",
            [body.title, body.description, body.endDate, listId]
        );
        await replaceRows(db, "list_groups", listId, "group_id", body.groupIds);
        await replaceRows(db, "list_admins", listId, "user_id", body.adminIds);
        await replaceRows(db, "list_recipients", listId, "user_id", body.recipientIds);
    });

    res.json({ id: listId });
});

/* --- POST /api/lists/:id/publish – make the list public for its groups (admin). Can't be undone. --- */
router.post("/:id/publish", async (req, res) => {
    const listId = parseId(req.params.id);
    const access = await getListAccess(pool, listId, req.user.id);
    requireEditor(access);

    await pool.query(
        "UPDATE lists SET is_public = true, published_at = COALESCE(published_at, now()) WHERE id = $1",
        [listId]
    );
    res.json({ id: listId, isPublic: true });
});

/* --- DELETE /api/lists/:id – only if nothing on it is reserved (admin, also when archived) --- */
router.delete("/:id", async (req, res) => {
    const listId = parseId(req.params.id);

    const imageUrls = await withTransaction(async (db) => {
        await db.query("SELECT id FROM lists WHERE id = $1 FOR UPDATE", [listId]);
        const access = await getListAccess(db, listId, req.user.id);
        if (!access.isAdmin) throw new HttpError(403, "Bara listans admins kan radera listan");

        const { rows: [{ count }] } = await db.query(
            `SELECT count(*)::int AS count FROM gifts g
             JOIN wishes w ON w.id = g.wish_id WHERE w.list_id = $1`,
            [listId]
        );
        if (count > 0) throw new HttpError(409, "Listan har reserverade gåvor och kan inte raderas");

        const { rows } = await db.query(
            // Wishes' images, and the images of gifts bought outside the list – they are deleted with it
            `SELECT image_url FROM wishes WHERE list_id = $1 AND image_url IS NOT NULL
             UNION ALL
             SELECT image_url FROM gifts WHERE list_id = $1 AND image_url IS NOT NULL`,
            [listId]
        );
        await db.query("DELETE FROM lists WHERE id = $1", [listId]);
        return rows.map((r) => r.image_url);
    });

    // After the list is gone: remove its images. A failure only leaves files behind.
    await removeWishImages(imageUrls).catch((err) => console.warn("[LIST] Could not delete images:", err));

    res.json({ deleted: listId });
});

/* --- POST /api/lists/:id/wishes  (multipart: title, description, price, url, quantity, image) → { id } --- */
router.post("/:id/wishes", receiveImage, async (req, res) => {
    const listId = parseId(req.params.id);
    const access = await getListAccess(pool, listId, req.user.id);
    requireEditor(access);
    const body = parse(WishBody, req.body ?? {});

    // 1. The image first – an uploaded file, or a copy of the shop's image.
    //    If that fails, nothing is saved and the user can try again.
    const imageUrl = await uploadNewWishImage(listId, req.file, body.imageFromUrl);

    // 2. Then the wish. If it fails, remove the image again so it isn't left without a wish.
    try {
        const { rows: [wish] } = await pool.query(
            `INSERT INTO wishes (list_id, title, description, price, url, image_url, quantity)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [listId, body.title, body.description, body.price, body.url, imageUrl, body.quantity]
        );
        res.status(201).json({ id: wish.id });
    } catch (err) {
        if (imageUrl) await removeWishImages([imageUrl]).catch(() => {});
        throw err;
    }
});

export default router;
