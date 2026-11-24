import { Router } from "express";
import { z } from "zod";
import { pool, TODAY, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId } from "../_lib/http.js";
import { getWishAccess, requireEditor, requireReserver } from "../_lib/access.js";
import { WishBody } from "../_lib/wishSchema.js";
import { giftDate, optionalId } from "../_lib/giftSchema.js";
import { receiveImage } from "../_middleware/imageUpload.js";
import { removeWishImages } from "../_integrations/storageAdapter.js";
import { removeUnusedImages } from "../_lib/imageCleanup.js";
import { uploadNewProfileWishImage, uploadNewWishImage } from "../_lib/wishImage.js";

const router = Router();

// The wish, and my access to its list - or to the wish profile it's on.
// 404 if the wish doesn't exist or I can't see where it is.
async function loadWish(db, wishId, userId) {
    const { rows: [wish] } = await db.query("SELECT id, list_id, user_id, image_url FROM wishes WHERE id = $1", [wishId]);
    if (!wish) throw new HttpError(404, "Önskningen finns inte");
    const access = await getWishAccess(db, wish, userId);
    return { wish, access };
}

// A wish can be changed and deleted also when someone has reserved it - on a list and on a wish profile.
// Refusing would give the reservation away to a recipient, and the gifts survive:
//  - deleted: a reservation becomes a logged gift on an event (the trigger wrappd_keep_gifts_of_wish,
//    migration 021) - on a list with its name, date and recipients
//  - changed: the gift keeps its own title and price
// Those who see reservations (admins who aren't recipients, a child's parents) are warned in the app first.

/* --- PATCH /api/wishes/:id  (multipart, same fields as create + removeImage) - edit (list admin / profile owner) --- */
router.patch("/:id", receiveImage, async (req, res) => {
    const wishId = parseId(req.params.id);
    const { wish, access } = await loadWish(pool, wishId, req.user.id);
    requireEditor(access);
    const body = parse(WishBody, req.body ?? {});

    // 1. A new image (uploaded file, or a copy of the shop's image) is saved first.
    //    The old one is only deleted once the wish is saved.
    const newImageUrl = wish.list_id
        ? await uploadNewWishImage(wish.list_id, req.file, body.imageFromUrl)
        : await uploadNewProfileWishImage(wish.user_id, req.file, body.imageFromUrl);

    const imageUrl = newImageUrl ?? (body.removeImage ? null : wish.image_url);

    try {
        await withTransaction(async (db) => {
            await db.query("SELECT id FROM wishes WHERE id = $1 FOR UPDATE", [wishId]);
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

    // 2. The wish is saved - now the old image can go
    if (wish.image_url && wish.image_url !== imageUrl) {
        await removeUnusedImages([wish.image_url], "WISH");
    }

    res.json({ id: wishId, imageUrl });
});

/* --- DELETE /api/wishes/:id - delete (list admin / profile owner), also when reserved - the gifts are kept --- */
router.delete("/:id", async (req, res) => {
    const wishId = parseId(req.params.id);
    const { wish, access } = await loadWish(pool, wishId, req.user.id);
    requireEditor(access);

    await withTransaction(async (db) => {
        await db.query("SELECT id FROM wishes WHERE id = $1 FOR UPDATE", [wishId]);
        await db.query("DELETE FROM wishes WHERE id = $1", [wishId]);
    });

    if (wish.image_url) {
        await removeUnusedImages([wish.image_url], "WISH");
    }
    res.json({ deleted: wishId });
});

/* --- POST /api/wishes/:id/gifts  { quantity, eventId? | eventName? + giftDate?, santaId? } → { id } --- */
// Reserve: creates a gift with me in it. It gets a copy of the title, and the price = the wish's price × quantity.
// Both are then the gift's own.
// A wish on a wish profile has no list with a date, so the reservation goes on an event of my own -
// "Loggade gåvor" (migration 021):
//   eventId: one that exists - mine (I'm in a gift on it), coming, and for the profile's owner …
//   eventName + giftDate: … or a new one, for the profile's owner
// santaId: … unless it's for a Secret Santa where I give to the profile's owner - then it's the draw's
const Reserve = z.object({
    eventId: optionalId,
    eventName: z.string().trim().max(100, "Händelsens namn får vara högst 100 tecken").nullish().transform((v) => v || null),
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
    const { quantity, eventId: chosenEventId, eventName, giftDate: date, santaId } = parse(Reserve, req.body);
    const { access } = await loadWish(pool, wishId, req.user.id);
    requireReserver(access);

    const giftId = await withTransaction(async (db) => {
        // Lock the wish, so two people can't reserve the last copy at the same time
        const { rows: [wish] } = await db.query(
            "SELECT quantity, title, price, user_id FROM wishes WHERE id = $1 FOR UPDATE",
            [wishId]
        );
        // A wish on a wish profile: the gift goes on an event of my own (a list's wishes use the list) -
        // or on a Secret Santa where I'm the giver and the profile's owner is the one I give to
        const onProfile = wish.user_id !== null;
        if (santaId) {
            if (!onProfile) throw new HttpError(400, "Bara önskningar på en önskeprofil kan reserveras till en Secret Santa");
            const { rowCount } = await db.query(
                "SELECT 1 FROM secret_santa_pairs WHERE santa_id = $1 AND giver_id = $2 AND receiver_id = $3",
                [santaId, req.user.id, wish.user_id]
            );
            if (rowCount === 0) throw new HttpError(403, "Du ger inte till den här personen i den Secret Santan");
        } else if (onProfile && chosenEventId) {
            // An event that exists: mine, still coming, and for this person - and I'm in every gift on it
            // (nobody adds to an event they only see part of)
            const { rows: [event] } = await db.query(
                `SELECT e.recipient_id, e.event_date < ${TODAY} AS archived,
                        NOT EXISTS (SELECT 1 FROM gifts g WHERE g.event_id = e.id
                                    AND NOT EXISTS (SELECT 1 FROM gift_members gm WHERE gm.gift_id = g.id AND gm.user_id = $2)) AS complete
                 FROM gift_events e
                 WHERE e.id = $1
                   AND EXISTS (SELECT 1 FROM gifts g JOIN gift_members gm ON gm.gift_id = g.id
                               WHERE g.event_id = e.id AND gm.user_id = $2)`,
                [chosenEventId, req.user.id]
            );
            if (!event) throw new HttpError(404, "Händelsen finns inte");
            if (event.recipient_id !== wish.user_id) throw new HttpError(400, "Händelsen är till någon annan");
            if (event.archived) throw new HttpError(400, "Händelsen har redan varit - välj en annan eller skapa en ny");
            if (!event.complete) throw new HttpError(403, "Händelsen har gåvor som du inte är med i - välj en annan eller skapa en ny");
        } else if (onProfile) {
            if (!eventName) throw new HttpError(400, "Ange vad händelsen heter");
            if (!date) throw new HttpError(400, "Ange när gåvan ska ges");
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

        // A new event of my own for the profile's owner - only now that everything else has been checked
        let eventId = null;
        if (onProfile && !santaId) {
            eventId = chosenEventId;
            if (!eventId) {
                const { rows: [event] } = await db.query(
                    `INSERT INTO gift_events (name, event_date, recipient_id, created_by)
                     VALUES ($1, $2, $3, $4) RETURNING id`,
                    [eventName, date, wish.user_id, req.user.id]
                );
                eventId = event.id;
            }
        }

        const { rows: [gift] } = await db.query(
            `INSERT INTO gifts (wish_id, created_by, quantity, title, price, santa_id, event_id)
             VALUES ($1, $2, $3, $4, $5::numeric * $3::int, $6, $7) RETURNING id`,
            [wishId, req.user.id, quantity, wish.title, wish.price, santaId, eventId]
        );
        await db.query("INSERT INTO gift_members (gift_id, user_id) VALUES ($1, $2)", [gift.id, req.user.id]);
        return gift.id;
    });

    res.status(201).json({ id: giftId });
});

export default router;
