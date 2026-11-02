// Product data from a shop's web page: title, description, price and image.
// Most shops describe their products for Google in one of these – tried in this order:
//  1. JSON-LD (<script type="application/ld+json">) with "@type": "Product"
//  2. Open Graph / product meta tags (og:title, og:image, product:price:amount …)
//  3. Microdata (itemprop="price") and <title>
// No HTML parser package – we only need a few known tags, so regular expressions are enough.
import { FetchError, safeFetch } from "./safeFetch.js";
import { realImageType } from "../_middleware/imageUpload.js";

const MAX_PAGE_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // the same limit as uploaded images
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 200;

/* ---------- Text helpers ---------- */

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
    aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö", eacute: "é", uuml: "ü", copy: "©", reg: "®", trade: "™" };

function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
        if (code[0] === "#") {
            const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
        }
        return NAMED_ENTITIES[code] ?? match;
    });
}

// Tags out, entities decoded, all whitespace collapsed
function cleanText(value) {
    if (typeof value !== "string") return null;
    const text = decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    return text || null;
}

function shorten(text, max) {
    if (!text || text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/**
 * A price as the shop wrote it → the form's format: "1 299,00 kr" → "1299", "49.90" → "49,90".
 * One separator followed by exactly three digits is a thousands separator ("1.299", "1,299").
 */
export function normalizePrice(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? formatAmount(value) : null;

    let text = String(value).replace(/[\s  ']/g, "").replace(/[^\d.,]/g, "");
    if (!/\d/.test(text)) return null;

    const lastDot = text.lastIndexOf(".");
    const lastComma = text.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
        // Both: the last one is the decimal separator
        const decimal = lastDot > lastComma ? "." : ",";
        const thousands = decimal === "." ? "," : ".";
        text = text.split(thousands).join("").replace(decimal, ".");
    } else if (lastDot >= 0 || lastComma >= 0) {
        const sep = lastDot >= 0 ? "." : ",";
        const parts = text.split(sep);
        const isThousands = parts.length > 2 || parts[parts.length - 1].length === 3;
        text = isThousands ? parts.join("") : parts.join(".");
    }

    const number = Number(text);
    return Number.isFinite(number) && number >= 0 && number < 1e8 ? formatAmount(number) : null;
}

function formatAmount(number) {
    const rounded = Math.round(number * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(".", ",");
}

/* ---------- Reading the page ---------- */

// "text/html; charset=ISO-8859-1", or <meta charset="…"> → decoded text
function decodeHtml(buffer, contentType) {
    const head = buffer.subarray(0, 4096).toString("latin1");
    const charset =
        /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
        /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
        "utf-8";
    try {
        return new TextDecoder(charset).decode(buffer);
    } catch {
        return new TextDecoder("utf-8").decode(buffer);
    }
}

function attributes(tag) {
    const attrs = {};
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
        attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
    }
    return attrs;
}

// All <meta> tags as { "og:title": "…", "description": "…", "price": "…" } – the first of each wins
function metaTags(html) {
    const meta = {};
    for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
        const a = attributes(tag);
        const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
        if (key && a.content !== undefined && !(key in meta)) meta[key] = decodeEntities(a.content);
    }
    return meta;
}

// Every JSON-LD node, flattened: arrays and @graph opened up
function jsonLdNodes(html) {
    const nodes = [];
    const visit = (value) => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== "object") return;
        nodes.push(value);
        if (value["@graph"]) visit(value["@graph"]);
    };
    for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
        const raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
        try {
            visit(JSON.parse(raw));
        } catch {
            try {
                visit(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " "))); // raw line breaks inside strings
            } catch {
                // broken JSON-LD – skip it
            }
        }
    }
    return nodes;
}

const hasType = (node, type) => [].concat(node["@type"] ?? []).some((t) => String(t).toLowerCase() === type);

function firstImage(value) {
    if (!value) return [];
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(firstImage);
    if (typeof value === "object") return firstImage(value.url ?? value.contentUrl ?? value["@id"]);
    return [];
}

// { price, currency } from offers – an Offer, a list of them, or an AggregateOffer (lowest price)
function offerPrice(offers) {
    for (const offer of [].concat(offers ?? [])) {
        if (!offer || typeof offer !== "object") continue;
        const spec = [].concat(offer.priceSpecification ?? [])[0];
        const price = offer.price ?? offer.lowPrice ?? spec?.price;
        if (price !== undefined && price !== null && price !== "") {
            return { price, currency: offer.priceCurrency ?? spec?.priceCurrency ?? null };
        }
        if (offer.offers) {
            const inner = offerPrice(offer.offers);
            if (inner) return inner;
        }
    }
    return null;
}

function fromJsonLd(html) {
    const nodes = jsonLdNodes(html);
    const product = nodes.find((n) => hasType(n, "product")) ?? nodes.find((n) => hasType(n, "productgroup"));
    if (!product) return {};
    const variant = [].concat(product.hasVariant ?? [])[0];
    const offer = offerPrice(product.offers) ?? (variant ? offerPrice(variant.offers) : null);
    return {
        title: cleanText(product.name),
        description: cleanText(product.description),
        price: offer?.price ?? null,
        currency: offer?.currency ?? null,
        images: [...firstImage(product.image), ...(variant ? firstImage(variant.image) : [])],
    };
}

function fromMeta(html) {
    const meta = metaTags(html);
    const microPrice = /itemprop\s*=\s*["']price["'][^>]*?content\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ??
        /content\s*=\s*["']([^"']+)["'][^>]*?itemprop\s*=\s*["']price["']/i.exec(html)?.[1];
    return {
        title: cleanText(meta["og:title"] ?? meta["twitter:title"] ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]),
        description: cleanText(meta["og:description"] ?? meta.description ?? meta["twitter:description"]),
        price: meta["product:price:amount"] ?? meta["og:price:amount"] ?? meta.price ?? microPrice ?? null,
        currency: meta["product:price:currency"] ?? meta["og:price:currency"] ?? meta.pricecurrency ?? null,
        images: [meta["og:image:secure_url"], meta["og:image"], meta["og:image:url"], meta["twitter:image"]].filter(Boolean),
    };
}

/* ---------- Images ---------- */

/**
 * Downloads an image from a shop. Only JPG and PNG, max 4 MB – the same rules as uploaded images.
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
export async function downloadImage(address) {
    const { buffer } = await safeFetch(address, {
        // Ask for JPG/PNG – many image services otherwise answer WebP or AVIF
        accept: "image/jpeg,image/png;q=0.9,image/*;q=0.5",
        maxBytes: MAX_IMAGE_BYTES,
        timeoutMs: 15_000,
    });
    const mimeType = realImageType(buffer);
    if (!mimeType) throw new FetchError("Bilden är inte JPG eller PNG");
    return { buffer, mimeType };
}

// The first image that actually works (max 3 tries)
async function firstUsableImage(candidates, pageUrl) {
    const urls = [];
    for (const candidate of candidates) {
        try {
            const url = new URL(candidate.trim(), pageUrl).toString();
            if (/^https?:/.test(url) && !urls.includes(url)) urls.push(url);
        } catch {
            // not a valid address
        }
    }
    let unsupported = false;
    for (const url of urls.slice(0, 3)) {
        try {
            await downloadImage(url);
            return { imageUrl: url, imageUnsupported: false };
        } catch (err) {
            if (err.message === "Bilden är inte JPG eller PNG") unsupported = true;
        }
    }
    return { imageUrl: null, imageUnsupported: unsupported };
}

/* ---------- The whole thing ---------- */

/**
 * @param {string} address  the product page
 * @returns {Promise<{ title, description, price, currency, imageUrl, imageUnsupported }>}
 *   price is text in the form's format ("1299" / "49,90"); fields not found are null
 */
export async function scrapeProduct(address) {
    const page = await safeFetch(address, {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        maxBytes: MAX_PAGE_BYTES,
        truncate: true,
    });
    if (page.contentType && !/html|xml/i.test(page.contentType)) {
        throw new FetchError("Länken går inte till en webbsida");
    }

    const { images, ...product } = parseProductHtml(decodeHtml(page.buffer, page.contentType));
    return { ...product, ...(await firstUsableImage(images, page.url)) };
}

// The page's HTML → product data, and image candidates (best first). Separate so it can be tested without a network.
export function parseProductHtml(html) {
    const ld = fromJsonLd(html);
    const meta = fromMeta(html);
    const priceSource = ld.price !== null && ld.price !== undefined ? ld : meta;
    return {
        title: shorten(ld.title ?? meta.title, TITLE_MAX),
        description: shorten(ld.description ?? meta.description, DESCRIPTION_MAX),
        price: normalizePrice(priceSource.price),
        currency: priceSource.currency ? String(priceSource.currency).toUpperCase() : null,
        images: [...(ld.images ?? []), ...meta.images],
    };
}
