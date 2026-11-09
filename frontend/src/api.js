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

/**
 * @param {string} path  e.g. "/groups"
 * @param {{ method?: string, body?: object, formData?: FormData, timeoutMs?: number }} options
 */
export async function api(path, { method = "GET", body, formData, timeoutMs = 15_000, migrateOldLogin = false } = {}) {
    const headers = {};
    const oldToken = migrateOldLogin ? takeOldToken() : null;
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
