// Validation of a wish, from a multipart form - every field arrives as text.
import { z } from "zod";

const optionalText = (max, message) =>
    z
        .string()
        .trim()
        .max(max, message)
        .optional()
        .transform((v) => v || null);

export const WishBody = z.object({
    title: z
        .string({ error: "Ange en titel" })
        .trim()
        .min(1, "Ange en titel")
        .max(200, "Titeln får vara högst 200 tecken"),

    description: optionalText(2000, "Beskrivningen får vara högst 2000 tecken"),

    // "299", "299,50", "1 299" → 299 / 299.5 / 1299. Empty → null.
    price: z
        .string()
        .optional()
        .transform((value, ctx) => {
            const v = (value ?? "").replace(/\s/g, "");
            if (!v) return null;
            if (!/^\d{1,8}([.,]\d{1,2})?$/.test(v)) {
                ctx.addIssue({ code: "custom", message: "Priset ska vara ett belopp, t.ex. 299 eller 299,50" });
                return z.NEVER;
            }
            return Number(v.replace(",", "."));
        }),

    // "www.example.com" becomes "https://www.example.com". Only http and https are allowed.
    url: z
        .string()
        .trim()
        .max(2000, "Länken är för lång")
        .optional()
        .transform((value, ctx) => {
            if (!value) return null;
            const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
            try {
                const url = new URL(withProtocol);
                if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
                return url.toString();
            } catch {
                ctx.addIssue({ code: "custom", message: "Länken är inte en giltig webbadress" });
                return z.NEVER;
            }
        }),

    quantity: z.coerce
        .number({ error: "Ange ett antal" })
        .int("Antalet måste vara ett heltal")
        .min(1, "Antalet måste vara minst 1")
        .max(99, "Antalet får vara högst 99")
        .default(1),

    // An image from a shop's page ("Hämta uppgifter"). The server downloads it and saves its own copy.
    // Ignored if a file is uploaded too.
    imageFromUrl: z
        .string()
        .trim()
        .max(2000)
        .optional()
        .transform((value, ctx) => {
            if (!value) return null;
            try {
                const url = new URL(value);
                if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
                return url.toString();
            } catch {
                ctx.addIssue({ code: "custom", message: "Bildlänken är inte en giltig webbadress" });
                return z.NEVER;
            }
        }),

    // Only when editing: "true" removes the current image
    removeImage: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

// The most wishes a list may have (the same number in frontend/src/config.js)
export const MAX_WISHES_PER_LIST = 50;
export const TOO_MANY_WISHES = `En lista kan ha högst ${MAX_WISHES_PER_LIST} önskningar`;
