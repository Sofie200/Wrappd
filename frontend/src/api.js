// Every call to our backend goes through api(). The login travels in an httpOnly cookie that the
// browser sends along by itself (JavaScript never sees it). api() has a timeout and turns errors
// into messages the user can read.
import { API_URL } from "./config.js";

// The old login, from before the cookie: read once, sent along once to move it into a cookie, then removed
const OLD_TOKEN_KEY = "token";
function takeOldToken() {
    try {
        const token = localStorage.getItem(OLD_TOKEN_KEY);
        if (token) localStorage.removeItem(OLD_TOKEN_KEY);
        return token;
    } catch {
        return null;
    }
}

// AuthContext sets this, so an expired token logs the user out wherever it happens
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

// GET requests that fail because the server or database is briefly unreachable are tried again
// automatically: after 1 s, then 3 s. Only GET - it's safe to repeat. A POST/PUT/DELETE that failed
// halfway might already have been saved, so those are never repeated (the user decides).
const RETRY_DELAYS_MS = [1000, 3000];
const RETRY_STATUSES = [502, 503, 504];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} path  e.g. "/groups"
 * @param {{ method?: string, body?: object, formData?: FormData, timeoutMs?: number }} options
 */
export async function api(path, options = {}) {
    const method = options.method ?? "GET";
    // Read the old login once - takeOldToken() removes it, so a retry must reuse it
    const oldToken = options.migrateOldLogin ? takeOldToken() : null;
    for (let attempt = 0; ; attempt++) {
        try {
            return await request(path, { ...options, oldToken });
        } catch (err) {
            const temporary = err.status === 0 || RETRY_STATUSES.includes(err.status);
            if (method !== "GET" || !temporary || attempt >= RETRY_DELAYS_MS.length) throw err;
            await wait(RETRY_DELAYS_MS[attempt]);
        }
    }
}

async function request(path, { method = "GET", body, formData, timeoutMs = 15_000, oldToken = null } = {}) {
    const headers = {};
    if (oldToken) headers.Authorization = `Bearer ${oldToken}`;
    // With FormData the browser sets Content-Type itself (multipart, with the right boundary)
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
        res = await fetch(API_URL + path, {
            method,
            headers,
            body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
            credentials: "include", // the login cookie, also locally where the API is on another port
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (err) {
        throw new ApiError(
            err.name === "TimeoutError"
                ? "Servern svarade inte i tid. Försök igen."
                : "Kunde inte nå servern. Kontrollera din anslutning.",
            0
        );
    }

    const data = res.status === 204 ? null : await res.json().catch(() => null);

    if (!res.ok) {
        if (res.status === 401) onUnauthorized();
        throw new ApiError(data?.error ?? "Något gick fel. Försök igen.", res.status);
    }
    return data;
}
