// Checks a "Sign in with Google" ID token (a JWT signed by Google) - without extra packages.
// Google's public keys are fetched and kept for as long as Google says (Cache-Control max-age).
import { createPublicKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { HttpError } from "./http.js";

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

let cachedKeys = null; // { keys: Map<kid, KeyObject>, expiresAt }

async function fetchKeys() {
    const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Kunde inte hämta Googles nycklar (${res.status})`);
    const { keys } = await res.json();
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
    cachedKeys = {
        keys: new Map(keys.map((jwk) => [jwk.kid, createPublicKey({ key: jwk, format: "jwk" })])),
        expiresAt: Date.now() + maxAge * 1000,
    };
    return cachedKeys.keys;
}

async function publicKey(kid) {
    let keys = cachedKeys && cachedKeys.expiresAt > Date.now() ? cachedKeys.keys : await fetchKeys();
    // Google rotates its keys - an unknown kid means: fetch again once
    if (!keys.has(kid)) keys = await fetchKeys();
    return keys.get(kid);
}

export function googleClientId() {
    return process.env.GOOGLE_CLIENT_ID || null;
}

/** Returns the token's content ({ sub, email, email_verified, name, ... }) or throws 400 (not 401 - that would log out a user who is connecting Google). */
export async function verifyGoogleIdToken(credential) {
    const clientId = googleClientId();
    if (!clientId) throw new HttpError(503, "Inloggning med Google är inte påslagen.");

    const decoded = jwt.decode(credential, { complete: true });
    const key = decoded?.header?.kid && (await publicKey(decoded.header.kid));
    if (!key) throw new HttpError(400, "Inloggningen med Google gick inte att kontrollera. Försök igen.");

    try {
        return jwt.verify(credential, key, { algorithms: ["RS256"], audience: clientId, issuer: ISSUERS });
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            throw new HttpError(400, "Det tog för lång tid. Klicka på Google-knappen igen.");
        }
        throw new HttpError(400, "Inloggningen med Google gick inte att kontrollera. Försök igen.");
    }
}
