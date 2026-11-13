import { formatDate } from "../format.js";

// A date as a tear-off calendar sheet ("rivblock"): the short month on a coloured band at the top
// ("NOV"), the day big in the middle ("22") and the weekday under it ("lör"). The band takes the
// event's colour (--tab-bg). Screen readers get the full date. `title` replaces the default
// tooltip (the full date).
export default function DateBadge({ iso, title }) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const month = date.toLocaleDateString("sv-SE", { month: "short" }).replace(".", "").toUpperCase();
    const weekday = date.toLocaleDateString("sv-SE", { weekday: "short" }).replace(".", "");

    return (
        <time className="date-badge" dateTime={iso} title={title ?? formatDate(iso)}>
            <span className="date-badge-month" aria-hidden="true">
                {month}
            </span>
            <span className="date-badge-day" aria-hidden="true">
                {d}
            </span>
            <span className="date-badge-weekday" aria-hidden="true">
                {weekday}
            </span>
            <span className="visually-hidden">{formatDate(iso)}</span>
        </time>
    );
}

// The same date as plain text ("24 december 2026"), under the title. Shown instead of the badge on mobile.
export function EventDate({ iso }) {
    const [y, m, d] = iso.split("-").map(Number);
    const text = new Date(y, m - 1, d).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });

    return (
        <time className="event-date" dateTime={iso}>
            {text}
        </time>
    );
}
