// One-time links for choosing a password: activating a new account, or resetting a forgotten password.
//
// The link contains a random token. Only a SHA-256 hash of it is saved, so a leaked database
// gives no working links. A link can be used once, and stops working after LINK_DAYS days
// or when a newer link is made for the same user.
import { createHash, randomBytes } from "node:crypto";

export const LINK_DAYS = 7;

export const hashToken = (token) => createHash("sha256").update(token).digest("hex");

// A token in a URL: base64url from 32 random bytes = 43 characters
export const isTokenFormat = (token) => /^[A-Za-z0-9_-]{43}$/.test(token);

/**
 * Creates a new link for a user. Older unused links for the same user stop working.
 * @returns {Promise<{ token: string, purpose: "activate" | "reset", expiresAt: string }>}
 */
export async function createUserLink(db, { userId, purpose, createdBy }) {
    const token = randomBytes(32).toString("base64url");

    await db.query("UPDATE user_links SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);

    const { rows: [link] } = await db.query(
        `INSERT INTO user_links (user_id, token_hash, purpose, created_by, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))
         RETURNING expires_at AS "expiresAt"`,
        [userId, hashToken(token), purpose, createdBy, LINK_DAYS]
    );

    return { token, purpose, expiresAt: link.expiresAt };
}
