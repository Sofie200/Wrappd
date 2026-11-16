// Shared by the list page and a shared list (/s/:token)
// Wishes in sections by price per item. Cheapest first within each section; no price last.
export const PRICE_GROUPS = [
    { key: "low", title: "Upp till 250 kr", test: (p) => p <= 250 },
    { key: "mid", title: "250-500 kr", test: (p) => p > 250 && p <= 500 },
    { key: "high", title: "Över 500 kr", test: (p) => p > 500 },
    { key: "none", title: "Utan pris", test: (p) => p === null },
];

export function groupByPrice(wishes) {
    const price = (w) => (w.price === null ? null : Number(w.price));
    return PRICE_GROUPS.map((group) => ({
        ...group,
        wishes: wishes
            .filter((w) => group.test(price(w)))
            .sort((a, b) => (price(a) ?? 0) - (price(b) ?? 0) || a.title.localeCompare(b.title, "sv")),
    })).filter((group) => group.wishes.length > 0);
}
