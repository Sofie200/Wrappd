// Wish profiles: what a person wishes for, without a list. Free text, categories they like or
// don't like, and their own wishes – which others can reserve (they become gifts, like on a list).
// Who may do what is in getPersonAccess (_lib/access.js). The person never sees what is reserved.
import { Router } from "express";
import { pool, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId } from "../_lib/http.js";
import { getPersonAccess, requireEditor } from "../_lib/access.js";
import { ProfileBody } from "../_lib/profileSchema.js";
import { WishBody } from "../_lib/wishSchema.js";
import { uploadNewProfileWishImage } from "../_lib/wishImage.js";
import { receiveImage } from "../_middleware/imageUpload.js";
import { removeWishImages } from "../_integrations/storageAdapter.js";

const router = Router();

// A wish profile is a short "this is what I'd like" – the lists are for more
export const MAX_PROFILE_WISHES = 3;
const TOO_MANY = `Du kan ha högst ${MAX_PROFILE_WISHES} önskningar på en önskeprofil`;

async function profileWishCount(db, personId) {
    const { rows: [{ count }] } = await db.query("SELECT count(*)::int AS count FROM wishes WHERE user_id = $1", [personId]);
    return count;
}

/* --- GET /api/people/:id → { person, profile, me, wishes } --- */
// The same wish shape as on a list, so the frontend can use the same components.
// Reservations only for those who may see them – never for the person themselves.
router.get("/:id", async (req, res) => {
    const personId = parseId(req.params.id);
    const access = await getPersonAccess(pool, personId, req.user.id);
    const { person } = access;

    const { rows: wishes } = await pool.query(
        `SELECT id, title, description, price, url, image_url AS "imageUrl", quantity
         FROM wishes WHERE user_id = $1 ORDER BY created_at, id`,
        [personId]
    );

    let result = wishes;
    if (access.seesReservations && wishes.length > 0) {
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
             WHERE w.user_id = $1
             GROUP BY g.id
             ORDER BY g.created_at, g.id`,
            [personId, req.user.id]
        );
        result = wishes.map((wish) => {
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

    res.json({
        person: {
            id: person.id,
            name: person.name,
            username: person.username,
            isChild: person.is_child,
            avatarIcon: person.avatar_icon,
            avatarColor: person.avatar_color,
        },
        profile: { about: person.wish_about, likes: person.likes, dislikes: person.dislikes },
        me: {
            isOwner: person.is_self,
            canEdit: access.canEdit,
            canReserve: access.canReserve,
            seesReservations: access.seesReservations,
        },
        wishes: result,
    });
});

/* --- PUT /api/people/:id/profile  { about, likes, dislikes } – my own, or my child's --- */
router.put("/:id/profile", async (req, res) => {
    const personId = parseId(req.params.id);
    const access = await getPersonAccess(pool, personId, req.user.id);
    requireEditor(access);
    const body = parse(ProfileBody, req.body);

    await pool.query(
        "UPDATE users SET wish_about = $1, likes = $2, dislikes = $3 WHERE id = $4",
        [body.about, body.likes, body.dislikes, personId]
    );
    res.json({ id: personId });
});

/* --- POST /api/people/:id/wishes  (multipart: title, description, price, url, quantity, image) → { id } --- */
// At most MAX_PROFILE_WISHES per person
// Editing and deleting go through /api/wishes/:id, like wishes on lists
router.post("/:id/wishes", receiveImage, async (req, res) => {
    const personId = parseId(req.params.id);
    const access = await getPersonAccess(pool, personId, req.user.id);
    requireEditor(access);
    const body = parse(WishBody, req.body ?? {});

    // Check before uploading the image – no point uploading it if the save will be refused
    if ((await profileWishCount(pool, personId)) >= MAX_PROFILE_WISHES) throw new HttpError(409, TOO_MANY);

    const imageUrl = await uploadNewProfileWishImage(personId, req.file, body.imageFromUrl);
    try {
        const id = await withTransaction(async (db) => {
            // Lock the person, so two wishes added at the same time can't both be number three
            await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [personId]);
            if ((await profileWishCount(db, personId)) >= MAX_PROFILE_WISHES) throw new HttpError(409, TOO_MANY);

            const { rows: [wish] } = await db.query(
                `INSERT INTO wishes (user_id, title, description, price, url, image_url, quantity)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [personId, body.title, body.description, body.price, body.url, imageUrl, body.quantity]
            );
            return wish.id;
        });
        res.status(201).json({ id });
    } catch (err) {
        if (imageUrl) await removeWishImages([imageUrl]).catch(() => {});
        throw err;
    }
});

export default router;
