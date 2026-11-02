// "1299" → "1 299 kr", "299.5" → "299,50 kr"
export function formatPrice(value) {
    if (value === null || value === undefined) return "";
    const decimals = Number.isInteger(Number(value)) ? 0 : 2;
    return new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "SEK",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

// "2026-12-24" → a Date at local midnight (new Date("2026-12-24") would be UTC midnight)
function toDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

// "2026-12-24" → "torsdag 24 december 2026"
export function formatDate(iso) {
    return toDate(iso).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// "2026-12-24" → "24 dec."
export function formatShortDate(iso) {
    return toDate(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

export function todayIso() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "Idag", "Imorgon", "Om 12 dagar", "För 3 dagar sedan"
export function relativeDays(iso) {
    const days = Math.round((toDate(iso) - toDate(todayIso())) / 86_400_000);
    if (days === 0) return "Idag";
    if (days === 1) return "Imorgon";
    if (days > 1) return `Om ${days} dagar`;
    if (days === -1) return "Igår";
    return `För ${-days} dagar sedan`;
}

// ["Anna"] → "Anna", ["Anna", "Erik"] → "Anna och Erik", ["Anna", "Erik", "Sara"] → "Anna, Erik och Sara"
export function joinNames(names) {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

// "1 299,50" / "299" → 1299.5 / 299. Empty or not a number → null.
export function parseAmount(text) {
    const clean = String(text ?? "").replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
    return Number(clean);
}

// A number shown in an input field: 299.5 → "299,50", 299 → "299", null → ""
export function amountText(value) {
    if (value === null || value === undefined) return "";
    return Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(2).replace(".", ",");
}
