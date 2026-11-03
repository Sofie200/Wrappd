import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import { buildEvents, EventRow, sumShares } from "../components/EventRow.jsx";
import { formatPrice } from "../format.js";

// /gifts – everything I've bought or share: coming events first (soonest first, gifts from
// wish profiles last), then earlier ones. The same rows as on the overview, but only with gifts.
export default function GiftsPage() {
    const { data, error, loading, reload } = useFetch("/profile");

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { gifts } = data;
    const current = buildEvents([], gifts.current);
    const history = buildEvents([], gifts.history, { newestFirst: true });

    return (
        <div className="page">
            <div className="page-head">
                <h1 className="title-with-icon">
                    <Gift size={28} aria-hidden="true" /> Gåvor
                </h1>
                <Link to="/gifts/new" className="btn btn-primary">
                    <Gift size={16} aria-hidden="true" /> Lägg till egen gåva
                </Link>
            </div>

            <section className="section">
                <div className="section-head">
                    <h2>Aktuella</h2>
                    {gifts.current.length > 0 && (
                        <span className="event-total">
                            Totalt för mig <strong>{formatPrice(sumShares(gifts.current))}</strong>
                        </span>
                    )}
                </div>
                {current.length === 0 ? (
                    <Empty>Du har inga aktuella gåvor. Reservera något på en lista eller en önskeprofil!</Empty>
                ) : (
                    <div className="events">
                        {current.map((event) => (
                            <EventRow key={event.key} event={event} onChanged={reload} />
                        ))}
                    </div>
                )}
            </section>

            {history.length > 0 && (
                <section className="section">
                    <div className="section-head">
                        <h2>Tidigare</h2>
                        <span className="event-total">
                            Totalt <strong>{formatPrice(sumShares(gifts.history))}</strong>
                        </span>
                    </div>
                    <div className="events">
                        {history.map((event) => (
                            <EventRow key={event.key} event={event} archived onChanged={reload} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
