import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId } from "../_lib/http.js";
import { getWishAccess, requireEditor, requireReserver } from "../_lib/access.js";
import { WishBody } from "../_lib/wishSchema.js";
import { giftDate, optionalId } from "../_lib/giftSchema.js";
import { receiveImage } from "../_middleware/imageUpload.js";
import { removeWishImages } from "../_integrations/storageAdapter.js";
import { removeUnusedImages } from "../_lib/imageCleanup.js";
import { uploadNewProfileWishImage, uploadNewWishImage } from "../_lib/wishImage.js";

const router = Router();

// The wish, and my access to its list – or to the wish profile it's on.
// 404 if the wish doesn't exist or I can't see where it is.
async function loadWish(db, wishId, userId) {
    const { rows: [wish] } = await db.query("SELECT id, list_id, user_id, image_url FROM wishes WHERE id = $1", [wishId]);
    if (!wish) throw new HttpError(404, "Önskningen finns inte");
    const access = await getWishAccess(db, wish, userId);
    return { wish, access };
}

async function giftCount(db, wishId) {
    const { rows: [{ count }] } = await db.query("SELECT count(*)::int AS count FROM gifts WHERE wish_id = $1", [wishId]);
    return count;
}

// A wish can't be changed or deleted once someone has reserved it.
// Recipients must not learn what is reserved – so a vaguer message for them.
function lockedByGifts(access, what) {
    return new HttpError(
        409,
        access.isRecipient ? `Önskningen kan inte ${what} just nu.` : `Önskningen är reserverad och kan inte ${what}`
    );
}

/* --- PATCH /api/wishes/:id  (multipart, same fields as create + removeImage) – edit (list admin / profile owner) --- */
router.patch("/:id", receiveImage, async (req, res) => {
    const wishId = parseId(req.params.id);
    const { wish, access } = await loadWish(pool, wishId, req.user.id);
    requireEditor(access);
    const body = parse(WishBody, req.body ?? {});

    // Check before uploading a new image – no point uploading it if the save will be refused
    if ((await giftCount(pool, wishId)) > 0) throw lockedByGifts(access, "ändras");

    // 1. A new image (uploaded file, or a copy of the shop's image) is saved first.
    //    The old one is only deleted once the wish is saved.
    const newImageUrl = wish.list_id
        ? await uploadNewWishImage(wish.list_id, req.file, body.imageFromUrl)
        : await uploadNewProfileWishImage(wish.user_id, req.file, body.imageFromUrl);

    const imageUrl = newImageUrl ?? (body.removeImage ? null : wish.image_url);

    try {
        await withTransaction(async (db) => {
            await db.query("SELECT id FROM wishes WHERE id = $1 FOR UPDATE", [wishId]);
            // Again, inside the lock – someone may have reserved it meanwhile
            if ((await giftCount(db, wishId)) > 0) throw lockedByGifts(access, "ändras");

            await db.query(
                `UPDATE wishes
                 SET title = $1, description = $2, price = $3, url = $4, quantity = $5, image_url = $6, updated_at = now()
                 WHERE id = $7`,
                [body.title, body.description, body.price, body.url, body.quantity, imageUrl, wishId]
            );
        });
    } catch (err) {
        if (newImageUrl) await removeWishImages([newImageUrl]).catch(() => {});
        throw err;
    }

    // 2. The wish is saved – now the old image can go
    if (wish.image_url && wish.image_url !== imageUrl) {
        await removeUnusedImages([wish.image_url], "WISH");
    }

    res.json({ id: wishId, imageUrl });
});

/* --- DELETE /api/wishes/:id – only if nobody has reserved it (list admin) --- */
router.delete("/:id", async (req, res) => {
    const wishId = parseId(req.params.id);
    const { wish, access } = await loadWish(pool, wishId, req.user.id);
    requireEditor(access);

    await withTransaction(async (db) => {
        await db.query("SELECT id FROM wishes WHERE id = $1 FOR UPDATE", [wishId]);
        if ((await giftCount(db, wishId)) > 0) throw lockedByGifts(access, "raderas");
        await db.query("DELETE FROM wishes WHERE id = $1", [wishId]);
    });

    if (wish.image_url) {
        await removeUnusedImages([wish.image_url], "WISH");
    }
    res.json({ deleted: wishId });
});

/* --- POST /api/wishes/:id/gifts  { quantity } → { id } – reserve: creates a gift with me in it --- */
// The gift gets a copy of the title, and the price = the wish's price × quantity. Both are then the gift's own.
// giftDate: when the gift is to be given – required on a wish profile (it has no list with a date) …
// santaId: … unless it's for a Secret Santa where I give to the profile's owner – then it's the draw's date
const Reserve = z.object({
    giftDate,
    santaId: optionalId,
    quantity: z.coerce
        .number({ error: "Ange hur många du vill reservera" })
        .int("Antalet måste vara ett heltal")
        .min(1, "Antalet måste vara minst 1")
        .max(99, "Antalet får vara högst 99"),
});

router.post("/:id/gifts", async (req, res) => {
    const wishId = parseId(req.params.id);
    const { quantity, giftDate: date, santaId } = parse(Reserve, req.body);
    const { access } = await loadWish(pool, wishId, req.user.id);
    requireReserver(access);

    const giftId = await withTransaction(async (db) => {
        // Lock the wish, so two people can't reserve the last copy at the same time
        const { rows: [wish] } = await db.query(
            "SELECT quantity, title, price, user_id FROM wishes WHERE id = $1 FOR UPDATE",
            [wishId]
        );
        // A wish on a wish profile: the gift needs its own date (a list's wishes use the list's date) –
        // or a Secret Santa where I'm the giver and the profile's owner is the one I give to
        const onProfile = wish.user_id !== null;
        if (santaId) {
            if (!onProfile) throw new HttpError(400, "Bara önskningar på en önskeprofil kan reserveras till en Secret Santa");
            const { rowCount } = await db.query(
                "SELECT 1 FROM secret_santa_pairs WHERE santa_id = $1 AND giver_id = $2 AND receiver_id = $3",
                [santaId, req.user.id, wish.user_id]
            );
            if (rowCount === 0) throw new HttpError(403, "Du ger inte till den här personen i den Secret Santan");
        } else if (onProfile && !date) {
            throw new HttpError(400, "Ange när gåvan ska ges");
        }

        const { rows: [mine] } = await db.query(
            `SELECT g.id FROM gifts g JOIN gift_members gm ON gm.gift_id = g.id
             WHERE g.wish_id = $1 AND gm.user_id = $2`,
            [wishId, req.user.id]
        );
        if (mine) throw new HttpError(409, "Du är redan med i en gåva för den här önskningen");

        const { rows: [{ taken }] } = await db.query(
            "SELECT COALESCE(SUM(quantity), 0)::int AS taken FROM gifts WHERE wish_id = $1",
            [wishId]
        );
        const available = wish.quantity - taken;
        if (quantity > available) {
            throw new HttpError(
                409,
                available <= 0 ? "Önskningen är redan fullt reserverad" : `Det finns bara ${available} kvar att reservera`
            );
        }

        const { rows: [gift] } = await db.query(
            `INSERT INTO gifts (wish_id, created_by, quantity, title, price, gift_date, santa_id)
             VALUES ($1, $2, $3, $4, $5::numeric * $3::int, $6, $7) RETURNING id`,
            [wishId, req.user.id, quantity, wish.title, wish.price, onProfile && !santaId ? date : null, santaId]
        );
        await db.query("INSERT INTO gift_members (gift_id, user_id) VALUES ($1, $2)", [gift.id, req.user.id]);
        return gift.id;
    });

    res.status(201).json({ id: giftId });
});

export default router;
