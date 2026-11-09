import jwt from "jsonwebtoken";

// As long as possible was the wish – a year, then the user logs in again
const EXPIRES_IN = "365d";
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

// The login lives in an httpOnly cookie: JavaScript in the browser can never read it (protects against XSS),
// and SameSite=Lax means other sites can't send it along with their requests (protects against CSRF).
export const COOKIE_NAME = "wrappd_token";

function cookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL), // https only, except locally
        sameSite: "lax",
        path: "/",
    };
}

function secret() {
    const value = process.env.JWT_SECRET;
    if (!value) throw new Error("JWT_SECRET saknas i .env");
    return value;
}

export function signToken(user) {
    return jwt.sign({ sub: String(user.id), username: user.username, name: user.name }, secret(), {
        expiresIn: EXPIRES_IN,
    });
}

// Logs the user in: a new token in the cookie, valid for a year
export function setAuthCookie(res, user) {
    res.cookie(COOKIE_NAME, signToken(user), { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, cookieOptions());
}

// The cookie's value, read straight from the Cookie header (no extra package needed)
function readCookie(req, name) {
    for (const part of (req.headers.cookie ?? "").split(";")) {
        const i = part.indexOf("=");
        if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return null;
}

// The token: from the cookie – or, only while moving over from the old localStorage login,
// from "Authorization: Bearer <token>" (req.fromHeader tells /auth/me to move it into a cookie)
function readToken(req) {
    const fromCookie = readCookie(req, COOKIE_NAME);
    if (fromCookie) return { token: fromCookie, fromHeader: false };
    const header = req.headers.authorization ?? "";
    return header.startsWith("Bearer ") ? { token: header.slice(7), fromHeader: true } : { token: null };
}

// Every route behind this needs a valid login. Sets req.user = { id, username, name }.
export function requireAuth(req, res, next) {
    const { token, fromHeader } = readToken(req);
    if (!token) {
        return res.status(401).json({ error: "Du måste logga in." });
    }

    try {
        const payload = jwt.verify(token, secret());
        req.user = { id: Number(payload.sub), username: payload.username, name: payload.name };
        req.authFromHeader = fromHeader;
        next();
    } catch (err) {
        if (err instanceof jwt.JsonWebTokenError) {
            clearAuthCookie(res);
            return res.status(401).json({ error: "Din inloggning har gått ut. Logga in igen." });
        }
        next(err);
    }
}
