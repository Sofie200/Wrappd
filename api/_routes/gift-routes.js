// Gifts ("gåvor" in the UI): what someone actually bought for a wish.
// Rules:
//  - Everyone who shares a gift has the same rights: price, comment, split, who shares, quantity, undo.
//  - Price, comment and split (including who shares) can be changed also after the event.
//    Quantity and undoing can't – the list is archived then.
//  - A gift can be shared with adults in the list's groups – never the list's recipients, never children.
//  - One person can be in at most one gift per wish.
//  - The split is either equal, or an amount in kronor per person that adds up to the price.
import { Router } from "express";
import { z } from "zod";
import { pool, TODAY, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId } from "../_lib/http.js";
import { money, toOre } from "../_lib/money.js";

const router = Router();

// The gift, if I'm one of its members. 404 otherwise – others don't learn it exists.
async function loadGift(db, giftId, userId, { lock = false } = {}) {
    const { rows: [gift] } = await db.query(
        `SELECT g.id, g.wish_id, g.quantity, g.title, g.price, g.comment, g.split,
                w.list_id, w.quantity AS wish_quantity,
                l.end_date < ${TODAY} AS archived
         FROM gifts g
         JOIN wishes w ON w.id = g.wish_id
         JOIN lists l ON l.id = w.list_id
         WHERE g.id = $1
           AND EXISTS (SELECT 1 FROM gift_members WHERE gift_id = g.id AND user_id = $2)
         ${lock ? "FOR UPDATE OF g" : ""}`,
        [giftId, userId]
    );
    if (!gift) throw new HttpError(404, "Gåvan finns inte");
    return gift;
}

// Who may share this gift: adults in the list's groups, not recipients,
// and not already in ANOTHER gift for the same wish
async function shareCandidates(db, gift, onlyIds = null) {
    const { rows } = await db.query(
        `SELECT DISTINCT u.id, u.name, u.username
         FROM users u
         JOIN group_members gm ON gm.user_id = u.id
         JOIN list_groups lg ON lg.group_id = gm.group_id AND lg.list_id = $1
         WHERE NOT u.is_child
           AND NOT EXISTS (SELECT 1 FROM list_recipients WHERE list_id = $1 AND user_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM gift_members gm2 JOIN gifts g2 ON g2.id = gm2.gift_id
                           WHERE g2.wish_id = $2 AND g2.id <> $3 AND gm2.user_id = u.id)
           AND ($4::int[] IS NULL OR u.id = ANY($4::int[]))
         ORDER BY u.name`,
        [gift.list_id, gift.wish_id, gift.id, onlyIds]
    );
    return rows;
}

/* --- GET /api/gifts/:id → { gift, wish, list, members, candidates } (member) --- */
router.get("/:id", async (req, res) => {
    const giftId = parseId(req.params.id);
    const gift = await loadGift(pool, giftId, req.user.id);

    const [wish, list, members, others] = await Promise.all([
        pool.query(
            `SELECT id, title, description, price, url, image_url AS "imageUrl", quantity FROM wishes WHERE id = $1`,
            [gift.wish_id]
        ),
        pool.query(
            `SELECT l.id, l.title, l.end_date AS "endDate",
                    (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM list_recipients lr
                     JOIN users u ON u.id = lr.user_id WHERE lr.list_id = l.id) AS recipients
             FROM lists l WHERE l.id = $1`,
            [gift.list_id]
        ),
        pool.query(
            `SELECT u.id, u.name, u.username, gm.amount
             FROM gift_members gm JOIN users u ON u.id = gm.user_id
             WHERE gm.gift_id = $1 ORDER BY u.name`,
            [giftId]
        ),
        // How many copies OTHER gifts have taken – the most this gift can have is the rest
        pool.query(
            "SELECT COALESCE(SUM(quantity), 0)::int AS taken FROM gifts WHERE wish_id = $1 AND id <> $2",
            [gift.wish_id, giftId]
        ),
    ]);

    res.json({
        gift: {
            id: gift.id,
            title: gift.title,
            price: gift.price,
            comment: gift.comment,
            split: gift.split,
            quantity: gift.quantity,
            maxQuantity: gift.wish_quantity - others.rows[0].taken,
            archived: gift.archived,
        },
        wish: wish.rows[0],
        list: list.rows[0],
        members: members.rows,
        candidates: await shareCandidates(pool, gift),
    });
});

/* --- PUT /api/gifts/:id  { quantity, price, comment, split, members: [{ userId, amount }] } (member) --- */
const GiftBody = z.object({
    quantity: z.coerce
        .number({ error: "Ange ett antal" })
        .int("Antalet måste vara ett heltal")
        .min(1, "Antalet måste vara minst 1")
        .max(99, "Antalet får vara högst 99"),
    price: money("Priset ska vara ett belopp, t.ex. 299 eller 299,50"),
    comment: z
        .string()
        .trim()
        .max(1000, "Kommentaren får vara högst 1000 tecken")
        .nullish()
        .transform((v) => v || null),
    split: z.enum(["equal", "custom"], { error: "Välj hur kostnaden delas" }),
    members: z
        .array(
            z.object({
                userId: z.coerce.number().int().positive(),
                amount: money("Andelen ska vara ett belopp, t.ex. 150 eller 149,50"),
            }),
            { error: "Ange vilka som delar på gåvan" }
        )
        .min(1, "Minst en person måste stå för gåvan")
        .max(20, "Högst 20 personer kan dela på en gåva"),
});

router.put("/:id", async (req, res) => {
    const giftId = parseId(req.params.id);
    const body = parse(GiftBody, req.body);

    const userIds = body.members.map((m) => m.userId);
    if (new Set(userIds).size !== userIds.length) throw new HttpError(400, "Samma person finns med två gånger");

    // The split: custom amounts must add up to the price, exactly (compared in öre)
    if (body.split === "custom") {
        if (body.price === null) throw new HttpError(400, "Ange ett pris för att kunna fördela kostnaden");
        if (body.members.some((m) => m.amount === null)) throw new HttpError(400, "Ange ett belopp för alla som delar");
        const sum = body.members.reduce((s, m) => s + toOre(m.amount), 0);
        if (sum !== toOre(body.price)) {
            throw new HttpError(400, `Andelarna blir ${sum / 100} kr, men priset är ${body.price} kr`);
        }
    }

    await withTransaction(async (db) => {
        const gift = await loadGift(db, giftId, req.user.id, { lock: true });

        // Quantity: locked after the event. Otherwise it must fit what's left of the wish.
        if (body.quantity !== gift.quantity) {
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

        // New people must be allowed to share. Current members may stay even if they've left the group.
        const { rows: current } = await db.query("SELECT user_id FROM gift_members WHERE gift_id = $1", [giftId]);
        const currentIds = current.map((r) => r.user_id);
        const newIds = userIds.filter((id) => !currentIds.includes(id));
        if (newIds.length > 0) {
            const allowed = (await shareCandidates(db, gift, newIds)).map((u) => u.id);
            if (newIds.some((id) => !allowed.includes(id))) {
                throw new HttpError(
                    400,
                    "Du kan bara dela med vuxna i listans grupper som inte är mottagare och inte redan är med i en annan gåva för samma önskning"
                );
            }
        }

        await db.query(
            "UPDATE gifts SET quantity = $1, price = $2, comment = $3, split = $4, updated_at = now() WHERE id = $5",
            [body.quantity, body.price, body.comment, body.split, giftId]
        );
        await db.query("DELETE FROM gift_members WHERE gift_id = $1", [giftId]);
        await db.query(
            `INSERT INTO gift_members (gift_id, user_id, amount)
             SELECT $1, m.user_id, m.amount FROM unnest($2::int[], $3::numeric[]) AS m(user_id, amount)`,
            [giftId, userIds, body.members.map((m) => (body.split === "custom" ? m.amount : null))]
        );
    });

    res.json({ id: giftId, stillMember: userIds.includes(req.user.id) });
});

/* --- DELETE /api/gifts/:id – undo the reservation (member, before the event) --- */
router.delete("/:id", async (req, res) => {
    const giftId = parseId(req.params.id);

    await withTransaction(async (db) => {
        const gift = await loadGift(db, giftId, req.user.id, { lock: true });
        if (gift.archived) throw new HttpError(403, "Gåvan kan inte ångras efter datumet");
        await db.query("DELETE FROM gifts WHERE id = $1", [giftId]);
    });

    res.json({ deleted: giftId });
});

export default router;
