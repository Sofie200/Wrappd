import { useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";

// Information, not consent: Wrappd only uses what's needed for the service to work (the login cookie),
// which needs no consent under the Swedish law (LEK). So there's only "OK" – no "Neka".
// If anything non-essential is ever added (statistics, ads …) this must become a real consent banner.
const SEEN_KEY = "cookieNoticeSeen";

function hasSeen() {
    try {
        return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
        return false;
    }
}

export default function CookieNotice() {
    const [seen, setSeen] = useState(hasSeen);
    if (seen) return null;

    function close() {
        try {
            localStorage.setItem(SEEN_KEY, "1");
        } catch {
            // Private mode etc. – then it's hidden until the page is reloaded
        }
        setSeen(true);
    }

    return (
        <aside className="cookie-notice" aria-label="Om cookies">
            <Cookie size={20} aria-hidden="true" className="cookie-notice-icon" />
            <p>
                Vi använder bara de cookies som behövs för att du ska kunna logga in – inga för statistik eller
                reklam. <Link to="/integritet#cookies">Läs mer</Link>
            </p>
            <button type="button" className="btn btn-primary btn-small" onClick={close}>
                OK
            </button>
        </aside>
    );
}
