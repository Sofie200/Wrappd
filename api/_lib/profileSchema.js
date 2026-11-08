// The wish profile: free text, and categories someone likes or doesn't like.
// The same keys are in frontend/src/wishCategories.js (with their Swedish labels).
import { z } from "zod";

export const WISH_CATEGORIES = [
    "books", "games", "toys", "lego", "sweets", "food", "coffee-tea", "home", "plants", "clothes",
    "jewellery", "beauty", "sport", "outdoors", "tech", "music", "film", "crafts", "experiences", "travel",
];

// Unknown keys are dropped rather than rejected, so a profile that still has a removed category
// (e.g. "animals") can be saved – the old choice just disappears.
const categories = z
    .array(z.string(), { error: "Ogiltiga kategorier" })
    .max(50)
    .transform((list) => [...new Set(list.filter((c) => WISH_CATEGORIES.includes(c)))]);

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
