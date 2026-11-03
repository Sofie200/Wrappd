import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Eye, EyeOff, Gift, Heart, Plus, Trash2, TreePine } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import Avatar from "../components/Avatar.jsx";
import ListCard from "../components/ListCard.jsx";
import PersonLink from "../components/PersonLink.jsx";
import { buildEvents, dateOrder, EventRow } from "../components/EventRow.jsx";
import { formatDate, formatPrice, relativeDays } from "../format.js";

// A Secret Santa among the events. Who I give to is hidden until I press the eye –
// someone might be looking at the screen.
function SantaRow({ santa, onChanged }) {
    const [shown, setShown] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const { receiver } = santa;

    async function remove() {
        if (!window.confirm(`Ta bort "${santa.title}"? Lottningen försvinner för alla och kan inte återskapas.`)) return;
        setBusy(true);
        setError(null);
        try {
            await api(`/santas/${santa.id}`, { method: "DELETE" });
            onChanged();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <article className="event event-santa">
            <div className="event-info">
                {santa.isCreator && (
                    <button
                        type="button"
                        className="event-edit"
                        onClick={remove}
                        disabled={busy}
                        aria-label={`Ta bort ${santa.title}`}
                        title="Ta bort lottningen"
                    >
                        <Trash2 size={16} aria-hidden="true" />
                    </button>
                )}
                <p className="event-kicker">
                    <TreePine size={14} aria-hidden="true" /> Secret Santa
                </p>
                <h3>{santa.title}</h3>
                <p className="event-date">
                    <CalendarDays size={16} aria-hidden="true" /> {formatDate(santa.date)}
                </p>
                <p className="event-when">{relativeDays(santa.date)}</p>
                <p className="event-recipients">
                    {santa.groupName} · {santa.participantCount} deltagare
                </p>
                {santa.budget !== null && <p className="event-recipients">Budget: {formatPrice(santa.budget)}</p>}
            </div>

            <div className="event-gifts">
                <ErrorMessage message={error} />
                {receiver ? (
                    <div className="santa-secret">
                        <p className="santa-label">Du ska ge en gåva till</p>
                        <div className="santa-reveal">
                            {shown ? (
                                <Avatar icon={receiver.avatarIcon} color={receiver.avatarColor} size={48} />
                            ) : (
                                <span className="santa-mystery" aria-hidden="true">
                                    <Gift size={24} />
                                </span>
                            )}
                            <span className={`santa-name${shown ? "" : " santa-name-hidden"}`} aria-live="polite">
                                {shown ? receiver.name : "Dolt"}
                            </span>
                            <button
                                type="button"
                                className="icon-btn santa-eye"
                                onClick={() => setShown(!shown)}
                                aria-pressed={shown}
                                aria-label={shown ? "Dölj vem du fått" : "Visa vem du fått"}
                                title={shown ? "Dölj" : "Visa"}
                            >
                                {shown ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                            </button>
                        </div>
                        {/* Opens the profile without revealing the name here – the modal shows it, on purpose */}
                        <PersonLink person={receiver} className="btn btn-small santa-profile-btn" title="Se vad hen önskar sig">
                            <Heart size={16} aria-hidden="true" /> Se önskeprofilen
                        </PersonLink>
                        <p className="muted small">Ingen annan kan se vem du har fått – och du ser inte vem som har fått dig.</p>
                    </div>
                ) : (
                    <p className="event-note">
                        Du har lottat den här men är inte med själv. Ingen, inte heller du, kan se vem som fick vem.
                    </p>
                )}
            </div>
        </article>
    );
}

export default function OverviewPage() {
    const { user } = useAuth();
    const { data, error, loading, reload } = useFetch("/profile");

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { upcoming, gifts, adminLists, santas = [], profileEmpty = false } = data;
    // In a Secret Santa (someone has drawn me) but nothing in my wish profile – they won't know what to buy
    const santaNeedsProfile = profileEmpty && santas.some((santa) => santa.receiver);
    // Published lists are among the events above – here only my coming lists that aren't published yet
    const privateLists = adminLists.filter((list) => !list.archived && !list.isPublic);
    const archivedCount = adminLists.filter((list) => list.archived).length;

    // Lists and Secret Santas together, soonest first
    const events = [
        ...buildEvents(upcoming, gifts.current).map((event) => ({ ...event, date: event.endDate })),
        ...santas.map((santa) => ({ key: `santa:${santa.id}`, santa, date: santa.date })),
    ].sort((a, b) => dateOrder(a.date) - dateOrder(b.date));
    const history = buildEvents([], gifts.history, { newestFirst: true });

    return (
        <div className="page">
            <h1>Hej {user.name}!</h1>

            {santaNeedsProfile && (
                <div className="santa-nudge" role="status">
                    <TreePine size={28} aria-hidden="true" />
                    <div>
                        <p className="santa-nudge-title">Du är med i en Secret Santa!</p>
                        <p>Fyll i din önskeprofil, så vet den som har fått dig vad du gillar.</p>
                    </div>
                    <Link to={`/people/${user.id}/edit`} className="btn btn-small btn-primary">
                        Fyll i önskeprofil <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                </div>
            )}

            <section className="section">
                <div className="section-head">
                    <h2>Kommande händelser</h2>
                </div>

                {events.length === 0 ? (
                    <Empty>
                        Inget planerat än, men allt kan firas 🎉 <Link to="/lists/new">Klicka här</Link> för att skapa en ny önskelista!
                    </Empty>
                ) : (
                    <div className="events">
                        {events.map((event) =>
                            event.santa ? (
                                <SantaRow key={event.key} santa={event.santa} onChanged={reload} />
                            ) : (
                                <EventRow key={event.key} event={event} onChanged={reload} />
                            )
                        )}
                    </div>
                )}

                {history.length > 0 && (
                    <details className="history">
                        <summary>Tidigare inköp ({gifts.history.length})</summary>
                        <div className="events">
                            {history.map((event) => (
                                <EventRow key={event.key} event={event} archived onChanged={reload} />
                            ))}
                        </div>
                    </details>
                )}
            </section>

            {/* Only when there are any – the published ones are among the events above */}
            {privateLists.length > 0 && (
                <section className="section">
                    <div className="section-head">
                        <h2>Mina privata listor</h2>
                        <div className="actions">
                            <Link to="/lists/new" className="btn btn-small">
                                <Plus size={16} aria-hidden="true" /> Ny lista
                            </Link>
                            <Link to="/archive" className="btn btn-small btn-ghost">
                                Arkiv{archivedCount > 0 && ` (${archivedCount})`}
                            </Link>
                        </div>
                    </div>
                    {/* Lists whose date has passed are in the archive */}
                    <div className="cards">
                        {privateLists.map((list) => (
                            <ListCard
                                key={list.id}
                                list={{ ...list, isAdmin: true }}
                                extra={
                                    <p className="muted small">
                                        {list.wishCount} {list.wishCount === 1 ? "önskning" : "önskningar"}
                                    </p>
                                }
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
