// Gifts ("gåvor" in the UI): what someone actually bought.
// Two kinds:
//  - On a wish (wish_id): created by reserving the wish. Title and price are copied from the wish.
//  - Outside the wish list (wish_id NULL): created here, with its own title, description, link and image.
//    Linked to a list (list_id), to a Secret Santa I'm a giver in (santa_id – recipient and date come
//    from the draw), or logged on an event of my own (event_id → gift_events, "Loggade gåvor"): a name,
//    a date and one recipient (a user in my groups, a name in free text, or "Okänd mottagare").
//    NEVER shown on the list. The API still calls the event's fields recipient (name), giftDate,
//    recipientId, recipientText and recipientUnknown – as before they moved to gift_events.
// Rules:
//  - Everyone who shares a gift has the same rights to it. Others don't see it at all
//    (a gift on a wish only shows as "Reserverad av …" on the list).
//  - A gift can be shared with adults in its list's groups – never the list's recipients, never children.
//    A gift on a wish profile (a wish without a list) can be shared with adults in the person's groups.
//    A gift without a list or a wish can't be shared (also not a Secret Santa gift – only the giver knows who it's for).
//  - Gifts on wishes: quantity and undo are locked after the event; price, comment and split are not.
//    One person can be in at most one gift per wish.
//  - Gifts outside the list: everything can always be changed – except what it is linked to (a list, a Secret
//    Santa or an own event), which is set when it is created – and they can always be deleted.
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
import { removeUnusedImages } from "../_lib/imageCleanup.js";

const router = Router();

// The gift, if I'm one of its members. 404 otherwise – others don't learn it exists.
async function loadGift(db, giftId, userId, { lock = false } = {}) {
    const { rows: [gift] } = await db.query(
        `SELECT g.id, g.wish_id, g.quantity, g.title, g.price, g.comment, g.split,
                g.list_id AS own_list_id, g.santa_id, g.event_id, g.gift_date, g.description, g.url, g.image_url,
                ge.name AS recipient, ge.event_date, ge.recipient_id, ge.recipient_text, ge.recipient_unknown,
                (SELECT name FROM users WHERE id = ge.recipient_id) AS recipient_name,
                g.wish_id IS NULL AS is_free,
                COALESCE(w.list_id, g.list_id) AS list_id,
                w.user_id AS wish_owner_id,
                w.quantity AS wish_quantity,
                COALESCE(l.end_date, g.gift_date, ss.event_date, ge.event_date) < ${TODAY} AS archived
         FROM gifts g
         LEFT JOIN wishes w ON w.id = g.wish_id
         LEFT JOIN lists l ON l.id = COALESCE(w.list_id, g.list_id)
         LEFT JOIN secret_santas ss ON ss.id = g.santa_id
         LEFT JOIN gift_events ge ON ge.id = g.event_id
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
            `SELECT DISTINCT u.id, u.name, u.username, u.avatar_icon AS "avatarIcon", u.avatar_color AS "avatarColor"
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
        `SELECT DISTINCT u.id, u.name, u.username, u.avatar_icon AS "avatarIcon", u.avatar_color AS "avatarColor"
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

// A gift outside the list may be linked to a published list I can see and am not a recipient of –
// also archived ones. Not to a private list: nobody can buy for it before it's published.
async function requireLinkableList(db, listId, userId) {
    const access = await getListAccess(db, listId, userId); // 404 if I can't see it
    if (access.isRecipient) throw new HttpError(403, "Du kan inte koppla en gåva till en lista till dig själv");
    if (!access.list.is_public) throw new HttpError(403, "Listan är inte publicerad än – då kan du inte koppla gåvor till den");
}

// Who a gift for an event is for: someone else in one of my groups. 404 otherwise.
async function requireLinkablePerson(db, personId, userId) {
    if (personId === userId) throw new HttpError(400, "Du kan inte välja dig själv som mottagare");
    const { rowCount } = await db.query(
        `SELECT 1 FROM group_members a
         JOIN group_members b ON b.group_id = a.group_id
         WHERE a.user_id = $1 AND b.user_id = $2
         LIMIT 1`,
        [userId, personId]
    );
    if (rowCount === 0) throw new HttpError(404, "Personen finns inte i dina grupper");
}

// ...or to an event of my own that I'm in – through a gift on it. 404 otherwise.
async function requireMyEvent(db, eventId, userId) {
    const { rowCount } = await db.query(
        `SELECT 1 FROM gifts g JOIN gift_members gm ON gm.gift_id = g.id
         WHERE g.event_id = $1 AND gm.user_id = $2 LIMIT 1`,
        [eventId, userId]
    );
    if (rowCount === 0) throw new HttpError(404, "Händelsen finns inte");
}

// ...or to a Secret Santa where I'm a giver. 404 otherwise – others don't learn it exists.
async function requireMySanta(db, santaId, userId) {
    const { rowCount } = await db.query(
        "SELECT 1 FROM secret_santa_pairs WHERE santa_id = $1 AND giver_id = $2",
        [santaId, userId]
    );
    if (rowCount === 0) throw new HttpError(404, "Secret Santa finns inte");
}

// The Secret Santas a gift can be linked to: the ones I give in – who I give to, the date and the title
async function mySantas(db, userId) {
    const { rows } = await db.query(
        `SELECT s.id, s.title, s.event_date AS "date", s.event_date < ${TODAY} AS archived, u.name AS receiver
         FROM secret_santa_pairs p
         JOIN secret_santas s ON s.id = p.santa_id
         JOIN users u ON u.id = p.receiver_id
         WHERE p.giver_id = $1
         ORDER BY archived, s.event_date, s.title`,
        [userId]
    );
    return rows;
}

/* --- GET /api/gifts/lists → { data, santas } – the lists and Secret Santas a gift outside the wish list can be linked to --- */
router.get("/lists", async (req, res) => {
    const santas = await mySantas(pool, req.user.id);
    const { rows } = await pool.query(
        `SELECT l.id, l.title, l.end_date AS "endDate", l.end_date < ${TODAY} AS archived,
                (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM list_recipients lr
                 JOIN users u ON u.id = lr.user_id WHERE lr.list_id = l.id) AS recipients
         FROM lists l
         WHERE NOT EXISTS (SELECT 1 FROM list_recipients WHERE list_id = l.id AND user_id = $1)
           AND l.is_public -- only published lists
           AND (EXISTS (SELECT 1 FROM list_admins WHERE list_id = l.id AND user_id = $1)
                OR EXISTS (SELECT 1 FROM list_groups lg
                           JOIN group_members gm ON gm.group_id = lg.group_id
                           WHERE lg.list_id = l.id AND gm.user_id = $1))
         ORDER BY archived, l.end_date, l.title`,
        [req.user.id]
    );
    res.json({ data: rows, santas });
});

/* --- GET /api/gifts/candidates?listId=5 → { data } – who a new surprise gift on the list can be shared with --- */
// Adults in the list's groups who aren't its recipients – the same rule as for a saved gift
router.get("/candidates", async (req, res) => {
    const listId = parseId(req.query.listId);
    await requireLinkableList(pool, listId, req.user.id);
    const people = await shareCandidates(pool, { listId });
    res.json({ data: people.filter((p) => p.id !== req.user.id) });
});

/* --- GET /api/gifts/events → { data } – my events of my own ("Loggade gåvor"), to log another gift on --- */
// Mine = an event with a gift I'm in. Coming ones first (soonest first), then past ones (latest first).
router.get("/events", async (req, res) => {
    const { rows } = await pool.query(
        `SELECT e.id, e.name, e.event_date AS "date", e.recipient_id AS "recipientId",
                e.recipient_text AS "recipientText", e.recipient_unknown AS "recipientUnknown",
                COALESCE(u.name, e.recipient_text, CASE WHEN e.recipient_unknown THEN 'Okänd mottagare' END) AS "recipientName",
                e.event_date < ${TODAY} AS archived
         FROM gift_events e
         LEFT JOIN users u ON u.id = e.recipient_id
         WHERE EXISTS (SELECT 1 FROM gifts g JOIN gift_members gm ON gm.gift_id = g.id
                       WHERE g.event_id = e.id AND gm.user_id = $1)
         ORDER BY archived, CASE WHEN e.event_date >= ${TODAY} THEN e.event_date END,
                  e.event_date DESC, e.name`,
        [req.user.id]
    );
    res.json({ data: rows });
});

/* --- GET /api/gifts/recipient-names → { data: ["Farmor", …] } – the 10 latest names I've typed in as a recipient --- */
// For the suggestions under "…eller skriv ett namn". From events with a gift I'm in, the most recent first.
router.get("/recipient-names", async (req, res) => {
    const { rows } = await pool.query(
        `SELECT e.recipient_text AS name
         FROM gift_events e
         WHERE e.recipient_text IS NOT NULL
           AND EXISTS (SELECT 1 FROM gifts g JOIN gift_members gm ON gm.gift_id = g.id
                       WHERE g.event_id = e.id AND gm.user_id = $1)
         GROUP BY e.recipient_text
         ORDER BY max(e.updated_at) DESC
         LIMIT 10`,
        [req.user.id]
    );
    res.json({ data: rows.map((r) => r.name) });
});

/* --- PUT /api/gifts/events/:id  { name, giftDate, recipientId?, recipientText? } – change an event of my own --- */
// Anyone in one of its gifts may. It changes for all the event's gifts.
const EventBody = GiftBody.pick({ recipient: true, giftDate: true, recipientId: true, recipientText: true });

router.put("/events/:id", async (req, res) => {
    const eventId = parseId(req.params.id);
    const body = parse(EventBody, req.body ?? {});
    if (!body.recipient) throw new HttpError(400, "Ange händelsens namn");
    if (!body.giftDate) throw new HttpError(400, "Ange ett datum");
    await requireMyEvent(pool, eventId, req.user.id);

    const { rows: [current] } = await pool.query("SELECT recipient_id FROM gift_events WHERE id = $1", [eventId]);
    if (body.recipientId && body.recipientId !== current?.recipient_id) {
        await requireLinkablePerson(pool, body.recipientId, req.user.id);
    }
    const recipientText = body.recipientId ? null : body.recipientText;
    await pool.query(
        `UPDATE gift_events SET name = $1, event_date = $2, recipient_id = $3::int, recipient_text = $4::text,
                -- "Okänd mottagare" stays until someone is linked or a name is written
                recipient_unknown = recipient_unknown AND $3::int IS NULL AND $4::text IS NULL,
                updated_at = now()
         WHERE id = $5`,
        [body.recipient, body.giftDate, body.recipientId, recipientText, eventId]
    );
    res.json({ id: eventId });
});

/* --- DELETE /api/gifts/events/:id → { deleted, giftsDeleted } – delete an event of my own and all its gifts --- */
// Only for someone who is in EVERY gift on it – nobody deletes a gift they can't see. The gifts go for
// everyone who shares them; the event goes with its last gift (trigger), and so do images nothing else uses.
router.delete("/events/:id", async (req, res) => {
    const eventId = parseId(req.params.id);
    await requireMyEvent(pool, eventId, req.user.id);

    const { imageUrls, count } = await withTransaction(async (db) => {
        const { rows: gifts } = await db.query(
            `SELECT g.id, g.image_url,
                    EXISTS (SELECT 1 FROM gift_members WHERE gift_id = g.id AND user_id = $2) AS mine
             FROM gifts g WHERE g.event_id = $1 FOR UPDATE OF g`,
            [eventId, req.user.id]
        );
        if (gifts.some((g) => !g.mine)) {
            throw new HttpError(403, "Händelsen har gåvor som du inte är med i, så du kan inte ta bort den.");
        }
        await db.query("DELETE FROM gifts WHERE event_id = $1", [eventId]);
        return { imageUrls: gifts.map((g) => g.image_url), count: gifts.length };
    });

    await removeUnusedImages(imageUrls, "EVENT");
    res.json({ deleted: eventId, giftsDeleted: count });
});

/* --- GET /api/gifts/:id → { gift, wish, list, person, members, candidates } (member) --- */
// person: who it's for, when the wish is on a wish profile instead of a list
router.get("/:id", async (req, res) => {
    const giftId = parseId(req.params.id);
    const gift = await loadGift(pool, giftId, req.user.id);

    const [wish, list, person, members, others, candidates, santa] = await Promise.all([
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
            `SELECT u.id, u.name, u.username, u.avatar_icon AS "avatarIcon", u.avatar_color AS "avatarColor", gm.amount
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
        // The Secret Santa it belongs to, with who I give to – only if I'm still the giver
        gift.santa_id
            ? pool.query(
                  `SELECT s.id, s.title, s.event_date AS "date", u.name AS receiver
                   FROM secret_santas s
                   JOIN secret_santa_pairs p ON p.santa_id = s.id AND p.giver_id = $2
                   JOIN users u ON u.id = p.receiver_id
                   WHERE s.id = $1`,
                  [gift.santa_id, req.user.id]
              )
            : { rows: [null] },
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
            santaId: gift.santa_id,
            eventId: gift.event_id,
            recipient: gift.recipient, // the event's name
            recipientId: gift.recipient_id,
            recipientName: gift.recipient_name,
            // A name in free text, and "the recipient's account was deleted" (then shown as "Okänd mottagare")
            recipientText: gift.recipient_text,
            recipientUnknown: gift.recipient_unknown,
            // The event's date – or, for a gift from a wish profile, its own
            giftDate: gift.event_id ? gift.event_date : gift.gift_date,
        },
        wish: wish.rows[0],
        list: list.rows[0],
        person: person.rows[0],
        santa: santa.rows[0] ?? null,
        members: members.rows,
        candidates,
    });
});

// A gift outside the list: a title, and a list OR a Secret Santa OR an event (an existing one, or a name and a date)
function checkFreeGift(body) {
    if (!body.title) throw new HttpError(400, "Ange en titel");
    if (body.listId && body.santaId) throw new HttpError(400, "Välj en lista eller en Secret Santa – inte båda");
    if (!body.listId && !body.santaId && !body.eventId) {
        if (!body.recipient) throw new HttpError(400, "Välj en lista, eller skriv vad det är för händelse");
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
    // A surprise gift on a list can be shared right away (members + split, like when changing a gift).
    // Anything else starts with only me.
    let body = parse(GiftBody, req.body ?? {});
    if (!body.listId || !body.members?.length) {
        body = { ...body, members: [{ userId: req.user.id, amount: null }], split: "equal" };
    }
    checkFreeGift(body);
    const userIds = checkSplit(body);
    if (!userIds.includes(req.user.id)) throw new HttpError(400, "Du måste själv vara med i gåvan du skapar");
    if (body.listId) {
        await requireLinkableList(pool, body.listId, req.user.id);
        const others = userIds.filter((id) => id !== req.user.id);
        if (others.length > 0) {
            const allowed = (await shareCandidates(pool, { listId: body.listId }, others)).map((u) => u.id);
            if (others.some((id) => !allowed.includes(id))) {
                throw new HttpError(400, "Du kan bara dela med vuxna i listans grupper som inte är mottagare");
            }
        }
    }
    if (body.santaId) await requireMySanta(pool, body.santaId, req.user.id);
    if (body.listId || body.santaId) body.eventId = null;
    if (body.eventId) await requireMyEvent(pool, body.eventId, req.user.id);
    // A new event of my own: its name, date and person – only without a list, a Secret Santa or an existing event
    const newEvent = !body.listId && !body.santaId && !body.eventId;
    if (newEvent && body.recipientId) await requireLinkablePerson(pool, body.recipientId, req.user.id);

    const imageUrl = await uploadNewGiftImage(req.file, body.imageFromUrl);
    try {
        const id = await withTransaction(async (db) => {
            let eventId = body.eventId;
            if (newEvent) {
                const { rows: [event] } = await db.query(
                    `INSERT INTO gift_events (name, event_date, recipient_id, recipient_text, created_by)
                     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    // A linked person wins over a name in free text
                    [body.recipient, body.giftDate, body.recipientId, body.recipientId ? null : body.recipientText, req.user.id]
                );
                eventId = event.id;
            }
            const { rows: [gift] } = await db.query(
                `INSERT INTO gifts (created_by, quantity, title, price, comment, description, url, image_url,
                                    list_id, santa_id, event_id, split)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
                [
                    req.user.id, body.quantity, body.title, body.price, body.comment, body.description, body.url, imageUrl,
                    body.listId, body.santaId, eventId, body.split,
                ]
            );
            await replaceMembers(db, gift.id, body, userIds);
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
   Outside list:  + { title, description, url, image / imageFromUrl / removeImage }.
                  The link (list / Secret Santa / event of my own) never changes – an event is edited on its own route. */
router.put("/:id", receiveImage, async (req, res) => {
    const giftId = parseId(req.params.id);
    const body = parse(GiftBody, req.body ?? {});
    const userIds = checkSplit(body);

    // Who I am in it, and what kind it is – before uploading any image
    const before = await loadGift(pool, giftId, req.user.id);
    if (before.is_free) {
        // What it's linked to (a list, a Secret Santa or an own event) is decided when it's created and
        // can't change – whatever arrives is replaced by what it already has
        // A logged gift stays on its event; the event itself is changed with PUT /api/gifts/events/:id
        body.listId = before.own_list_id;
        body.santaId = before.santa_id;
        body.eventId = before.event_id;
        checkFreeGift(body);
        if (body.santaId && userIds.length > 1) throw new HttpError(400, "En gåva till en Secret Santa kan inte delas.");
        // Without a list nobody new can join – but those already in it may stay (a gift whose list or
        // Secret Santa was deleted keeps everyone who shared it)
        if (!body.listId && !body.santaId) {
            const { rows: current } = await pool.query("SELECT user_id FROM gift_members WHERE gift_id = $1", [giftId]);
            const currentIds = current.map((r) => r.user_id);
            if (userIds.some((id) => !currentIds.includes(id))) {
                throw new HttpError(400, "En gåva utan lista kan inte delas med fler. Välj en lista, eller ta bort de nya.");
            }
        }
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
                            title = $5, description = $6, url = $7, image_url = $8, updated_at = now()
                     WHERE id = $9`,
                    [
                        body.quantity, body.price, body.comment, body.split,
                        body.title, body.description, body.url, imageUrl,
                        giftId,
                    ]
                );
            } else {
                // A gift from a wish profile has its own date, and must keep one – unless it's for a Secret Santa
                // (the draw's date). On a list it's the list's date.
                const ownDate = gift.wish_owner_id !== null && !gift.santa_id;
                if (ownDate && !body.giftDate) throw new HttpError(400, "Ange när gåvan ska ges");
                if (gift.santa_id && userIds.length > 1) throw new HttpError(400, "En gåva till en Secret Santa kan inte delas.");
                await db.query(
                    `UPDATE gifts SET quantity = $1, price = $2, comment = $3, split = $4, gift_date = $5, updated_at = now()
                     WHERE id = $6`,
                    [body.quantity, body.price, body.comment, body.split, ownDate ? body.giftDate : null, giftId]
                );
            }
            await replaceMembers(db, giftId, body, userIds);
        });
    } catch (err) {
        if (newImageUrl) await removeWishImages([newImageUrl]).catch(() => {});
        throw err;
    }

    if (oldImageUrl) {
        await removeUnusedImages([oldImageUrl], "GIFT");
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

    // Several gifts can share an image (copies of the same wish) – only delete it when none uses it
    if (imageUrl) await removeUnusedImages([imageUrl], "GIFT");
    res.json({ deleted: giftId });
});

export default router;
