// Deletes users and all their data. Run from the project root:
//
//   node scripts/delete-users.mjs 4 5 6          → shows what would be deleted (nothing is changed)
//   node scripts/delete-users.mjs 4 5 6 --yes    → deletes it
//
// What goes:
//  - the users, with everything that hangs on them by ON DELETE CASCADE: memberships, admin roles,
//    their gifts (and their share in others' gifts), their wish profile, Secret Santa pairs, links …
//  - lists they created, and lists where all the recipients are among them (with wishes and gifts on them)
//  - groups that no one is left in
//  - the images (Vercel Blob) of the wishes and gifts that are deleted
// What's kept, but handed over:
//  - groups with other members left: another member becomes the creator, and admin if no admin is left
import "dotenv/config";
import pg from "pg";
import { removeWishImages } from "../api/_integrations/storageAdapter.js";

const args = process.argv.slice(2);
const execute = args.includes("--yes");
const ids = [...new Set(args.filter((a) => a !== "--yes").map(Number))];
if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    console.error("Usage: node scripts/delete-users.mjs <user id> [<user id> …] [--yes]");
    process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = (sql, params = []) => client.query(sql, params).then((r) => r.rows);

try {
    await client.query("BEGIN");

    const users = await q(
        `SELECT id, name, username, is_child AS "isChild" FROM users WHERE id = ANY($1::int[]) ORDER BY id`,
        [ids]
    );
    const missing = ids.filter((id) => !users.some((u) => u.id === id));

    // Lists they created, or where every recipient is one of them
    const lists = await q(
        `SELECT l.id, l.title FROM lists l
         WHERE l.created_by = ANY($1::int[])
            OR (EXISTS (SELECT 1 FROM list_recipients r WHERE r.list_id = l.id)
                AND NOT EXISTS (SELECT 1 FROM list_recipients r WHERE r.list_id = l.id AND r.user_id <> ALL($1::int[])))
         ORDER BY l.id`,
        [ids]
    );
    const listIds = lists.map((l) => l.id);

    // Groups: empty afterwards → deleted; others they created → handed over
    const groups = await q(
        `SELECT g.id, g.name, g.created_by = ANY($1::int[]) AS "createdByThem",
                (SELECT count(*)::int FROM group_members m WHERE m.group_id = g.id AND m.user_id <> ALL($1::int[])) AS "othersLeft"
         FROM groups g
         WHERE g.created_by = ANY($1::int[])
            OR EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ANY($1::int[]))
         ORDER BY g.id`,
        [ids]
    );
    const emptyGroups = groups.filter((g) => g.othersLeft === 0);
    const handedOver = groups.filter((g) => g.othersLeft > 0 && g.createdByThem);

    const images = await q(
        `SELECT image_url FROM wishes
         WHERE (list_id = ANY($2::int[]) OR user_id = ANY($1::int[])) AND image_url IS NOT NULL
         UNION
         SELECT image_url FROM gifts
         WHERE (list_id = ANY($2::int[]) OR created_by = ANY($1::int[])) AND image_url IS NOT NULL`,
        [ids, listIds]
    );

    console.log("\nAnvändare som tas bort:");
    console.table(users);
    if (missing.length) console.log("Finns inte (hoppas över):", missing.join(", "));
    console.log(`\nListor som tas bort (${lists.length}):`, lists.map((l) => `${l.id} "${l.title}"`).join(", ") || "–");
    console.log(`Grupper som tas bort, ingen kvar i dem (${emptyGroups.length}):`, emptyGroups.map((g) => `${g.id} "${g.name}"`).join(", ") || "–");
    console.log(`Grupper som lämnas över till någon annan (${handedOver.length}):`, handedOver.map((g) => `${g.id} "${g.name}"`).join(", ") || "–");
    console.log(`Bilder som tas bort: ${images.length}`);

    if (!execute) {
        await client.query("ROLLBACK");
        console.log("\nInget är ändrat. Kör igen med --yes för att ta bort.\n");
        process.exit(0);
    }

    // Groups that are kept: someone else becomes creator (an admin if there is one), and admin if none is left
    for (const g of handedOver) {
        const [heir] = await q(
            `SELECT user_id, is_admin FROM group_members
             WHERE group_id = $1 AND user_id <> ALL($2::int[])
             ORDER BY is_admin DESC, user_id LIMIT 1`,
            [g.id, ids]
        );
        await q("UPDATE groups SET created_by = $1 WHERE id = $2", [heir.user_id, g.id]);
        if (!heir.is_admin) {
            await q("UPDATE group_members SET is_admin = true WHERE group_id = $1 AND user_id = $2", [g.id, heir.user_id]);
        }
    }

    await q("DELETE FROM lists WHERE id = ANY($1::int[])", [listIds]);
    const emptyIds = emptyGroups.map((g) => g.id);
    await q("DELETE FROM list_groups WHERE group_id = ANY($1::int[])", [emptyIds]); // no cascade on that key
    await q("DELETE FROM groups WHERE id = ANY($1::int[])", [emptyIds]);
    await q("DELETE FROM users WHERE id = ANY($1::int[])", [ids]);

    await client.query("COMMIT");
    console.log("\nKlart – borttaget.");

    await removeWishImages(images.map((r) => r.image_url)).catch((err) =>
        console.warn("Kunde inte ta bort alla bilder (databasen är redan klar):", err.message)
    );
    console.log(images.length ? "Bilderna är borttagna.\n" : "");
} catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nAvbrutet – inget är ändrat:", err.message);
    process.exitCode = 1;
} finally {
    await client.end();
}
