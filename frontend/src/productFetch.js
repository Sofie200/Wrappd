// "Hämta uppgifter": asks our server to read a product page.
// Returns what was found, and a message for the user about what was (not) found.
import { api } from "./api.js";

const NAMES = { title: "titel", description: "beskrivning", price: "pris", imageUrl: "bild" };

/** @returns {Promise<{ product: { title, description, price, currency, imageUrl }, message: string, warning: string }>} */
export async function fetchProduct(url) {
    const product = await api("/scrape", { method: "POST", body: { url }, timeoutMs: 30_000 });

    const found = Object.keys(NAMES).filter((key) => product[key]);
    const missing = Object.keys(NAMES).filter((key) => !product[key]);
    const warnings = [];
    if (product.price && product.currency && product.currency !== "SEK") {
        warnings.push(`Priset är i ${product.currency}, inte kronor - kontrollera det.`);
    }
    if (product.imageUnsupported) warnings.push("Butikens bild är inte JPG eller PNG, så den kunde inte användas.");

    return {
        product,
        message:
            found.length === 0
                ? "Hittade inga produktuppgifter på sidan. Fyll i dem själv."
                : `Hämtade ${found.map((k) => NAMES[k]).join(", ")}.` +
                  (missing.length > 0 ? ` Hittade inte ${missing.map((k) => NAMES[k]).join(", ")}.` : ""),
        warning: warnings.join(" "),
    };
}
