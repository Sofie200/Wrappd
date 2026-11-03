// Secret Santa: a member of a group picks a date and who takes part. Everyone is drawn to give a
// gift to someone else. Only the giver ever learns who they got – the API never sends anyone
// else's pair, not even to the one who made the draw.
import { randomInt } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../_db/pool.js";
import { HttpError, parse, parseId, todayInSweden } from "../_lib/http.js";
import { money } from "../_lib/money.js";

const router = Router();

const MIN_PARTICIPANTS = 3; // with two, both would know who the other got

const NewSanta = z.object({
    groupId: z.coerce.number({ error: "Välj en grupp" }).int().positive(),
    title: z.string().trim().max(80, "Namnet får vara högst 80 tecken").optional().transform((v) => v || "Secret Santa"),
    date: z.iso.date({ error: "Ange ett giltigt datum" }),
    budget: money("Ange en budget, t.ex. 300"),
    memberIds: z
        .array(z.coerce.number().int().positive(), { error: "Välj vilka som är med" })
        .max(200)
        .transform((ids) => [...new Set(ids)])
        .refine((ids) => ids.length >= MIN_PARTICIPANTS, `Välj minst ${MIN_PARTICIPANTS} deltagare`),
});

// Shuffle (Fisher–Yates, with a cryptographic random source), then everyone gives to the next one
// in the shuffled order, and the last one to the first. One big circle: nobody draws themselves,
// everyone gives exactly once and gets exactly once, and no two people simply swap gifts.
export function drawPairs(ids) {
    const order = [...ids];
    for (let i = order.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order.map((giverId, i) => ({ giverId, receiverId: order[(i + 1) % order.length] }));
}

/* --- POST /api/santas  { groupId, title?, date, budget?, memberIds } → { id } – make the draw --- */
router.post("/", async (req, res) => {
    const body = parse(NewSanta, req.body);
    if (body.date < todayInSweden()) throw new HttpError(400, "Datumet kan inte ha passerat");

    const id = await withTransaction(async (db) => {
        const { rows: [me] } = await db.query(
            "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2",
            [body.groupId, req.user.id]
        );
        if (!me) throw new HttpError(403, "Du kan bara göra en Secret Santa i grupper du är med i");

        // Only adults in the group – children can't log in, so they could never see who they got
        const { rows: members } = await db.query(
            `SELECT u.id FROM group_members gm JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = $1 AND NOT u.is_child AND u.id = ANY($2::int[])`,
            [body.groupId, body.memberIds]
        );
        if (members.length !== body.memberIds.length) {
            throw new HttpError(400, "Alla deltagare måste vara vuxna medlemmar i gruppen");
        }

        const { rows: [santa] } = await db.query(
            `INSERT INTO secret_santas (group_id, title, event_date, budget, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [body.groupId, body.title, body.date, body.budget, req.user.id]
        );

        const pairs = drawPairs(body.memberIds);
        await db.query(
            `INSERT INTO secret_santa_pairs (santa_id, giver_id, receiver_id)
             SELECT $1, unnest($2::int[]), unnest($3::int[])`,
            [santa.id, pairs.map((p) => p.giverId), pairs.map((p) => p.receiverId)]
        );
        return santa.id;
    });

    res.status(201).json({ id });
});

/* --- DELETE /api/santas/:id – cancel the draw (the one who made it) --- */
router.delete("/:id", async (req, res) => {
    const santaId = parseId(req.params.id);
    const { rowCount } = await pool.query(
        "DELETE FROM secret_santas WHERE id = $1 AND created_by = $2",
        [santaId, req.user.id]
    );
    if (rowCount === 0) throw new HttpError(404, "Secret Santa finns inte, eller så är det inte du som har lottat den");
    res.json({ deleted: santaId });
});

export default router;
