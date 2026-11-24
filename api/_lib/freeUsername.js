// A free username made from a name: "Åsa Berg" → "asaberg", or "asaberg4821" if that one is taken.
// Used for Google sign-ups (a suggestion from the first name) and for users a group admin creates
// (from the whole name - the person can pick another one when they choose their password).
import { HttpError } from "./http.js";

export async function freeUsername(db, wanted) {
    // "Åsa" → "asa": strip accents first, then everything a username can't contain
    let base = String(wanted)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 25);
    if (base.length < 3) base = `${base}user`.slice(0, 25);
    for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
        const { rowCount } = await db.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
        if (rowCount === 0) return candidate;
    }
    throw new HttpError(500, "Kunde inte hitta ett ledigt användarnamn. Försök igen.");
}
