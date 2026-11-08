import { Badge } from "lucide-react";
import { formatDate } from "../format.js";

// A date as a compact badge: the day over a short month ("8" / "NOV") on a filled, wavy-edged
// circle outline (lucide's Badge shape). Screen readers get the full date. `title` replaces the
// default tooltip (the full date).
export default function DateBadge({ iso, title }) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const month = date.toLocaleDateString("sv-SE", { month: "short" }).replace(".", "").toUpperCase();

    return (
        <time className="date-badge" dateTime={iso} title={title ?? formatDate(iso)}>
            <Badge className="date-badge-shape" fill="none" stroke="currentColor" strokeWidth={0.6} aria-hidden="true" />
            <span className="date-badge-text" aria-hidden="true">
                <span className="date-badge-day">{d}</span>
                <span className="date-badge-month">{month}</span>
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
