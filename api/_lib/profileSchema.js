// The wish profile: free text, and categories someone likes or doesn't like.
// The same keys are in frontend/src/wishCategories.js (with their Swedish labels).
import { z } from "zod";

export const WISH_CATEGORIES = [
    "books", "games", "toys", "lego", "sweets", "food", "coffee-tea", "home", "plants", "clothes",
    "jewellery", "beauty", "sport", "outdoors", "tech", "music", "film", "crafts", "experiences", "travel", "animals",
];

const categories = z
    .array(z.enum(WISH_CATEGORIES, { error: "Okänd kategori" }), { error: "Ogiltiga kategorier" })
    .max(WISH_CATEGORIES.length)
    .transform((list) => [...new Set(list)]);

export const ProfileBody = z
    .object({
        about: z
            .string()
            .trim()
            .max(2000, "Texten får vara högst 2000 tecken")
            .optional()
            .transform((v) => v || null),
        likes: categories,
        dislikes: categories,
    })
    .refine((p) => !p.likes.some((c) => p.dislikes.includes(c)), "En kategori kan inte vara både gillad och ogillad");
