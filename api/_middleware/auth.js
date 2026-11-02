import jwt from "jsonwebtoken";

// As long as possible was the wish – a year, then the user logs in again
const EXPIRES_IN = "365d";

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

// Every route behind this needs "Authorization: Bearer <token>". Sets req.user = { id, username, name }.
export function requireAuth(req, res, next) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: "Du måste logga in." });
    }

    try {
        const payload = jwt.verify(token, secret());
        req.user = { id: Number(payload.sub), username: payload.username, name: payload.name };
        next();
    } catch (err) {
        if (err instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: "Din inloggning har gått ut. Logga in igen." });
        }
        next(err);
    }
}
