import { Router } from "express";
import { z } from "zod";
import { HttpError, parse } from "../_lib/http.js";
import { scrapeProduct } from "../_lib/productScraper.js";
import { FetchError } from "../_lib/safeFetch.js";

const router = Router();

const ScrapeBody = z.object({
    url: z
        .string({ error: "Ange en länk" })
        .trim()
        .min(1, "Ange en länk")
        .max(2000, "Länken är för lång")
        // "www.example.com" becomes "https://www.example.com", like in the wish form
        .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`)),
});

/* --- POST /api/scrape  { url } → { title, description, price, currency, imageUrl, imageUnsupported } --- */
// Reads the product page and returns what it found. Nothing is saved - the form decides.
router.post("/", async (req, res) => {
    const { url } = parse(ScrapeBody, req.body);
    try {
        res.json(await scrapeProduct(url));
    } catch (err) {
        if (!(err instanceof FetchError)) throw err;
        console.warn("[SCRAPE]", url, err.message);
        const blocked = err.status === 401 || err.status === 403 || err.status === 429;
        throw new HttpError(
            422,
            blocked
                ? "Butiken släpper inte in oss. Fyll i uppgifterna själv."
                : `Kunde inte hämta produkten: ${err.message.charAt(0).toLowerCase()}${err.message.slice(1)}.`
        );
    }
});

export default router;
