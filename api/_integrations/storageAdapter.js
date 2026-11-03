// Adapter for image storage (Vercel Blob).
// This is the ONLY file that knows Vercel Blob. The rest of the app only sees: an image in, a URL out.
//
// The token (BLOB_READ_WRITE_TOKEN) is read by @vercel/blob from the environment.
// Every call has a timeout. On errors we throw, and the route answers 502 with a clear message.

import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";

const TIMEOUT_MS = 15_000;

const EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
};

function requireToken() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error("BLOB_READ_WRITE_TOKEN saknas i .env");
    }
}

/**
 * Uploads a wish image. A NEW, unique path every time – never the user's own file name.
 * @param {number} listId
 * @param {{ buffer: Buffer, mimeType: string }} image
 * @returns {Promise<string>} the public URL
 */
export function uploadWishImage(listId, image) {
    return uploadImage(`wishes/${listId}`, image);
}

/**
 * Uploads the image of a gift bought outside the wish list.
 * @param {{ buffer: Buffer, mimeType: string }} image
 * @returns {Promise<string>} the public URL
 */
export function uploadGiftImage(image) {
    return uploadImage("gifts", image);
}

/**
 * Uploads the image of a wish on someone's wish profile.
 * @param {number} userId
 * @param {{ buffer: Buffer, mimeType: string }} image
 * @returns {Promise<string>} the public URL
 */
export function uploadProfileWishImage(userId, image) {
    return uploadImage(`profiles/${userId}`, image);
}

async function uploadImage(folder, { buffer, mimeType }) {
    requireToken();
    const extension = EXTENSIONS[mimeType];
    if (!extension) throw new Error(`Unsupported image type: ${mimeType}`);

    const blob = await put(`${folder}/${randomUUID()}.${extension}`, buffer, {
        access: "public",
        contentType: mimeType,
        addRandomSuffix: false, // the UUID already makes the path unique
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return blob.url;
}

/**
 * Deletes images we no longer use (wishes' and gifts'). Callers treat failures as "log and go on":
 * a leftover file in the store is better than a failed request.
 * @param {string[]} urls
 */
export async function removeWishImages(urls) {
    const list = urls.filter(Boolean);
    if (list.length === 0) return;
    requireToken();
    await del(list, { abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
}
