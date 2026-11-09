import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Ellipsis, GlobeCheck, Pencil, Settings, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import WishCard from "../components/WishCard.jsx";
import WishForm from "../components/WishForm.jsx";
import Modal from "../components/Modal.jsx";
import AddGiftButton from "../components/AddGiftButton.jsx";
import GiftPlusIcon from "../components/GiftPlusIcon.jsx";
import SettingsMenu from "../components/SettingsMenu.jsx";
import Avatar from "../components/Avatar.jsx";
import { GiftEditor } from "./GiftPage.jsx";
import { formatDate, formatPrice, relativeDays } from "../format.js";

const names = (people) => people.map((p) => p.name).join(", ");

// Wishes in sections by price per item. Cheapest first within each section; no price last.
const PRICE_GROUPS = [
    { key: "low", title: "Upp till 250 kr", test: (p) => p <= 250 },
    { key: "mid", title: "250–500 kr", test: (p) => p > 250 && p <= 500 },
    { key: "high", title: "Över 500 kr", test: (p) => p > 500 },
    { key: "none", title: "Utan pris", test: (p) => p === null },
];

function groupByPrice(wishes) {
    const price = (w) => (w.price === null ? null : Number(w.price));
    return PRICE_GROUPS.map((group) => ({
        ...group,
        wishes: wishes
            .filter((w) => group.test(price(w)))
            .sort((a, b) => (price(a) ?? 0) - (price(b) ?? 0) || a.title.localeCompare(b.title, "sv")),
    })).filter((group) => group.wishes.length > 0);
}

export default function ListPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data, error, loading, reload } = useFetch(`/lists/${id}`);
    const [adding, setAdding] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [busy, setBusy] = useState(false);

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { list, me, groups, recipients, wishes, myGifts = [] } = data;

    async function publish() {
        const ok = window.confirm(
            `Publicera listan för ${names(groups)}?\n\nEn publik lista kan inte göras privat igen.`
        );
        if (!ok) return;
        setBusy(true);
        setActionError(null);
        try {
            await api(`/lists/${id}/publish`, { method: "POST" });
            reload();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!window.confirm(`Radera listan "${list.title}" och alla dess önskningar?`)) return;
        setBusy(true);
        setActionError(null);
        try {
            await api(`/lists/${id}`, { method: "DELETE" });
            navigate("/");
        } catch (err) {
            setActionError(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="page">
            <header className="list-head page-intro">
                <div>
                    {/* Who it's for, first */}
                    <dl className="list-meta">
                        <div>
                            <dt>Till</dt>
                            <dd>
                                {recipients.map((person, i) => (
                                    <span key={person.id}>
                                        {i > 0 && ", "}
                                        {person.name}
                                    </span>
                                ))}
                            </dd>
                        </div>
                    </dl>
                    <h1>
                        {list.title}
                        {/* Only private lists get a badge, raised next to the title */}
                        {!list.isPublic && <span className="badge badge-private title-badge">Privat</span>}
                    </h1>
                    <p className="list-date">
                        {formatDate(list.endDate)} <span className="muted">· {relativeDays(list.endDate)}</span>
                    </p>
                    {list.description && <p className="list-description">{list.description}</p>}
                    {/* Admin: edit and delete, under the description */}
                    {me.isAdmin && (
                        <div className="actions list-admin-actions">
                            {me.canEdit && (
                                <Link to={`/lists/${id}/edit`} className="btn btn-small btn-ghost">
                                    <Settings size={16} aria-hidden="true" /> Inställningar
                                </Link>
                            )}
                            <button type="button" className="btn btn-small btn-danger-ghost" onClick={remove} disabled={busy}>
                                <Trash2 size={16} aria-hidden="true" /> Ta bort
                            </button>
                        </div>
                    )}
                </div>

                {me.canEdit && !list.isPublic && (
                    <div className="actions">
                        <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>
                            <GlobeCheck size={16} aria-hidden="true" /> Publicera
                        </button>
                    </div>
                )}
            </header>

            <ErrorMessage message={actionError} />

            {!list.isPublic && !list.archived && (
                <Notice>
                    {/* One span, so the link follows the sentence instead of being pushed to the right */}
                    <span>
                        Listan är privat. Bara listans admins ser den tills någon publicerar den.
                        {me.canEdit && (
                            <>
                                {" "}
                                <button type="button" className="text-link" onClick={publish} disabled={busy}>
                                    Publicera
                                </button>
                                .
                            </>
                        )}
                    </span>
                </Notice>
            )}
            {me.isRecipient && (
                <Notice>Listan är till dig, så du ser inte vad som är reserverat – det är en överraskning.</Notice>
            )}
            {list.archived && <Notice>Eventet har varit. Listan är arkiverad och kan inte längre ändras.</Notice>}

            <section className="section">
                <div className="section-head">
                    <h2>Önskningar ({wishes.length})</h2>
                    <div className="actions">
                        {me.canEdit && (
                            <button type="button" className="btn btn-small" onClick={() => setAdding(true)} aria-haspopup="dialog">
                                <Sparkles size={16} aria-hidden="true" /> Lägg till önskning
                            </button>
                        )}
                        {/* A gift bought outside the list – only those who share it ever see it. Only once it's published. */}
                        {me.seesReservations && list.isPublic && (
                            <AddGiftButton listId={list.id} onAdded={reload}>
                                <GiftPlusIcon /> Överraskningsgåva
                            </AddGiftButton>
                        )}
                    </div>
                </div>

                {adding && (
                    <Modal title="Lägg till önskning" onClose={() => setAdding(false)}>
                        <WishForm
                            listId={list.id}
                            onSaved={() => {
                                setAdding(false);
                                reload();
                            }}
                            onCancel={() => setAdding(false)}
                        />
                    </Modal>
                )}

                {wishes.length === 0 ? (
                    <Empty>Inga önskningar än.</Empty>
                ) : (
                    groupByPrice(wishes).map((group) => (
                        <section key={group.key} className="price-group" aria-labelledby={`price-${group.key}`}>
                            <h3 id={`price-${group.key}`} className="subhead">
                                {group.title} <span className="muted small">({group.wishes.length})</span>
                            </h3>
                            <div className="wishes">
                                {group.wishes.map((wish) => (
                                    <WishCard key={wish.id} wish={wish} me={me} listId={list.id} onChanged={reload} />
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </section>

            {/* My own gifts linked to this list – last, looking like the wishes. Only for me (and those I share them with) */}
            {myGifts.length > 0 && (
                <section className="section">
                    <h3 className="subhead">
                        Mina överraskningsgåvor <span className="muted small">({myGifts.length})</span>
                    </h3>
                    <div className="wishes">
                        {myGifts.map((gift) => (
                            <OwnGiftCard key={gift.id} gift={gift} onChanged={reload} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

// One of my own gifts on the list, as a row like a wish: image, title and price, who shares it,
// and a "…" menu. The row opens the gift for editing.
function OwnGiftCard({ gift, onChanged }) {
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState(null);
    const shared = (gift.people ?? []).length > 1;
    const names = (gift.people ?? []).map((p) => p.name).join(", ");

    async function remove() {
        if (!window.confirm(`Ta bort "${gift.title}"? Gåvan tas bort för alla som delar på den.`)) return;
        try {
            await api(`/gifts/${gift.id}`, { method: "DELETE" });
            onChanged();
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <>
            <div className="wish-row has-menu">
                <button type="button" className="wish" onClick={() => setEditing(true)} aria-haspopup="dialog">
                    {gift.imageUrl ? (
                        <img className="wish-image" src={gift.imageUrl} alt="" loading="lazy" />
                    ) : (
                        <img className="wish-image wish-image-empty" src="/gift-placeholder.png" alt="" />
                    )}
                    <span className="wish-summary">
                        <span className="wish-title">{gift.title}</span>
                        {gift.price !== null && (
                            <span className="wish-meta">
                                <span className="price">{formatPrice(gift.price)}</span>
                            </span>
                        )}
                    </span>
                    {shared && (
                        <span className="wish-reserved">
                            <span className="avatar-stack" title={`Delas av ${names}`}>
                                {gift.people.map((p) => (
                                    <Avatar key={p.id} icon={p.avatarIcon} color={p.avatarColor} size={22} />
                                ))}
                                <span className="visually-hidden">Delas av {names}</span>
                            </span>
                        </span>
                    )}
                </button>
                <div className="wish-row-menu">
                    <SettingsMenu label={`Alternativ för ${gift.title}`} icon={Ellipsis}>
                        <button type="button" className="menu-item" role="menuitem" onClick={() => setEditing(true)}>
                            <Pencil size={16} aria-hidden="true" /> Redigera
                        </button>
                        <button type="button" className="menu-item menu-item-danger" role="menuitem" onClick={remove}>
                            <Trash2 size={16} aria-hidden="true" /> Ta bort
                        </button>
                    </SettingsMenu>
                </div>
            </div>
            <ErrorMessage message={error} />

            {editing && (
                <Modal title={gift.title} onClose={() => setEditing(false)}>
                    <GiftEditor
                        id={gift.id}
                        onDone={() => {
                            setEditing(false);
                            onChanged();
                        }}
                    />
                </Modal>
            )}
        </>
    );
}
