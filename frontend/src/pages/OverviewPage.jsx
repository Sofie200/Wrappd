import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Gift, HatGlasses, Heart, Lock, Pencil, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import Avatar from "../components/Avatar.jsx";
import Modal from "../components/Modal.jsx";
import PersonLink from "../components/PersonLink.jsx";
import { buildEvents, dateOrder, EventRow, GiftTable } from "../components/EventRow.jsx";
import { formatPrice } from "../format.js";
import DateBadge from "../components/DateBadge.jsx";
import AddGiftButton from "../components/AddGiftButton.jsx";

// A Secret Santa among the events. Who I give to is hidden until I press the eye –
// someone might be looking at the screen. Below it: my gifts for it – the ones linked to the draw,
// and what I've reserved on the receiver's wish profile.
function SantaRow({ santa, gifts = [], onChanged }) {
    const { user } = useAuth();
    const [shown, setShown] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const { receiver } = santa;

    async function remove() {
        if (
            !window.confirm(
                `Ta bort "${santa.title}"? Lottningen försvinner för alla och kan inte återskapas. Gåvor som deltagarna har kopplat till den tas också bort.`
            )
        ) {
            return;
        }
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
        <div className="event-group">
            {/* Same label as the lists – but it never says who */}
            <p className="event-to">
                Till: <span className="event-for">Hemlig</span>
            </p>
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
                    <div className="event-head">
                        <DateBadge iso={santa.date} />
                        <div className="event-title">
                            <p className="event-kicker">
                                <HatGlasses size={14} aria-hidden="true" /> Secret Santa
                            </p>
                            <h3>{santa.title}</h3>
                        </div>
                    </div>
                    <p className="event-recipients">
                        {santa.groupName} ·{" "}
                        <button type="button" className="text-link" onClick={() => setShowParticipants(true)}>
                            {santa.participantCount} deltagare
                        </button>
                    </p>
                    {santa.budget !== null && <p className="event-recipients">Budget: <strong>{formatPrice(santa.budget)}</strong></p>}

                    {/* Who I got – hidden until I press the eye */}
                    {receiver && (
                        <div className="santa-secret">
                            <div className="santa-label-row">
                                <p className="santa-label">Du ska ge en gåva till</p>
                                <button
                                    type="button"
                                    className="icon-btn santa-eye"
                                    onClick={() => setShown(!shown)}
                                    aria-pressed={shown}
                                    aria-label={shown ? "Dölj vem du fått" : "Visa vem du fått"}
                                    title={shown ? "Dölj" : "Visa"}
                                >
                                    {shown ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                                </button>
                            </div>
                            {/* The same placeholder for everyone while hidden, so the blur doesn't hint at the name's length */}
                            {/* Clicking the name shows/hides it too (the eye is the button for keyboard and screen readers) */}
                            <span
                                className={`santa-name${shown ? "" : " santa-name-hidden"}`}
                                aria-live="polite"
                                onClick={() => setShown(!shown)}
                                title={shown ? "Dölj" : "Visa"}
                            >
                                {shown ? receiver.name : "Hemlis"}
                            </span>
                        </div>
                    )}

                    {/* Bottom right, like "Se lista" on the other cards. Opens the profile without revealing
                        the name here – the modal shows it, on purpose. */}
                    {receiver && (
                        <div className="event-foot">
                            <PersonLink person={receiver} className="btn btn-small event-link" title="Se vad hen önskar sig">
                                Se önskeprofil <ArrowRight size={16} aria-hidden="true" />
                            </PersonLink>
                        </div>
                    )}
                </div>

                {/* Right side: only my gifts for it */}
                <div className="event-gifts">
                    <ErrorMessage message={error} />
                    {receiver ? (
                        <>
                            <div className="event-gifts-head">
                                <h4>
                                    Mina inköp {gifts.length > 0 && <span className="muted small">({gifts.length})</span>}
                                </h4>
                                <AddGiftButton santaId={santa.id} className="btn btn-small btn-ghost" onAdded={onChanged}>
                                    <Gift size={16} aria-hidden="true" /> Lägg till egen gåva
                                </AddGiftButton>
                            </div>
                            {gifts.length > 0 ? (
                                <GiftTable rows={gifts} onChanged={onChanged} totalLabel="Totalt" />
                            ) : (
                                <div className="event-empty">
                                    <p>
                                        Du har inte registrerat några köp än 🙁
                                        <br />
                                        {/* Own title, so the tooltip doesn't give away who it is */}
                                        Reservera något från{" "}
                                        <PersonLink person={receiver} className="text-link" title="Se vad hen önskar sig">
                                            önskeprofilen
                                        </PersonLink>{" "}
                                        eller lägg till en{" "}
                                        <AddGiftButton santaId={santa.id} className="text-link" onAdded={onChanged}>
                                            egen post
                                        </AddGiftButton>
                                        .
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="event-note">
                            Du har lottat den här men är inte med själv. Ingen, inte heller du, kan se vem som fick vem.
                        </p>
                    )}
                </div>
                {/* Everyone who takes part – never who gives to whom */}
                {showParticipants && (
                    <Modal title={`Deltagare i ${santa.title}`} onClose={() => setShowParticipants(false)}>
                        <ul className="member-list">
                            {(santa.participants ?? []).map((p) => (
                                <li key={p.id}>
                                    <span className="member-name">
                                        <Avatar icon={p.avatarIcon} color={p.avatarColor} size={32} />
                                        {p.name}
                                        {p.id === user.id && <span className="muted"> (du)</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <p className="muted small">Alla ger en gåva och får en. Ingen kan se vem som har fått vem.</p>
                    </Modal>
                )}
            </article>
        </div>
    );
}

// One of my private (not yet published) lists: the same look as the event panels, but inverted –
// white with rose details. Only the panel, since nobody can buy anything before it's published.
function PrivateListCard({ list }) {
    return (
        <div className="event-group">
            {list.recipients && (
                <p className="event-to">
                    Till: <span className="event-for">{list.recipients}</span>
                </p>
            )}
            <article className="event event-light">
                <div className="event-info">
                    <Link to={`/lists/${list.id}`} className="event-edit" aria-label={`Öppna ${list.title}`} title="Öppna listan">
                        <Pencil size={16} aria-hidden="true" />
                    </Link>
                    <div className="event-head">
                        <DateBadge iso={list.endDate} />
                        <div className="event-title">
                            <p className="event-kicker">
                                <Lock size={14} aria-hidden="true" /> Privat lista
                            </p>
                            <h3>{list.title}</h3>
                        </div>
                    </div>
                    <p className="event-stats">
                        <span>
                            <Sparkles size={14} aria-hidden="true" /> {list.wishCount} {list.wishCount === 1 ? "önskning" : "önskningar"}
                        </span>
                    </p>
                </div>
            </article>
        </div>
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

    // My gifts for each Secret Santa I give in: the ones linked to it, and what I've reserved on the
    // receiver's wish profile. They're shown on the Santa card, not as events of their own.
    const santaGifts = new Map();
    for (const santa of santas) {
        if (!santa.receiver) continue;
        santaGifts.set(
            santa.id,
            gifts.current.filter(
                (g) => g.santaId === santa.id || (!g.listId && !g.santaId && g.personId === santa.receiver.id)
            )
        );
    }
    const onSantaCards = new Set([...santaGifts.values()].flat().map((g) => g.id));

    // Lists, Secret Santas and other events together, soonest first
    const events = [
        ...santas.map((santa) => ({ key: `santa:${santa.id}`, santa, date: santa.date })),
        ...buildEvents(upcoming, gifts.current.filter((g) => !onSantaCards.has(g.id))).map((event) => ({
            ...event,
            date: event.endDate,
        })),
    ].sort((a, b) => dateOrder(a.date) - dateOrder(b.date));

    return (
        <div className="page">
            <header className="page-intro">
                <h1>Hej {user.name}!</h1>

                {santaNeedsProfile && (
                    <div className="santa-nudge" role="status">
                        <HatGlasses size={28} aria-hidden="true" />
                        <div>
                            <p className="santa-nudge-title">Du är med i en Secret Santa!</p>
                            <p>Fyll i din önskeprofil, så vet den som har fått dig vad du gillar.</p>
                        </div>
                        <Link to={`/people/${user.id}/edit`} className="btn btn-small btn-primary">
                            <Heart size={16} aria-hidden="true" /> Min önskeprofil <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                    </div>
                )}
            </header>

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
                                <SantaRow key={event.key} santa={event.santa} gifts={santaGifts.get(event.santa.id)} onChanged={reload} />
                            ) : (
                                <EventRow key={event.key} event={event} onChanged={reload} />
                            )
                        )}
                    </div>
                )}
            </section>

            {/* Only when there are any – the published ones are among the events above */}
            {privateLists.length > 0 && (
                <section className="section">
                    <div className="section-head">
                        <h2>Mina privata listor</h2>
                    </div>
                    {/* Lists whose date has passed are in the archive */}
                    <div className="cards private-lists">
                        {privateLists.map((list) => (
                            <PrivateListCard key={list.id} list={list} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
