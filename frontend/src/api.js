// Every call to our backend goes through api(). It adds the token, has a timeout,
// and turns errors into messages the user can read.
import { API_URL } from "./config.js";

const TOKEN_KEY = "token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

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
export async function api(path, { method = "GET", body, formData, timeoutMs = 15_000 } = {}) {
    const token = getToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    // With FormData the browser sets Content-Type itself (multipart, with the right boundary)
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
        res = await fetch(API_URL + path, {
            method,
            headers,
            body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
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

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        if (res.status === 401 && token) onUnauthorized();
        throw new ApiError(data?.error ?? "Något gick fel. Försök igen.", res.status);
    }
    return data;
}
