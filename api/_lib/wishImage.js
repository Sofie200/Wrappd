// A wish's NEW image: an uploaded file, or an image from a shop (imageFromUrl, from "Hämta uppgifter").
// Either way it ends up as our own copy in Vercel Blob. Returns the new URL, or null if there is no new image.
import { HttpError } from "./http.js";
import { downloadImage } from "./productScraper.js";
import { uploadWishImage } from "../_integrations/storageAdapter.js";

export async function uploadNewWishImage(listId, file, imageFromUrl) {
    let image = null;
    if (file) {
        image = { buffer: file.buffer, mimeType: file.mimetype };
    } else if (imageFromUrl) {
        try {
            image = await downloadImage(imageFromUrl);
        } catch (err) {
            console.warn("[WISH] Could not download image:", imageFromUrl, err.message);
            throw new HttpError(422, "Kunde inte hämta bilden från butiken. Försök igen, ladda upp en egen bild eller ta bort bilden.");
        }
    }
    if (!image) return null;

    try {
        return await uploadWishImage(listId, image);
    } catch (err) {
        console.error("[WISH] Image upload failed:", err);
        throw new HttpError(502, "Bildtjänsten svarar inte just nu. Försök igen, eller spara utan ny bild.");
    }
}
