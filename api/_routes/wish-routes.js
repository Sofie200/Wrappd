import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId } from "../_lib/http.js";
import { getListAccess, requireEditor, requireReserver } from "../_lib/access.js";
import { WishBody } from "../_lib/wishSchema.js";
import { receiveImage } from "../_middleware/imageUpload.js";
import { removeWishImages, uploadWishImage } from "../_integrations/storageAdapter.js";

const router = Router();

// The wish's list, and my access to it. 404 if the wish doesn't exist or I can't see its list.
async function loadWish(db, wishId, userId) {
    const { rows: [wish] } = await db.query("SELECT id, list_id, image_url FROM wishes WHERE id = $1", [wishId]);
    if (!wish) throw new HttpError(404, "Önskningen finns inte");
    const access = await getListAccess(db, wish.list_id, userId);
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

/* --- PATCH /api/wishes/:id  (multipart, same fields as create + removeImage) – edit (list admin) --- */
router.patch("/:id", receiveImage, async (req, res) => {
    const wishId = parseId(req.params.id);
    const { wish, access } = await loadWish(pool, wishId, req.user.id);
    requireEditor(access);
    const body = parse(WishBody, req.body ?? {});

    // Check before uploading a new image – no point uploading it if the save will be refused
    if ((await giftCount(pool, wishId)) > 0) throw lockedByGifts(access, "ändras");

    // 1. A new image is uploaded first. The old one is only deleted once the wish is saved.
    let newImageUrl = null;
    if (req.file) {
        try {
            newImageUrl = await uploadWishImage(wish.list_id, { buffer: req.file.buffer, mimeType: req.file.mimetype });
        } catch (err) {
            console.error("[WISH] Image upload failed:", err);
            throw new HttpError(502, "Bildtjänsten svarar inte just nu. Försök igen, eller spara utan ny bild.");
        }
    }

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
        await removeWishImages([wish.image_url]).catch((err) => console.warn("[WISH] Could not delete old image:", err));
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
        await removeWishImages([wish.image_url]).catch((err) => console.warn("[WISH] Could not delete image:", err));
    }
    res.json({ deleted: wishId });
});

/* --- POST /api/wishes/:id/gifts  { quantity } → { id } – reserve: creates a gift with me in it --- */
// The gift gets a copy of the title, and the price = the wish's price × quantity. Both are then the gift's own.
const Reserve = z.object({
    quantity: z.coerce
        .number({ error: "Ange hur många du vill reservera" })
        .int("Antalet måste vara ett heltal")
        .min(1, "Antalet måste vara minst 1")
        .max(99, "Antalet får vara högst 99"),
});

router.post("/:id/gifts", async (req, res) => {
    const wishId = parseId(req.params.id);
    const { quantity } = parse(Reserve, req.body);
    const { access } = await loadWish(pool, wishId, req.user.id);
    requireReserver(access);

    const giftId = await withTransaction(async (db) => {
        // Lock the wish, so two people can't reserve the last copy at the same time
        const { rows: [wish] } = await db.query(
            "SELECT quantity, title, price FROM wishes WHERE id = $1 FOR UPDATE",
            [wishId]
        );

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
            `INSERT INTO gifts (wish_id, created_by, quantity, title, price)
             VALUES ($1, $2, $3, $4, $5::numeric * $3::int) RETURNING id`,
            [wishId, req.user.id, quantity, wish.title, wish.price]
        );
        await db.query("INSERT INTO gift_members (gift_id, user_id) VALUES ($1, $2)", [gift.id, req.user.id]);
        return gift.id;
    });

    res.status(201).json({ id: giftId });
});

export default router;
