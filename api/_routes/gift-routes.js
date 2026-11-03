// Gifts ("gåvor" in the UI): what someone actually bought.
// Two kinds:
//  - On a wish (wish_id): created by reserving the wish. Title and price are copied from the wish.
//  - Outside the wish list (wish_id NULL): created here, with its own title, description, link and image.
//    Linked to a list (list_id), or to a recipient in free text and a date. NEVER shown on the list.
// Rules:
//  - Everyone who shares a gift has the same rights to it. Others don't see it at all
//    (a gift on a wish only shows as "Reserverad av …" on the list).
//  - A gift can be shared with adults in its list's groups – never the list's recipients, never children.
//    A gift on a wish profile (a wish without a list) can be shared with adults in the person's groups.
//    A gift without a list or a wish can't be shared.
//  - Gifts on wishes: quantity and undo are locked after the event; price, comment and split are not.
//    One person can be in at most one gift per wish.
//  - Gifts outside the list: everything can always be changed, also the list, and they can always be deleted.
//  - The split is either equal, or an amount in kronor per person that adds up to the price.
import { Router } from "express";
import { pool, TODAY, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId } from "../_lib/http.js";
import { getListAccess } from "../_lib/access.js";
import { toOre } from "../_lib/money.js";
import { GiftBody } from "../_lib/giftSchema.js";
import { uploadNewGiftImage } from "../_lib/wishImage.js";
import { receiveImage } from "../_middleware/imageUpload.js";
import { removeWishImages } from "../_integrations/storageAdapter.js";

const router = Router();

// The gift, if I'm one of its members. 404 otherwise – others don't learn it exists.
async function loadGift(db, giftId, userId, { lock = false } = {}) {
    const { rows: [gift] } = await db.query(
        `SELECT g.id, g.wish_id, g.quantity, g.title, g.price, g.comment, g.split,
                g.list_id AS own_list_id, g.recipient, g.gift_date, g.description, g.url, g.image_url,
                g.wish_id IS NULL AS is_free,
                COALESCE(w.list_id, g.list_id) AS list_id,
                w.user_id AS wish_owner_id,
                w.quantity AS wish_quantity,
                COALESCE(l.end_date, g.gift_date) < ${TODAY} AS archived
         FROM gifts g
         LEFT JOIN wishes w ON w.id = g.wish_id
         LEFT JOIN lists l ON l.id = COALESCE(w.list_id, g.list_id)
         WHERE g.id = $1
           AND EXISTS (SELECT 1 FROM gift_members WHERE gift_id = g.id AND user_id = $2)
         ${lock ? "FOR UPDATE OF g" : ""}`,
        [giftId, userId]
    );
    if (!gift) throw new HttpError(404, "Gåvan finns inte");
    return gift;
}

// Who may share a gift on this list: adults in the list's groups, not recipients,
// and (for gifts on a wish) not already in ANOTHER gift for the same wish.
// A wish on a person's profile (ownerId): adults in that person's groups, not the person.
// Neither → nobody.
async function shareCandidates(db, { listId, wishId = null, giftId = null, ownerId = null }, onlyIds = null) {
    if (!listId && ownerId) {
        const { rows } = await db.query(
            `SELECT DISTINCT u.id, u.name, u.username
             FROM users u
             JOIN group_members gm ON gm.user_id = u.id
             JOIN group_members om ON om.group_id = gm.group_id AND om.user_id = $1
             WHERE NOT u.is_child AND u.id <> $1
               AND NOT EXISTS (SELECT 1 FROM gift_members gm2 JOIN gifts g2 ON g2.id = gm2.gift_id
                               WHERE g2.wish_id = $2 AND g2.id <> COALESCE($3, 0) AND gm2.user_id = u.id)
               AND ($4::int[] IS NULL OR u.id = ANY($4::int[]))
             ORDER BY u.name`,
            [ownerId, wishId, giftId, onlyIds]
        );
        return rows;
    }
    if (!listId) return [];
    const { rows } = await db.query(
        `SELECT DISTINCT u.id, u.name, u.username
         FROM users u
         JOIN group_members gm ON gm.user_id = u.id
         JOIN list_groups lg ON lg.group_id = gm.group_id AND lg.list_id = $1
         WHERE NOT u.is_child
           AND NOT EXISTS (SELECT 1 FROM list_recipients WHERE list_id = $1 AND user_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM gift_members gm2 JOIN gifts g2 ON g2.id = gm2.gift_id
                           WHERE g2.wish_id = $2 AND g2.id <> COALESCE($3, 0) AND gm2.user_id = u.id)
           AND ($4::int[] IS NULL OR u.id = ANY($4::int[]))
         ORDER BY u.name`,
        [listId, wishId, giftId, onlyIds]
    );
    return rows;
}

// A gift outside the list may be linked to a list I can see and am not a recipient of – also archived ones
async function requireLinkableList(db, listId, userId) {
    const access = await getListAccess(db, listId, userId); // 404 if I can't see it
    if (access.isRecipient) throw new HttpError(403, "Du kan inte koppla en gåva till en lista till dig själv");
}

/* --- GET /api/gifts/lists → { data } – the lists a gift outside the wish list can be linked to --- */
router.get("/lists", async (req, res) => {
    const { rows } = await pool.query(
        `SELECT l.id, l.title, l.end_date AS "endDate", l.end_date < ${TODAY} AS archived,
                (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM list_recipients lr
                 JOIN users u ON u.id = lr.user_id WHERE lr.list_id = l.id) AS recipients
         FROM lists l
         WHERE NOT EXISTS (SELECT 1 FROM list_recipients WHERE list_id = l.id AND user_id = $1)
           AND (EXISTS (SELECT 1 FROM list_admins WHERE list_id = l.id AND user_id = $1)
                OR (l.is_public AND EXISTS (SELECT 1 FROM list_groups lg
                                            JOIN group_members gm ON gm.group_id = lg.group_id
                                            WHERE lg.list_id = l.id AND gm.user_id = $1)))
         ORDER BY archived, l.end_date, l.title`,
        [req.user.id]
    );
    res.json({ data: rows });
});

/* --- GET /api/gifts/:id → { gift, wish, list, person, members, candidates } (member) --- */
// person: who it's for, when the wish is on a wish profile instead of a list
router.get("/:id", async (req, res) => {
    const giftId = parseId(req.params.id);
    const gift = await loadGift(pool, giftId, req.user.id);

    const [wish, list, person, members, others, candidates] = await Promise.all([
        gift.wish_id
            ? pool.query(
                  `SELECT id, title, description, price, url, image_url AS "imageUrl", quantity FROM wishes WHERE id = $1`,
                  [gift.wish_id]
              )
            : { rows: [null] },
        gift.list_id
            ? pool.query(
                  `SELECT l.id, l.title, l.end_date AS "endDate",
                          (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM list_recipients lr
                           JOIN users u ON u.id = lr.user_id WHERE lr.list_id = l.id) AS recipients
                   FROM lists l WHERE l.id = $1`,
                  [gift.list_id]
              )
            : { rows: [null] },
        gift.wish_owner_id
            ? pool.query("SELECT id, name FROM users WHERE id = $1", [gift.wish_owner_id])
            : { rows: [null] },
        pool.query(
            `SELECT u.id, u.name, u.username, gm.amount
             FROM gift_members gm JOIN users u ON u.id = gm.user_id
             WHERE gm.gift_id = $1 ORDER BY u.name`,
            [giftId]
        ),
        // How many copies OTHER gifts on the wish have taken – the most this gift can have is the rest
        gift.wish_id
            ? pool.query(
                  "SELECT COALESCE(SUM(quantity), 0)::int AS taken FROM gifts WHERE wish_id = $1 AND id <> $2",
                  [gift.wish_id, giftId]
              )
            : { rows: [{ taken: 0 }] },
        shareCandidates(pool, { listId: gift.list_id, wishId: gift.wish_id, giftId, ownerId: gift.wish_owner_id }),
    ]);

    res.json({
        gift: {
            id: gift.id,
            kind: gift.is_free ? "free" : "wish",
            title: gift.title,
            price: gift.price,
            comment: gift.comment,
            split: gift.split,
            quantity: gift.quantity,
            maxQuantity: gift.is_free ? 99 : gift.wish_quantity - others.rows[0].taken,
            archived: gift.archived,
            // Only for gifts outside the list
            description: gift.description,
            url: gift.url,
            imageUrl: gift.image_url,
            listId: gift.own_list_id,
            recipient: gift.recipient,
            giftDate: gift.gift_date,
        },
        wish: wish.rows[0],
        list: list.rows[0],
        person: person.rows[0],
        members: members.rows,
        candidates,
    });
});

// A gift outside the list: a title, and a list OR a recipient and a date
function checkFreeGift(body) {
    if (!body.title) throw new HttpError(400, "Ange en titel");
    if (!body.listId) {
        if (!body.recipient) throw new HttpError(400, "Välj en lista, eller skriv vem gåvan är till");
        if (!body.giftDate) throw new HttpError(400, "Ange ett datum för gåvan");
    }
}

function checkSplit(body) {
    const userIds = body.members.map((m) => m.userId);
    if (new Set(userIds).size !== userIds.length) throw new HttpError(400, "Samma person finns med två gånger");

    // Custom amounts must add up to the price, exactly (compared in öre)
    if (body.split === "custom") {
        if (body.price === null) throw new HttpError(400, "Ange ett pris för att kunna fördela kostnaden");
        if (body.members.some((m) => m.amount === null)) throw new HttpError(400, "Ange ett belopp för alla som delar");
        const sum = body.members.reduce((s, m) => s + toOre(m.amount), 0);
        if (sum !== toOre(body.price)) {
            throw new HttpError(400, `Andelarna blir ${sum / 100} kr, men priset är ${body.price} kr`);
        }
    }
    return userIds;
}

async function replaceMembers(db, giftId, body, userIds) {
    await db.query("DELETE FROM gift_members WHERE gift_id = $1", [giftId]);
    await db.query(
        `INSERT INTO gift_members (gift_id, user_id, amount)
         SELECT $1, m.user_id, m.amount FROM unnest($2::int[], $3::numeric[]) AS m(user_id, amount)`,
        [giftId, userIds, body.members.map((m) => (body.split === "custom" ? m.amount : null))]
    );
}

/* --- POST /api/gifts  (multipart) → { id } – a gift outside the wish list. Only me to begin with. --- */
router.post("/", receiveImage, async (req, res) => {
    const body = parse(GiftBody, { ...req.body, members: [{ userId: req.user.id }], split: "equal" });
    checkFreeGift(body);
    if (body.listId) await requireLinkableList(pool, body.listId, req.user.id);

    const imageUrl = await uploadNewGiftImage(req.file, body.imageFromUrl);
    try {
        const id = await withTransaction(async (db) => {
            const { rows: [gift] } = await db.query(
                `INSERT INTO gifts (created_by, quantity, title, price, comment, description, url, image_url,
                                    list_id, recipient, gift_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
                [
                    req.user.id, body.quantity, body.title, body.price, body.comment, body.description, body.url, imageUrl,
                    body.listId,
                    body.listId ? null : body.recipient,
                    body.listId ? null : body.giftDate,
                ]
            );
            await db.query("INSERT INTO gift_members (gift_id, user_id) VALUES ($1, $2)", [gift.id, req.user.id]);
            return gift.id;
        });
        res.status(201).json({ id });
    } catch (err) {
        if (imageUrl) await removeWishImages([imageUrl]).catch(() => {});
        throw err;
    }
});

/* --- PUT /api/gifts/:id  (JSON or multipart) – change the gift (member) ---
   All gifts:     { quantity, price, comment, split, members: [{ userId, amount }] }
   Outside list:  + { title, description, url, listId | (recipient, giftDate), image / imageFromUrl / removeImage } */
router.put("/:id", receiveImage, async (req, res) => {
    const giftId = parseId(req.params.id);
    const body = parse(GiftBody, req.body ?? {});
    const userIds = checkSplit(body);

    // Who I am in it, and what kind it is – before uploading any image
    const before = await loadGift(pool, giftId, req.user.id);
    if (before.is_free) {
        checkFreeGift(body);
        if (body.listId && body.listId !== before.own_list_id) await requireLinkableList(pool, body.listId, req.user.id);
        if (!body.listId && userIds.length > 1) throw new HttpError(400, "En gåva utan lista kan inte delas. Välj en lista, eller ta bort de andra.");
    }

    const newImageUrl = before.is_free ? await uploadNewGiftImage(req.file, body.imageFromUrl) : null;
    let oldImageUrl = null;

    try {
        await withTransaction(async (db) => {
            const gift = await loadGift(db, giftId, req.user.id, { lock: true });
            const listId = gift.is_free ? body.listId : gift.list_id;

            if (!gift.is_free && body.quantity !== gift.quantity) {
                // Quantity on a wish: locked after the event, and must fit what's left of the wish
                if (gift.archived) throw new HttpError(403, "Antalet kan inte ändras efter datumet");
                const { rows: [wish] } = await db.query("SELECT quantity FROM wishes WHERE id = $1 FOR UPDATE", [gift.wish_id]);
                const { rows: [{ taken }] } = await db.query(
                    "SELECT COALESCE(SUM(quantity), 0)::int AS taken FROM gifts WHERE wish_id = $1 AND id <> $2",
                    [gift.wish_id, giftId]
                );
                if (body.quantity > wish.quantity - taken) {
                    throw new HttpError(409, `Det finns bara ${wish.quantity - taken} att reservera`);
                }
            }

            // Who may share: new people must be allowed on the list. If a gift outside the list moves to
            // ANOTHER list, everyone must be allowed there. Current members may otherwise stay
            // (even if they've left the group). Without a list, the one person left must already be a member.
            const { rows: current } = await db.query("SELECT user_id FROM gift_members WHERE gift_id = $1", [giftId]);
            const currentIds = current.map((r) => r.user_id);
            const listChanged = gift.is_free && listId !== gift.own_list_id;
            const toCheck = listChanged && listId ? userIds : userIds.filter((id) => !currentIds.includes(id));
            if (toCheck.length > 0) {
                const ownerId = gift.is_free ? null : gift.wish_owner_id;
                const allowed = (await shareCandidates(db, { listId, wishId: gift.wish_id, giftId, ownerId }, toCheck)).map((u) => u.id);
                if (toCheck.some((id) => !allowed.includes(id))) {
                    throw new HttpError(
                        400,
                        listId
                            ? "Du kan bara dela med vuxna i listans grupper som inte är mottagare" +
                                  (gift.wish_id ? " och inte redan är med i en annan gåva för samma önskning" : "")
                            : ownerId
                              ? "Du kan bara dela med vuxna i mottagarens grupper som inte redan är med i en annan gåva för samma önskning"
                              : "En gåva utan lista kan inte delas"
                    );
                }
            }

            if (gift.is_free) {
                const imageUrl = newImageUrl ?? (body.removeImage ? null : gift.image_url);
                if (gift.image_url && gift.image_url !== imageUrl) oldImageUrl = gift.image_url;
                await db.query(
                    `UPDATE gifts SET quantity = $1, price = $2, comment = $3, split = $4,
                            title = $5, description = $6, url = $7, image_url = $8,
                            list_id = $9, recipient = $10, gift_date = $11, updated_at = now()
                     WHERE id = $12`,
                    [
                        body.quantity, body.price, body.comment, body.split,
                        body.title, body.description, body.url, imageUrl,
                        listId, listId ? null : body.recipient, listId ? null : body.giftDate,
                        giftId,
                    ]
                );
            } else {
                await db.query(
                    "UPDATE gifts SET quantity = $1, price = $2, comment = $3, split = $4, updated_at = now() WHERE id = $5",
                    [body.quantity, body.price, body.comment, body.split, giftId]
                );
            }
            await replaceMembers(db, giftId, body, userIds);
        });
    } catch (err) {
        if (newImageUrl) await removeWishImages([newImageUrl]).catch(() => {});
        throw err;
    }

    if (oldImageUrl) {
        await removeWishImages([oldImageUrl]).catch((err) => console.warn("[GIFT] Could not delete old image:", err));
    }
    res.json({ id: giftId, stillMember: userIds.includes(req.user.id) });
});

/* --- DELETE /api/gifts/:id – undo the reservation / delete the gift (member) --- */
// A gift on a wish can't be undone after the event. A gift outside the list can always be deleted.
router.delete("/:id", async (req, res) => {
    const giftId = parseId(req.params.id);

    const imageUrl = await withTransaction(async (db) => {
        const gift = await loadGift(db, giftId, req.user.id, { lock: true });
        if (!gift.is_free && gift.archived) throw new HttpError(403, "Gåvan kan inte ångras efter datumet");
        await db.query("DELETE FROM gifts WHERE id = $1", [giftId]);
        return gift.image_url;
    });

    if (imageUrl) await removeWishImages([imageUrl]).catch((err) => console.warn("[GIFT] Could not delete image:", err));
    res.json({ deleted: giftId });
});

export default router;
