import multer from "multer";
import { HttpError } from "../_lib/http.js";

// 4 MB – Vercel stops requests over 4.5 MB before they reach our code
export const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

// The file stays in memory (req.file.buffer) – we send it on to Vercel Blob, never save it here
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
});

// The file's first bytes tell what it REALLY is – the mimetype only comes from the file name
function realImageType(buffer) {
    const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    if (isPng) return "image/png";
    const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (isJpeg) return "image/jpeg";
    return null;
}

// Reads multipart/form-data: the text fields end up in req.body, an optional image in req.file
export function receiveImage(req, res, next) {
    upload.single("image")(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return next(new HttpError(400, "Bilden är för stor. Max 4 MB."));
        }
        if (err) {
            return next(new HttpError(400, 'Kunde inte läsa formuläret. Skicka högst en bild i fältet "image".'));
        }

        if (req.file) {
            const type = realImageType(req.file.buffer);
            if (!type) return next(new HttpError(400, "Bilden måste vara JPG eller PNG."));
            req.file.mimetype = type;
        }
        next();
    });
}
