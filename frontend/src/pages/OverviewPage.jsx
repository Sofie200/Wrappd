import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Coins, Users, Ellipsis, Eye, HatGlasses, Heart, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import Avatar from "../components/Avatar.jsx";
import Modal from "../components/Modal.jsx";
import PersonLink from "../components/PersonLink.jsx";
import SettingsMenu from "../components/SettingsMenu.jsx";
import { buildEvents, dateOrder, EventRow, GiftsCollapse, GiftTable } from "../components/EventRow.jsx";
import { formatPrice } from "../format.js";
import DateBadge, { EventDate } from "../components/DateBadge.jsx";
import AddGiftButton from "../components/AddGiftButton.jsx";
import ListPanelCard from "../components/ListPanelCard.jsx";
import GiftPlusIcon from "../components/GiftPlusIcon.jsx";
import Confetti from "../components/Confetti.jsx";

// A Secret Santa among the events. Who I give to is hidden until I press the eye –
// someone might be looking at the screen. Below it: my gifts for it – the ones linked to the draw,
// and what I've reserved on the receiver's wish profile.
function SantaRow({ santa, gifts = [], onChanged }) {
    const { user } = useAuth();
    const [shown, setShown] = useState(false);
    // A little confetti every time the name is revealed
    const [burst, setBurst] = useState(0);
    const nameRef = useRef(null);
    const [showParticipants, setShowParticipants] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const { receiver } = santa;
    // The receiver's wish profile opened from here: what I reserve there counts for this Secret Santa
    const santaLink = { id: santa.id, title: santa.title, date: santa.date };

    function reveal() {
        setShown(true);
        setBurst((b) => b + 1);
    }

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

    // In the section's head – on phones up in the "Mina inköp" bar
    const addGift = (
        <AddGiftButton santaId={santa.id} className="btn btn-small btn-ghost" onAdded={onChanged}>
            <GiftPlusIcon /> Överraskningsgåva
        </AddGiftButton>
    );

    return (
        <div className="event-group event-santa">
            {/* The tab and "Till:" like the lists – but who it's for stays hidden until revealed */}
            <div className="event-tab-row">
                <p className="event-kicker">
                    <HatGlasses size={14} aria-hidden="true" /> Secret Santa
                </p>
                <p className="event-to">
                    Till: <span className="event-for">{shown && receiver ? receiver.name : "Hemlig"}</span>
                </p>
            </div>
            <article className="event event-santa">
                <div className="event-info">
                    <div className="event-head">
                        <DateBadge iso={santa.date} />
                        <div className="event-title">
                            {/* The title with a "…" menu right after it, for whoever drew it */}
                            <div className="santa-title-row">
                                <h3>{santa.title}</h3>
                                {santa.isCreator && (
                                    <SettingsMenu label={`Alternativ för ${santa.title}`} icon={Ellipsis} buttonClassName="santa-menu-btn">
                                        <button type="button" className="menu-item menu-item-danger" role="menuitem" onClick={remove} disabled={busy}>
                                            <Trash2 size={16} aria-hidden="true" /> Ta bort
                                        </button>
                                    </SettingsMenu>
                                )}
                            </div>
                            {santa.date && <EventDate iso={santa.date} />}
                            <p className="santa-meta">
                                {santa.budget !== null && (
                                    <span className="santa-budget" title="Budget">
                                        <Coins size={14} aria-label="Budget" /> <strong>{formatPrice(santa.budget)}</strong>
                                    </span>
                                )}
                                <span className="santa-budget">
                                    <Users size={14} aria-hidden="true" />
                                    <button type="button" className="text-link" onClick={() => setShowParticipants(true)}>
                                        {santa.participantCount} deltagare
                                    </button>
                                </span>
                            </p>
                        </div>
                    </div>

                    {/* Who I got – hidden until I press the eye */}
                    {receiver && (
                        <div className="santa-secret">
                            <div className="santa-who">
                            <p className="santa-label">Du ska ge en gåva till:</p>
                            {/* The same placeholder for everyone while hidden, so the blur doesn't hint at the name's length */}
                            <div className="santa-name-row">
                                {/* Hidden: a blurred placeholder with the eye on top – a click reveals it (no hiding again).
                                    Shown: the name itself opens the wish profile. */}
                                <span className="santa-name-wrap" ref={nameRef} aria-live="polite">
                                    {shown ? (
                                        <PersonLink person={receiver} santa={santaLink} onReserved={onChanged} className="santa-name text-link santa-name-link" title="Se vad hen önskar sig">
                                            {receiver.name}
                                        </PersonLink>
                                    ) : (
                                        <>
                                            <span className="santa-name santa-name-hidden" onClick={reveal} title="Visa">
                                                Hemlis
                                            </span>
                                            <button
                                                type="button"
                                                className="icon-btn santa-eye santa-eye-over"
                                                onClick={reveal}
                                                aria-label="Visa vem du fått"
                                                title="Visa"
                                            >
                                                <Eye size={16} aria-hidden="true" />
                                            </button>
                                        </>
                                    )}
                                </span>
                            </div>
                            </div>
                            {burst > 0 && <Confetti key={burst} anchor={nameRef} />}
                        </div>
                    )}
                </div>

                {/* Right side: only my gifts for it */}
                <GiftsCollapse count={receiver ? gifts.length : null} actions={receiver ? addGift : null}>
                <div className="event-gifts">
                    <ErrorMessage message={error} />
                    {receiver ? (
                        <>
                            <div className="event-gifts-head">
                                <h4>
                                    Mina inköp {gifts.length > 0 && <span className="muted small">({gifts.length})</span>}
                                </h4>
                                {addGift}
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
                                        <PersonLink person={receiver} santa={santaLink} onReserved={onChanged} className="text-link" title="Se vad hen önskar sig">
                                            önskeprofilen
                                        </PersonLink>{" "}
                                        eller lägg till en{" "}
                                        <AddGiftButton santaId={santa.id} className="text-link" onAdded={onChanged}>
                                            överraskningsgåva
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
                </GiftsCollapse>
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
                        <div>
                            <p className="santa-nudge-title">
                                Du är med i en Secret Santa! <HatGlasses size={20} aria-hidden="true" />
                            </p>
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
                    <div className="cards list-cards">
                        {privateLists.map((list) => (
                            <ListPanelCard key={list.id} list={list} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
