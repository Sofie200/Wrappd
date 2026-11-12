import { useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Coins, Ellipsis, Gift, Pencil, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import { buildEvents, GiftTable, sumPrices } from "../components/EventRow.jsx";
import LogGiftButton from "../components/LogGiftButton.jsx";
import GiftPlusIcon from "../components/GiftPlusIcon.jsx";
import GiftCard from "../components/GiftCard.jsx";
import AddGiftCard from "../components/AddGiftCard.jsx";
import SpendingChart from "../components/SpendingChart.jsx";
import DateBadge, { EventDate } from "../components/DateBadge.jsx";
import { formatPrice } from "../format.js";
import Modal from "../components/Modal.jsx";
import SettingsMenu from "../components/SettingsMenu.jsx";
import EditEventModal from "../components/EditEventModal.jsx";

// /gifts - everything I've bought or share, as cards grouped by event: the coming events (soonest first,
// gifts from wish profiles last) - or, switched with the Arkiv button (like on Mina listor), the past ones
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
                    {/* A gift on an event of my own: first the event (an existing one or a new), then the gift */}
                    <LogGiftButton className="btn btn-primary" onAdded={reload}>
                        <GiftPlusIcon /> Logga gåva
                    </LogGiftButton>
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

            {showArchive ? (
                <section className="section">
                    <h2>Arkiv</h2>
                    {history.length > 0 && <p className="muted">Gåvor till händelser vars datum har passerat.</p>}
                    {history.length === 0 ? (
                        <Empty>Här hamnar gåvorna när händelsen är över - ett litet minnesalbum över allt du gett bort.</Empty>
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
                    {current.length > 0 && <h2>Aktuella</h2>}
                    {current.length === 0 ? (
                        // A div, not <Empty>'s <p>: the "logga en gåva" button carries its modal (a <dialog>)
                        <div className="empty">
                            Inga gåvor på gång just nu. Kika in på <Link to="/">Översikten</Link> och se vem som har önskat
                            sig något - eller{" "}
                            <LogGiftButton className="text-link" onAdded={reload}>
                                logga en gåva
                            </LogGiftButton>{" "}
                            du redan köpt.
                        </div>
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
    const { listId, santaId, personId, eventId, title, endDate, recipients, canOpen, gifts } = event;
    // The surface's colour by kind: wish lists beige-pink, logged gifts pale blue, Secret Santa pale yellow
    // (the tab colours for Secret Santa / Önskeprofil come from the same classes as on the overview)
    const kind = santaId ? " event-santa" : eventId ? " event-logged" : !listId ? " event-no-list" : "";
    // Only gifts from a wish profile get a tab - the surface's colour tells the other kinds apart
    // (wish lists beige-pink, logged gifts blue, Secret Santa yellow)
    const kicker = personId ? "Önskeprofil" : null;
    const name = title ?? `Till ${recipients}`;
    const [showingSplit, setShowingSplit] = useState(false);
    const [editingEvent, setEditingEvent] = useState(false);
    const [error, setError] = useState(null);

    // The whole event - and all its gifts, for everyone who shares them
    async function removeEvent() {
        const giftsText = gifts.length === 1 ? "dess gåva" : `alla dess ${gifts.length} gåvor`;
        if (!window.confirm(`Ta bort "${name}" och ${giftsText}?\n\nGåvorna tas bort för alla som delar på dem. Det går inte att ångra.`)) return;
        setError(null);
        try {
            await api(`/gifts/events/${eventId}`, { method: "DELETE" });
            onChanged();
        } catch (err) {
            setError(err.message);
        }
    }
    const total = sumPrices(gifts);

    return (
        <section className={`gift-event event-group${kind}${archived ? " is-archived" : ""}`}>
            {kicker && (
                <div className="event-tab-row">
                    <p className="event-kicker">{kicker}</p>
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
                        {/* An event of my own: a "…" menu after the title and the name tag, to edit it */}
                        {eventId && (
                            <SettingsMenu label={`Alternativ för ${name}`} icon={Ellipsis} buttonClassName="santa-menu-btn">
                                <button type="button" className="menu-item" role="menuitem" onClick={() => setEditingEvent(true)}>
                                    <Pencil size={16} aria-hidden="true" /> Redigera händelse
                                </button>
                                <button type="button" className="menu-item menu-item-danger" role="menuitem" onClick={removeEvent}>
                                    <Trash2 size={16} aria-hidden="true" /> Ta bort händelse
                                </button>
                            </SettingsMenu>
                        )}
                    </h3>
                    {endDate && <EventDate iso={endDate} />}
                </div>
                {/* What the gifts cost in all - click it for how it's split, and what I pay */}
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
                        <strong>{total === null ? "-" : formatPrice(total)}</strong>
                    </span>
                </button>
            </div>

            {editingEvent && (
                <EditEventModal
                    eventId={eventId}
                    onClose={() => setEditingEvent(false)}
                    onSaved={() => {
                        setEditingEvent(false);
                        onChanged();
                    }}
                />
            )}

            {showingSplit && (
                <Modal title={`Fördelning - ${name}`} onClose={() => setShowingSplit(false)}>
                    {/* The same table as on the overview: Gåva, Antal, Pris, Min utgift - with edit and release */}
                    <GiftTable rows={gifts} onChanged={onChanged} />
                </Modal>
            )}

            <ErrorMessage message={error} />

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
