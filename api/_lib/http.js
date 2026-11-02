// Small helpers for errors and validation, shared by every route.

// An error with a status code and a message the user can read. The error handler in index.js sends it.
export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Validate with Zod. The first problem becomes a 400 with its (Swedish) message.
export function parse(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new HttpError(400, result.error.issues[0]?.message ?? "Ogiltig förfrågan");
    }
    return result.data;
}

// "12" → 12. Anything else → 400, so Postgres never gets WHERE id = 'abc'.
export function parseId(value) {
    if (!/^\d{1,9}$/.test(String(value))) throw new HttpError(400, "Ogiltigt id");
    return Number(value);
}

// "2026-11-01" – today's date in Sweden, to compare with end dates
export function todayInSweden() {
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}
