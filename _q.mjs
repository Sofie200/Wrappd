import pg from "pg";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")]}));
const c = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 15000 });
await c.connect();
const r = await c.query("SELECT id, name, username, is_child, password_hash IS NOT NULL AS activated, created_at FROM users WHERE id BETWEEN 4 AND 11 ORDER BY id");
console.table(r.rows);
const all = await c.query("SELECT count(*) FROM users"); console.log("users total", all.rows[0].count);
await c.end();
