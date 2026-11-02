import { Router } from "express";
import { z } from "zod";
import { pool, TODAY, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId } from "../_lib/http.js";
import { name, username } from "../_lib/userSchema.js";
import { createUserLink } from "../_lib/userLinks.js";
import { syncChildGroups } from "../_lib/childGroups.js";

const router = Router();

const GroupBody = z.object({
    name: z
        .string({ error: "Ange ett namn på gruppen" })
        .trim()
        .min(1, "Ange ett namn på gruppen")
        .max(80, "Namnet får vara högst 80 tecken"),
});

// "Inkludera barn": all members' children become members automatically (see _lib/childGroups.js)
const CreateGroup = GroupBody.extend({
    includeChildren: z.boolean().optional().default(false),
});

async function requireMember(db, groupId, userId) {
    const { rows: [member] } = await db.query(
        "SELECT is_admin FROM group_members WHERE group_id = $1 AND user_id = $2",
        [groupId, userId]
    );
    // 404, not 403: people outside the group shouldn't learn that it exists
    if (!member) throw new HttpError(404, "Gruppen finns inte");
    return member;
}

async function requireGroupAdmin(db, groupId, userId) {
    const member = await requireMember(db, groupId, userId);
    if (!member.is_admin) throw new HttpError(403, "Bara gruppens admins kan göra det här");
    return member;
}

/* --- GET /api/groups → { data: [{ id, name, isAdmin, includeChildren, memberCount }] } – my groups --- */
router.get("/", async (req, res) => {
    const { rows } = await pool.query(
        `SELECT g.id, g.name, gm.is_admin AS "isAdmin", g.include_children AS "includeChildren",
                (SELECT count(*)::int FROM group_members WHERE group_id = g.id) AS "memberCount"
         FROM groups g
         JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
         ORDER BY g.name`,
        [req.user.id]
    );
    res.json({ data: rows });
});

/* --- POST /api/groups  { name, includeChildren? } → { id } – the creator becomes admin --- */
// includeChildren: every member's children are members automatically – mine from the start
router.post("/", async (req, res) => {
    const { name, includeChildren } = parse(CreateGroup, req.body);

    const id = await withTransaction(async (db) => {
        const { rows: [group] } = await db.query(
            "INSERT INTO groups (name, include_children, created_by) VALUES ($1, $2, $3) RETURNING id",
            [name, includeChildren, req.user.id]
        );
        await db.query(
            "INSERT INTO group_members (group_id, user_id, is_admin) VALUES ($1, $2, true)",
            [group.id, req.user.id]
        );
        await syncChildGroups(db);
        return group.id;
    });

    res.status(201).json({ id });
});

/* --- GET /api/groups/members?ids=1,2 → { data: [{ id, name, username }] } --- */
// Everyone who is a member of any of the groups – used to pick recipients and admins of a list.
// Allowed for groups I am a member of, and for groups on a list I administer.
const MemberQuery = z.object({
    ids: z
        .string({ error: "Välj minst en grupp" })
        .regex(/^\d{1,9}(,\d{1,9}){0,49}$/, "Ogiltiga grupper")
        .transform((s) => [...new Set(s.split(",").map(Number))]),
});

router.get("/members", async (req, res) => {
    const { ids } = parse(MemberQuery, req.query);

    const { rows: [{ count }] } = await pool.query(
        `SELECT count(*)::int AS count FROM groups g
         WHERE g.id = ANY($1::int[])
           AND (EXISTS (SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = $2)
                OR EXISTS (SELECT 1 FROM list_groups lg
                           JOIN list_admins la ON la.list_id = lg.list_id
                           WHERE lg.group_id = g.id AND la.user_id = $2))`,
        [ids, req.user.id]
    );
    if (count !== ids.length) throw new HttpError(404, "En av grupperna finns inte");

    const { rows } = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.username, u.password_hash IS NOT NULL AS "isActivated",
                u.is_child AS "isChild",
                (SELECT array_agg(parent_id ORDER BY parent_id) FROM child_parents WHERE child_id = u.id) AS "parentIds"
         FROM users u
         JOIN group_members gm ON gm.user_id = u.id
         WHERE gm.group_id = ANY($1::int[])
         ORDER BY u.name, u.username`,
        [ids]
    );
    res.json({ data: rows });
});

/* --- GET /api/groups/:id → { group, me, members, lists } --- */
router.get("/:id", async (req, res) => {
    const groupId = parseId(req.params.id);
    const me = await requireMember(pool, groupId, req.user.id);

    const { rows: [group] } = await pool.query(
        `SELECT id, name, include_children AS "includeChildren" FROM groups WHERE id = $1`,
        [groupId]
    );

    const { rows: members } = await pool.query(
        `SELECT u.id, u.name, u.username, gm.is_admin AS "isAdmin",
                u.avatar_icon AS "avatarIcon", u.avatar_color AS "avatarColor",
                u.password_hash IS NOT NULL AS "isActivated",
                u.is_child AS "isChild",
                (SELECT string_agg(p.name, ', ' ORDER BY p.name) FROM child_parents cp
                 JOIN users p ON p.id = cp.parent_id WHERE cp.child_id = u.id) AS parents
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = $1
         ORDER BY gm.is_admin DESC, u.is_child, u.name`,
        [groupId]
    );

    // Public lists in the group, plus private ones I administer.
    // Lists to me are included (marked isRecipient) – the frontend shows them without a link.
    const { rows: lists } = await pool.query(
        `SELECT l.id, l.title, l.end_date AS "endDate", l.is_public AS "isPublic",
                l.end_date < ${TODAY} AS archived,
                EXISTS (SELECT 1 FROM list_admins WHERE list_id = l.id AND user_id = $2) AS "isAdmin",
                EXISTS (SELECT 1 FROM list_recipients WHERE list_id = l.id AND user_id = $2) AS "isRecipient",
                (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM list_recipients lr
                 JOIN users u ON u.id = lr.user_id WHERE lr.list_id = l.id) AS recipients
         FROM lists l
         JOIN list_groups lg ON lg.list_id = l.id AND lg.group_id = $1
         WHERE l.is_public OR EXISTS (SELECT 1 FROM list_admins WHERE list_id = l.id AND user_id = $2)
         ORDER BY archived, l.end_date, l.title`,
        [groupId, req.user.id]
    );

    res.json({ group, me: { isAdmin: me.is_admin }, members, lists });
});

/* --- PATCH /api/groups/:id  { name } – rename (admin) --- */
router.patch("/:id", async (req, res) => {
    const groupId = parseId(req.params.id);
    await requireGroupAdmin(pool, groupId, req.user.id);
    const { name } = parse(GroupBody, req.body);

    await pool.query("UPDATE groups SET name = $1 WHERE id = $2", [name, groupId]);
    res.json({ id: groupId, name });
});

/* --- POST /api/groups/:id/members  { userId } – add a member directly, no invitation (admin) --- */
const AddMember = z.object({ userId: z.coerce.number({ error: "Välj en användare" }).int().positive() });

// If the group includes children, the new member's children come along automatically
router.post("/:id/members", async (req, res) => {
    const groupId = parseId(req.params.id);
    const { userId } = parse(AddMember, req.body);

    await withTransaction(async (db) => {
        await requireGroupAdmin(db, groupId, req.user.id);

        const { rows: [user] } = await db.query("SELECT id, is_child FROM users WHERE id = $1", [userId]);
        if (!user) throw new HttpError(404, "Användaren finns inte");
        if (user.is_child) throw new HttpError(403, "Barn kommer med automatiskt via sina föräldrar");

        await db.query(
            "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [groupId, userId]
        );
        await syncChildGroups(db);
    });
    res.status(201).json({ added: userId });
});

/* --- POST /api/groups/:id/users  { name, username } → { user, link } – create an account (admin) --- */
// The new user is added to the group directly. They choose their own password via the link.
const NewUser = z.object({ name, username });

router.post("/:id/users", async (req, res) => {
    const groupId = parseId(req.params.id);
    const body = parse(NewUser, req.body);

    const result = await withTransaction(async (db) => {
        await requireGroupAdmin(db, groupId, req.user.id);

        let user;
        try {
            ({ rows: [user] } = await db.query(
                `INSERT INTO users (name, username, created_by) VALUES ($1, $2, $3)
                 RETURNING id, name, username`,
                [body.name, body.username, req.user.id]
            ));
        } catch (err) {
            if (err.code === "23505") throw new HttpError(409, "Användarnamnet är redan upptaget");
            throw err;
        }

        await db.query("INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)", [groupId, user.id]);
        const link = await createUserLink(db, { userId: user.id, purpose: "activate", createdBy: req.user.id });
        return { user, link };
    });

    res.status(201).json(result);
});

/* --- POST /api/groups/:id/members/:userId/link → { user, link } – a new link (admin) --- */
// Not activated yet: a new activation link (the old one stops working).
// Activated: a link to choose a new password. The current password works until the link is used.
router.post("/:id/members/:userId/link", async (req, res) => {
    const groupId = parseId(req.params.id);
    const userId = parseId(req.params.userId);
    if (userId === req.user.id) throw new HttpError(400, "Du kan inte skapa en länk till dig själv");

    const result = await withTransaction(async (db) => {
        await requireGroupAdmin(db, groupId, req.user.id);

        const { rows: [user] } = await db.query(
            `SELECT u.id, u.name, u.username, u.is_child, u.password_hash IS NOT NULL AS "isActivated"
             FROM group_members gm JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = $1 AND gm.user_id = $2`,
            [groupId, userId]
        );
        if (!user) throw new HttpError(404, "Användaren är inte med i gruppen");
        if (user.is_child) throw new HttpError(400, "Barn kan inte logga in och får därför ingen länk");

        const link = await createUserLink(db, {
            userId,
            purpose: user.isActivated ? "reset" : "activate",
            createdBy: req.user.id,
        });
        return { user: { id: user.id, name: user.name, username: user.username }, link };
    });

    res.status(201).json(result);
});

/* --- PATCH /api/groups/:id/members/:userId  { isAdmin } – make or unmake admin (admin) --- */
const SetAdmin = z.object({ isAdmin: z.boolean({ error: "isAdmin måste vara true eller false" }) });

router.patch("/:id/members/:userId", async (req, res) => {
    const groupId = parseId(req.params.id);
    const userId = parseId(req.params.userId);
    const { isAdmin } = parse(SetAdmin, req.body);

    await withTransaction(async (db) => {
        // Lock the group, so two requests can't remove the last two admins at the same time
        await db.query("SELECT id FROM groups WHERE id = $1 FOR UPDATE", [groupId]);
        await requireGroupAdmin(db, groupId, req.user.id);

        const { rows: [target] } = await db.query(
            `SELECT gm.is_admin, u.is_child FROM group_members gm JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = $1 AND gm.user_id = $2`,
            [groupId, userId]
        );
        if (!target) throw new HttpError(404, "Användaren är inte med i gruppen");
        if (target.is_child) throw new HttpError(400, "Barn kan inte vara admins");

        if (target.is_admin && !isAdmin) {
            const { rows: [{ count }] } = await db.query(
                "SELECT count(*)::int AS count FROM group_members WHERE group_id = $1 AND is_admin",
                [groupId]
            );
            if (count <= 1) throw new HttpError(400, "Gruppen måste ha minst en admin");
        }

        await db.query(
            "UPDATE group_members SET is_admin = $1 WHERE group_id = $2 AND user_id = $3",
            [isAdmin, groupId, userId]
        );
    });

    res.json({ userId, isAdmin });
});

/* --- DELETE /api/groups/:id/members/:userId – remove a member (admin), or leave the group (yourself) --- */
// The member's children leave with them, unless the other parent is still in the group.
router.delete("/:id/members/:userId", async (req, res) => {
    const groupId = parseId(req.params.id);
    const userId = parseId(req.params.userId);
    const leaving = userId === req.user.id;

    await withTransaction(async (db) => {
        await db.query("SELECT id FROM groups WHERE id = $1 FOR UPDATE", [groupId]);
        const me = await requireMember(db, groupId, req.user.id);
        if (!leaving && !me.is_admin) throw new HttpError(403, "Bara gruppens admins kan ta bort medlemmar");

        const { rows: [target] } = await db.query(
            `SELECT gm.is_admin, u.is_child FROM group_members gm JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = $1 AND gm.user_id = $2`,
            [groupId, userId]
        );
        if (!target) throw new HttpError(404, "Användaren är inte med i gruppen");
        // Children follow their parents – they can't be removed on their own
        if (target.is_child) throw new HttpError(403, "Barn är med automatiskt via sina föräldrar och kan inte tas bort för sig");

        if (target.is_admin) {
            const { rows: [{ count }] } = await db.query(
                "SELECT count(*)::int AS count FROM group_members WHERE group_id = $1 AND is_admin",
                [groupId]
            );
            if (count <= 1) {
                throw new HttpError(
                    400,
                    leaving
                        ? "Du är gruppens enda admin. Gör någon annan till admin innan du lämnar."
                        : "Gruppen måste ha minst en admin"
                );
            }
        }

        await db.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
        // Their children leave too – unless the other parent is still in the group
        await syncChildGroups(db);
    });

    res.json({ removed: userId });
});

export default router;
