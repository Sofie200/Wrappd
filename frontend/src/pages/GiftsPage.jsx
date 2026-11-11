import { useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Coins, Gift, HatGlasses, Table2 } from "lucide-react";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import { buildEvents, GiftTable, sumPrices } from "../components/EventRow.jsx";
import AddGiftButton from "../components/AddGiftButton.jsx";
import GiftPlusIcon from "../components/GiftPlusIcon.jsx";
import GiftCard from "../components/GiftCard.jsx";
import AddGiftCard from "../components/AddGiftCard.jsx";
import SpendingChart from "../components/SpendingChart.jsx";
import DateBadge, { EventDate } from "../components/DateBadge.jsx";
import { formatPrice } from "../format.js";
import Modal from "../components/Modal.jsx";

// /gifts – everything I've bought or share, as cards grouped by event: the coming events (soonest first,
// gifts from wish profiles last) – or, switched with the Arkiv button (like on Mina listor), the past ones
// (latest first).
export default function GiftsPage() {
    const { data, error, loading, reload } = useFetch("/profile");
    const [showArchive, setShowArchive] = useState(false);

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
                <div className="actions">
                    {/* Any gift I've bought: on a list (a surprise gift) or for an own event */}
                    <AddGiftButton className="btn btn-primary" title="Logga egen gåva" onAdded={reload}>
                        <GiftPlusIcon /> Logga egen gåva
                    </AddGiftButton>
                    {/* The archive is shown here, in place of the current gifts */}
                    <button type="button" className="btn btn-ghost" onClick={() => setShowArchive(!showArchive)}>
                        {showArchive ? (
                            <>
                                <Gift size={16} aria-hidden="true" /> Aktuella gåvor{current.length > 0 && ` (${current.length})`}
                            </>
                        ) : (
                            <>
                                <Archive size={16} aria-hidden="true" /> Arkiv{history.length > 0 && ` (${history.length})`}
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="page-notice">
                <Notice>
                    Sidan är under uppbyggnad. Tanken är att du här ska kunna se statistik över dina gåvor – och
                    filtrera och sortera den – så att du kan följa dina mönster över tid.
                </Notice>
            </div>

            {showArchive ? (
                <section className="section">
                    <h2>Arkiv</h2>
                    <p className="muted">Gåvor till händelser vars datum har passerat.</p>
                    {history.length === 0 ? (
                        <Empty>Inga arkiverade gåvor än.</Empty>
                    ) : (
                        <div className="gift-events">
                            {history.map((event) => (
                                <GiftEvent key={event.key} event={event} archived onChanged={reload} />
                            ))}
                        </div>
                    )}
                </section>
            ) : (
                <section className="section">
                    <h2>Aktuella</h2>
                    {current.length === 0 ? (
                        <Empty>Du har inga aktuella gåvor. Reservera något på en lista eller en önskeprofil!</Empty>
                    ) : (
                        <div className="gift-events">
                            {current.map((event) => (
                                <GiftEvent key={event.key} event={event} onChanged={reload} />
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* At the bottom, whichever view: how much I've spent on whom in a chosen period */}
            <SpendingChart gifts={[...gifts.current, ...gifts.history]} />
        </div>
    );
}

// One event: a head (the kind of event as a coloured tab, title, date, who it's for, my total)
// and my gifts for it as cards underneath
function GiftEvent({ event, archived = false, onChanged }) {
    const { listId, santaId, personId, title, endDate, recipients, canOpen, gifts } = event;
    // The same colours as the overview's rows
    const kind = santaId ? " event-santa" : !listId ? " event-no-list" : "";
    // Wish lists are the usual case and get no tab – only the other kinds are marked
    const kicker = listId ? null : santaId ? "Secret Santa" : personId ? "Önskeprofil" : "Egen lista";
    const KickerIcon = santaId ? HatGlasses : personId ? null : Table2;
    const name = title ?? `Till ${recipients}`;
    const [showingSplit, setShowingSplit] = useState(false);
    const total = sumPrices(gifts);

    return (
        <section className={`gift-event event-group${kind}${archived ? " is-archived" : ""}`}>
            {kicker && (
                <div className="event-tab-row">
                    <p className="event-kicker">
                        {KickerIcon && <KickerIcon size={14} aria-hidden="true" />} {kicker}
                    </p>
                </div>
            )}

            <div className="gift-event-head">
                {endDate && <DateBadge iso={endDate} />}
                <div className="gift-event-title">
                    {/* The title with who it's for as a tag right after it */}
                    <h3>
                        {listId && canOpen ? <Link to={`/lists/${listId}`}>{name}</Link> : name}
                        {recipients && (
                            <span className="gift-event-to">
                                {/* Only the names show; "Till:" is for screen readers */}
                                <span className="visually-hidden">Till: </span>
                                {recipients}
                            </span>
                        )}
                    </h3>
                    {endDate && <EventDate iso={endDate} />}
                </div>
                {/* What the gifts cost in all – click it for how it's split, and what I pay */}
                <button
                    type="button"
                    className="btn btn-small btn-ghost gift-event-total"
                    onClick={() => setShowingSplit(true)}
                    aria-haspopup="dialog"
                    title="Visa fördelningen"
                >
                    <span className="gift-event-total-label">Totalt:</span>
                    {/* The coins close to the amount */}
                    <span className="gift-event-total-amount">
                        <Coins size={16} aria-hidden="true" />
                        <strong>{total === null ? "–" : formatPrice(total)}</strong>
                    </span>
                </button>
            </div>

            {showingSplit && (
                <Modal title={`Fördelning – ${name}`} onClose={() => setShowingSplit(false)}>
                    {/* The same table as on the overview: Gåva, Antal, Pris, Min del – with edit and release */}
                    <GiftTable rows={gifts} onChanged={onChanged} />
                </Modal>
            )}

            <div className="gift-cards">
                {gifts.map((g) => (
                    <GiftCard key={g.id} gift={g} onChanged={onChanged} />
                ))}
                {/* Last: an empty card to log another gift for the event */}
                <AddGiftCard event={event} archived={archived} onChanged={onChanged} />
            </div>
        </section>
    );
}
