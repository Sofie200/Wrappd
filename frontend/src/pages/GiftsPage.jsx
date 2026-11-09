import { Gift } from "lucide-react";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import { buildEvents, EventRow } from "../components/EventRow.jsx";
import AddGiftButton from "../components/AddGiftButton.jsx";
import GiftPlusIcon from "../components/GiftPlusIcon.jsx";

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
                    <Gift size={28} aria-hidden="true" /> Mina gåvor
                </h1>
                {/* Any gift I've bought: on a list (a surprise gift) or for an own event */}
                <AddGiftButton className="btn btn-primary" title="Logga egen gåva" onAdded={reload}>
                    <GiftPlusIcon /> Logga egen gåva
                </AddGiftButton>
            </div>

            <div className="page-notice">
                <Notice>
                    Sidan är under uppbyggnad. Tanken är att du här ska kunna se statistik över dina gåvor – och
                    filtrera och sortera den – så att du kan följa dina mönster över tid.
                </Notice>
            </div>

            <section className="section">
                <div className="section-head">
                    <h2>Aktuella</h2>
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
                    <h2>Tidigare</h2>
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
