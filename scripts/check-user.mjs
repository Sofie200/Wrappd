// Shows everything in the database that still points to a user – e.g. to check that a deletion worked.
// Only reads, changes nothing. Run from the project root:
//
//   node scripts/check-user.mjs 23
import "dotenv/config";
import pg from "pg";

const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
    console.error("Usage: node scripts/check-user.mjs <user id>");
    process.exit(1);
}
const checks = {
  "users (själva kontot)": "SELECT count(*) FROM users WHERE id = $1",
  "users.created_by": "SELECT count(*) FROM users WHERE created_by = $1",
  "child_parents (som barn)": "SELECT count(*) FROM child_parents WHERE child_id = $1",
  "child_parents (som förälder)": "SELECT count(*) FROM child_parents WHERE parent_id = $1",
  "user_links": "SELECT count(*) FROM user_links WHERE user_id = $1 OR created_by = $1",
  "groups.created_by": "SELECT count(*) FROM groups WHERE created_by = $1",
  "group_members": "SELECT count(*) FROM group_members WHERE user_id = $1",
  "lists.created_by": "SELECT count(*) FROM lists WHERE created_by = $1",
  "list_admins": "SELECT count(*) FROM list_admins WHERE user_id = $1",
  "list_recipients": "SELECT count(*) FROM list_recipients WHERE user_id = $1",
  "wishes (önskeprofil)": "SELECT count(*) FROM wishes WHERE user_id = $1",
  "gifts.created_by": "SELECT count(*) FROM gifts WHERE created_by = $1",
  "gifts.recipient_id": "SELECT count(*) FROM gifts WHERE recipient_id = $1",
  "gift_members": "SELECT count(*) FROM gift_members WHERE user_id = $1",
  "secret_santas.created_by": "SELECT count(*) FROM secret_santas WHERE created_by = $1",
  "secret_santa_pairs": "SELECT count(*) FROM secret_santa_pairs WHERE giver_id = $1 OR receiver_id = $1",
};
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
await c.connect();
let total = 0;
for (const [name, sql] of Object.entries(checks)) {
  const { rows: [{ count }] } = await c.query(sql, [id]);
  total += Number(count);
  console.log(String(count).padStart(4), name);
}
// Any other column referencing users that the list above might miss
const { rows: fks } = await c.query(`
  SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users' ORDER BY 1, 2`);
console.log("\nAlla kolumner som pekar på users:", fks.map((f) => `${f.table_name}.${f.column_name}`).join(", "));
console.log(total === 0 ? `\nInget pekar på användare ${id} – allt är borta.` : `\nTotalt ${total} rader pekar fortfarande på användare ${id}.`);
await c.end();
