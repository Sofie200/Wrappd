import { z } from "zod";
import { money } from "./money.js";
import { WishBody } from "./wishSchema.js";

// Validation of a gift. Gifts outside the wish list arrive as multipart (they can have an image),
// so every field may arrive as text – also the members, as a JSON string.
const quantity = z.coerce
    .number({ error: "Ange ett antal" })
    .int("Antalet måste vara ett heltal")
    .min(1, "Antalet måste vara minst 1")
    .max(99, "Antalet får vara högst 99");

const optionalId = z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value, ctx) => {
        if (value === null || value === undefined || value === "") return null;
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) {
            ctx.addIssue({ code: "custom", message: "Ogiltig lista" });
            return z.NEVER;
        }
        return n;
    });

// The fields only gifts outside the list have. Title is required for them – checked below.
// A date "YYYY-MM-DD", or null when empty. Own events and gifts from a wish profile need one
// (checked in the routes); shared with wish-routes.js (reserving on a wish profile).
export const giftDate = z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value, ctx) => {
        if (!value) return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
            ctx.addIssue({ code: "custom", message: "Ange ett giltigt datum" });
            return z.NEVER;
        }
        return value;
    });

const FreeFields = z.object({
    title: z.string().trim().max(200, "Titeln får vara högst 200 tecken").optional().transform((v) => v || null),
    description: WishBody.shape.description,
    url: WishBody.shape.url,
    imageFromUrl: WishBody.shape.imageFromUrl,
    removeImage: WishBody.shape.removeImage,
    listId: optionalId,
    santaId: optionalId,
    // Without a list or Secret Santa: who it's for, as a link to a user in my groups (optional)
    recipientId: optionalId,
    // Without a list or Secret Santa: the event's name, e.g. "Farmors 80-årsdag" (stored in gifts.recipient)
    recipient: z.string().trim().max(100, "Händelsens namn får vara högst 100 tecken").optional().transform((v) => v || null),
    giftDate,
});

export const GiftBody = FreeFields.extend({
    quantity,
    price: money("Priset ska vara ett belopp, t.ex. 299 eller 299,50"),
    comment: z
        .string()
        .trim()
        .max(1000, "Kommentaren får vara högst 1000 tecken")
        .nullish()
        .transform((v) => v || null),
    split: z.enum(["equal", "custom"], { error: "Välj hur kostnaden delas" }).default("equal"),
    // From a multipart form, members arrive as a JSON string
    members: z.preprocess(
        (value) => {
            if (typeof value !== "string") return value;
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        },
        z
            .array(
                z.object({
                    userId: z.coerce.number().int().positive(),
                    amount: money("Andelen ska vara ett belopp, t.ex. 150 eller 149,50"),
                }),
                { error: "Ange vilka som delar på gåvan" }
            )
            .min(1, "Minst en person måste stå för gåvan")
            .max(20, "Högst 20 personer kan dela på en gåva")
    ),
});

