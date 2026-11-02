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
