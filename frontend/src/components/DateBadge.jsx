import { Calendar } from "lucide-react";
import { formatDate } from "../format.js";

// A date as a small calendar (lucide's Calendar icon) with the day ("8") in it, and the short
// month ("NOV") under it. Screen readers get the full date. `title` replaces the
// default tooltip (the full date).
export default function DateBadge({ iso, title }) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const month = date.toLocaleDateString("sv-SE", { month: "short" }).replace(".", "").toUpperCase();

    return (
        <time className="date-badge" dateTime={iso} title={title ?? formatDate(iso)}>
            {/* The day inside a small calendar, the month under it */}
            <span className="date-badge-cal" aria-hidden="true">
                <Calendar className="date-badge-shape" strokeWidth={1.25} />
                <span className="date-badge-day">{d}</span>
            </span>
            <span className="date-badge-month" aria-hidden="true">
                {month}
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
