import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pool, TODAY, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId, todayInSweden } from "../_lib/http.js";
import { checkListPeople, getListAccess, requireEditor } from "../_lib/access.js";
import { WishBody, MAX_WISHES_PER_LIST, TOO_MANY_WISHES } from "../_lib/wishSchema.js";
import { receiveImage } from "../_middleware/imageUpload.js";
import { removeWishImages } from "../_integrations/storageAdapter.js";
import { removeUnusedImages } from "../_lib/imageCleanup.js";
import { uploadNewWishImage } from "../_lib/wishImage.js";
import { listViewers, notify } from "../_lib/notify.js";

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
    // Optional when creating (the creator is added anyway). Editing requires at least one - checked in PUT.
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
        // Notification: the other admins (the list is private - only admins see it yet)
        await notify(db, { userIds: adminIds, type: "list_admin", actorId: req.user.id, listId: list.id });
        return list.id;
    });

    res.status(201).json({ id });
});

/* --- GET /api/lists/:id → { list, me, groups, admins, recipients, wishes, myGifts } --- */
// Recipients get the wishes WITHOUT anything about reservations.
router.get("/:id", async (req, res) => {
    const listId = parseId(req.params.id);
    const access = await getListAccess(pool, listId, req.user.id);
    const { list } = access;

    // I'm looking at the list now: "new wishes since I last looked" is read
    await pool.query(
        `UPDATE notifications SET read_at = now()
         WHERE user_id = $1 AND list_id = $2 AND type = 'list_wishes' AND read_at IS NULL`,
        [req.user.id, listId]
    );

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
        // Per gift: quantity and who shares it (with their profile icon). Not the price, the split, or who created it.
        const { rows: gifts } = await pool.query(
            `SELECT g.id, g.wish_id, g.quantity,
                    array_agg(u.name ORDER BY u.name) AS names,
                    json_agg(json_build_object('id', u.id, 'name', u.name,
                                               'avatarIcon', u.avatar_icon, 'avatarColor', u.avatar_color)
                             ORDER BY u.name) AS people,
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
                gifts: own.map((g) => ({ quantity: g.quantity, names: g.names, people: g.people })),
            };
        });
    }

    // My own gifts (bought outside the list) linked to this list - shown in a section of their own,
    // only to me and those I share them with. Never to recipients (they can't have any here anyway).
    const { rows: myGifts } = access.seesReservations
        ? await pool.query(
              `SELECT g.id, g.title, g.quantity, g.price, g.image_url AS "imageUrl",
                      true AS "offList", g.list_id AS "listId",
                      $3::boolean AS archived,
                      CASE WHEN g.split = 'custom' THEN me.amount
                           ELSE round(g.price / (SELECT count(*) FROM gift_members WHERE gift_id = g.id), 2)
                      END AS "myShare",
                      (SELECT json_agg(json_build_object('id', u.id, 'name', u.name,
                                                         'avatarIcon', u.avatar_icon, 'avatarColor', u.avatar_color)
                                       ORDER BY u.name)
                       FROM gift_members o JOIN users u ON u.id = o.user_id
                       WHERE o.gift_id = g.id) AS people
               FROM gift_members me
               JOIN gifts g ON g.id = me.gift_id
               WHERE me.user_id = $1 AND g.list_id = $2 AND g.wish_id IS NULL
               ORDER BY g.created_at, g.id`,
              [req.user.id, listId, list.archived]
          )
        : { rows: [] };

    res.json({
        list: {
            id: list.id,
            title: list.title,
            description: list.description,
            endDate: list.end_date,
            isPublic: list.is_public,
            publishedAt: list.published_at,
            archived: list.archived,
            // The secret share link's token - only to admins (null = not shared)
            shareToken: access.isAdmin ? list.share_token : null,
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
        myGifts,
    });
});

/* --- PUT /api/lists/:id  { title, description, endDate, groupIds, recipientIds, adminIds } - edit (admin) --- */
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
        // Before the change - to notify only those who are new
        const { rows: currentAdmins } = await db.query("SELECT user_id FROM list_admins WHERE list_id = $1", [listId]);
        const viewersBefore = access.list.is_public ? await listViewers(db, listId) : [];
        await checkListPeople(db, req.user.id, body, currentGroupIds, currentRecipients.map((r) => r.user_id));

        await db.query(
            "UPDATE lists SET title = $1, description = $2, end_date = $3 WHERE id = $4",
            [body.title, body.description, body.endDate, listId]
        );
        await replaceRows(db, "list_groups", listId, "group_id", body.groupIds);
        await replaceRows(db, "list_admins", listId, "user_id", body.adminIds);
        await replaceRows(db, "list_recipients", listId, "user_id", body.recipientIds);

        // Notifications. A published list that got new groups: "new list" to those who now see it.
        if (access.list.is_public) {
            const before = new Set(viewersBefore);
            const newViewers = (await listViewers(db, listId)).filter((id) => !before.has(id));
            await notify(db, { userIds: newViewers, type: "list_new", actorId: req.user.id, listId });
        }
        // New admins - grouped with an unread "new list" about the same list, if there is one
        const wereAdmins = new Set(currentAdmins.map((r) => r.user_id));
        await notify(
            db,
            { userIds: body.adminIds.filter((id) => !wereAdmins.has(id)), type: "list_admin", actorId: req.user.id, listId, data: { admin: true } },
            { mergeInto: "list_new" }
        );
    });

    res.json({ id: listId });
});

/* --- POST /api/lists/:id/share → { shareToken } - share a published list with a secret link (admin) --- */
// Anyone with the link sees the wishes and whether they're free or reserved (see share-routes.js).
// Called again: a NEW link - the old one stops working.
router.post("/:id/share", async (req, res) => {
    const listId = parseId(req.params.id);
    const access = await getListAccess(pool, listId, req.user.id);
    requireEditor(access);
    if (!access.list.is_public) throw new HttpError(400, "Publicera listan innan du delar den");

    const shareToken = randomBytes(12).toString("base64url"); // 16 characters, impossible to guess
    await pool.query("UPDATE lists SET share_token = $1 WHERE id = $2", [shareToken, listId]);
    res.json({ shareToken });
});

/* --- DELETE /api/lists/:id/share - stop sharing: the link stops working (admin) --- */
router.delete("/:id/share", async (req, res) => {
    const listId = parseId(req.params.id);
    const access = await getListAccess(pool, listId, req.user.id);
    if (!access.isAdmin) throw new HttpError(403, "Bara listans admins kan ändra delningen");
    await pool.query("UPDATE lists SET share_token = NULL WHERE id = $1", [listId]);
    res.json({ shareToken: null });
});

/* --- POST /api/lists/:id/publish - make the list public for its groups (admin). Can't be undone. --- */
router.post("/:id/publish", async (req, res) => {
    const listId = parseId(req.params.id);
    const access = await getListAccess(pool, listId, req.user.id);
    requireEditor(access);

    // A list whose only group was deleted has no groups left - it needs new ones before anyone can see it
    const { rows: [{ count }] } = await pool.query(
        "SELECT count(*)::int AS count FROM list_groups WHERE list_id = $1",
        [listId]
    );
    if (count === 0) throw new HttpError(400, "Välj minst en grupp för listan innan du publicerar den");

    await withTransaction(async (db) => {
        const { rowCount: published } = await db.query(
            "UPDATE lists SET is_public = true, published_at = COALESCE(published_at, now()) WHERE id = $1 AND NOT is_public",
            [listId]
        );
        // Notification "new list" to those who see it now - not its admins, they already know about it
        if (published) {
            const { rows: admins } = await db.query("SELECT user_id FROM list_admins WHERE list_id = $1", [listId]);
            const adminIds = new Set(admins.map((r) => r.user_id));
            const viewers = (await listViewers(db, listId)).filter((id) => !adminIds.has(id));
            await notify(db, { userIds: viewers, type: "list_new", actorId: req.user.id, listId });
        }
    });
    res.json({ id: listId, isPublic: true });
});

/* --- DELETE /api/lists/:id - delete the list (admin, also when archived) --- */
// Gifts on it are NOT deleted: the database turns them into gifts for an own event (the list's name, date and
// recipients - see migration 018), so those who bought something keep it. Their images stay too.
router.delete("/:id", async (req, res) => {
    const listId = parseId(req.params.id);

    const imageUrls = await withTransaction(async (db) => {
        await db.query("SELECT id FROM lists WHERE id = $1 FOR UPDATE", [listId]);
        const access = await getListAccess(db, listId, req.user.id);
        if (!access.isAdmin) throw new HttpError(403, "Bara listans admins kan radera listan");

        const { rows } = await db.query(
            // The wishes' images - deleted afterwards unless a gift now uses them
            "SELECT image_url FROM wishes WHERE list_id = $1 AND image_url IS NOT NULL",
            [listId]
        );
        await db.query("DELETE FROM lists WHERE id = $1", [listId]);
        return rows.map((r) => r.image_url);
    });

    // After the list is gone: remove the images no gift kept. A failure only leaves files behind.
    await removeUnusedImages(imageUrls, "LIST");

    res.json({ deleted: listId });
});

/* --- POST /api/lists/:id/wishes  (multipart: title, description, price, url, quantity, image) → { id } --- */
router.post("/:id/wishes", receiveImage, async (req, res) => {
    const listId = parseId(req.params.id);
    const access = await getListAccess(pool, listId, req.user.id);
    requireEditor(access);
    const body = parse(WishBody, req.body ?? {});

    // 0. Full already? Then don't even upload the image
    if ((await countWishes(pool, listId)) >= MAX_WISHES_PER_LIST) throw new HttpError(409, TOO_MANY_WISHES);

    // 1. The image first - an uploaded file, or a copy of the shop's image.
    //    If that fails, nothing is saved and the user can try again.
    const imageUrl = await uploadNewWishImage(listId, req.file, body.imageFromUrl);

    // 2. Then the wish. If it fails, remove the image again so it isn't left without a wish.
    //    The list is locked while counting, so two wishes added at the same time can't both become number 50.
    try {
        const wish = await withTransaction(async (db) => {
            await db.query("SELECT id FROM lists WHERE id = $1 FOR UPDATE", [listId]);
            if ((await countWishes(db, listId)) >= MAX_WISHES_PER_LIST) throw new HttpError(409, TOO_MANY_WISHES);
            const { rows: [created] } = await db.query(
                `INSERT INTO wishes (list_id, title, description, price, url, image_url, quantity)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [listId, body.title, body.description, body.price, body.url, imageUrl, body.quantity]
            );
            await notifyNewWishes(db, access.list, req.user.id, 1);
            return created;
        });
        res.status(201).json({ id: wish.id });
    } catch (err) {
        if (imageUrl) await removeWishImages([imageUrl]).catch(() => {});
        throw err;
    }
});

/* --- GET /api/lists/:id/copy-targets → { data } - the lists this list's wishes can be copied to (admin) --- */
// Lists I'm admin of that aren't archived - not this one
router.get("/:id/copy-targets", async (req, res) => {
    const listId = parseId(req.params.id);
    const access = await getListAccess(pool, listId, req.user.id);
    if (!access.isAdmin) throw new HttpError(403, "Bara listans admins kan kopiera önskningar");

    const { rows } = await pool.query(
        `SELECT l.id, l.title, l.end_date AS "endDate", l.is_public AS "isPublic",
                (SELECT count(*)::int FROM wishes WHERE list_id = l.id) AS "wishCount",
                (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM list_recipients lr
                 JOIN users u ON u.id = lr.user_id WHERE lr.list_id = l.id) AS recipients
         FROM lists l
         JOIN list_admins la ON la.list_id = l.id AND la.user_id = $1
         WHERE l.id <> $2 AND l.end_date >= ${TODAY}
         ORDER BY l.end_date, l.title`,
        [req.user.id, listId]
    );
    res.json({ data: rows });
});

/* --- POST /api/lists/:id/copy  { targetListId, onlyUnreserved } → { copied } - copy wishes to another list --- */
// Admin of both lists; the source may be archived (e.g. last year's list), the target may not.
// The copies are new wishes: no reservations follow. The images are shared with the originals -
// an image is only deleted when no wish or gift uses it (removeUnusedImages).
// onlyUnreserved: only what's left to reserve - a wish with 3, of which 1 is reserved, is copied with 2.
// That takes seeing reservations, so a recipient (who never does) can only copy everything.
const CopyBody = z.object({
    targetListId: z.coerce.number({ error: "Välj en lista" }).int().positive("Välj en lista"),
    onlyUnreserved: z.boolean().default(false),
});

router.post("/:id/copy", async (req, res) => {
    const listId = parseId(req.params.id);
    const { targetListId, onlyUnreserved } = parse(CopyBody, req.body ?? {});
    if (targetListId === listId) throw new HttpError(400, "Välj en annan lista än den du kopierar från");

    const copied = await withTransaction(async (db) => {
        const source = await getListAccess(db, listId, req.user.id);
        if (!source.isAdmin) throw new HttpError(403, "Bara listans admins kan kopiera önskningar");
        if (onlyUnreserved && !source.seesReservations) {
            throw new HttpError(403, "Listan är till dig, så du kan inte se vad som är reserverat - kopiera alla önskningar i stället");
        }
        // Lock the target while counting, like when adding a wish
        await db.query("SELECT id FROM lists WHERE id = $1 FOR UPDATE", [targetListId]);
        requireEditor(await getListAccess(db, targetListId, req.user.id));

        // What's left of each wish: its quantity minus what gifts have reserved
        const { rows: wishes } = await db.query(
            `SELECT w.title, w.description, w.price, w.url, w.image_url,
                    CASE WHEN $2 THEN w.quantity - COALESCE((SELECT SUM(quantity) FROM gifts WHERE wish_id = w.id), 0)
                         ELSE w.quantity END::int AS quantity
             FROM wishes w WHERE w.list_id = $1
             ORDER BY w.created_at, w.id`,
            [listId, onlyUnreserved]
        );
        const toCopy = wishes.filter((w) => w.quantity > 0);
        if (toCopy.length === 0) {
            throw new HttpError(400, onlyUnreserved ? "Alla önskningar är reserverade - det finns inget att kopiera" : "Listan har inga önskningar");
        }

        const room = MAX_WISHES_PER_LIST - (await countWishes(db, targetListId));
        if (toCopy.length > room) {
            throw new HttpError(
                409,
                room <= 0
                    ? `Listan har redan ${MAX_WISHES_PER_LIST} önskningar, vilket är max`
                    : `Det får bara plats ${room} till på listan (max ${MAX_WISHES_PER_LIST}), men du försöker kopiera ${toCopy.length}`
            );
        }

        // One at a time, so the copies keep the original order (created_at is the same for all in the transaction)
        for (const w of toCopy) {
            await db.query(
                `INSERT INTO wishes (list_id, title, description, price, url, image_url, quantity)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [targetListId, w.title, w.description, w.price, w.url, w.image_url, w.quantity]
            );
        }
        await notifyNewWishes(db, (await getListAccess(db, targetListId, req.user.id)).list, req.user.id, toCopy.length);
        return toCopy.length;
    });

    res.status(201).json({ copied, targetListId });
});

// "N new wishes on the list" - to everyone who sees a published, coming list (its admins too).
// One notification per list that counts up until it's read - opening the list reads it (GET /:id).
async function notifyNewWishes(db, list, actorId, count) {
    if (!list.is_public || list.archived) return;
    const { rows: admins } = await db.query("SELECT user_id FROM list_admins WHERE list_id = $1", [list.id]);
    await notify(
        db,
        { userIds: [...(await listViewers(db, list.id)), ...admins.map((r) => r.user_id)], type: "list_wishes", actorId, listId: list.id },
        { mergeInto: "list_wishes", addCount: count }
    );
}

async function countWishes(db, listId) {
    const { rows: [{ count }] } = await db.query("SELECT count(*)::int AS count FROM wishes WHERE list_id = $1", [listId]);
    return count;
}

export default router;
