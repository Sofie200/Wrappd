import pg from "pg";

// DATE → "2026-12-24" as text. Otherwise pg makes a JS Date at local midnight,
// and JSON can shift it a day when it's converted to UTC.
pg.types.setTypeParser(1082, (value) => value);
// NUMERIC → number (pg returns it as a string by default)
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

// Few connections: on Vercel every function instance gets its own pool
export const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10_000, // timeout: connecting to Neon
    statement_timeout: 10_000,       // timeout: one query
    idleTimeoutMillis: 10_000,
});

// Neon closes connections that have been idle for a while (and Vercel freezes the function in between).
// When that happens to a connection resting in the pool, pg emits "error" on the pool – and an "error"
// event nobody listens to crashes the whole function. Here it's only logged; the pool drops that
// connection and opens a new one next time.
pool.on("error", (err) => {
    console.warn("[DB] An idle connection was closed:", err.message);
});

// "Today" in Sweden, in SQL. The server runs in UTC on Vercel.
export const TODAY = `(now() AT TIME ZONE 'Europe/Stockholm')::date`;

// Runs fn(client) in one transaction: everything is saved, or nothing.
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}
