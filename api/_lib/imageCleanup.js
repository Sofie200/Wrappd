// Deleting images from the store – but only those nothing uses any more.
// Since migration 018 a gift keeps the wish's image when the wish (or its list) is deleted, and several
// gifts can share one image. So before deleting, check that no wish and no gift still points to it.
import { pool } from "../_db/pool.js";
import { removeWishImages } from "../_integrations/storageAdapter.js";

/**
 * Deletes the images among `urls` that no wish or gift uses. Run AFTER the transaction is committed.
 * Failures are only logged: a leftover file is better than a failed request.
 * @param {string[]} urls
 * @param {string} tag  for the log, e.g. "LIST"
 */
export async function removeUnusedImages(urls, tag = "IMAGES") {
    const list = [...new Set(urls.filter(Boolean))];
    if (list.length === 0) return;
    try {
        const { rows } = await pool.query(
            `SELECT u.url FROM unnest($1::text[]) AS u(url)
             WHERE NOT EXISTS (SELECT 1 FROM wishes WHERE image_url = u.url)
               AND NOT EXISTS (SELECT 1 FROM gifts WHERE image_url = u.url)`,
            [list]
        );
        await removeWishImages(rows.map((r) => r.url));
    } catch (err) {
        console.warn(`[${tag}] Could not delete images:`, err);
    }
}
