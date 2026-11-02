import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import SettingsMenu from "../components/SettingsMenu.jsx";
import WishCard from "../components/WishCard.jsx";
import WishForm from "../components/WishForm.jsx";
import { formatDate, relativeDays } from "../format.js";

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

    const { list, me, groups, recipients, wishes } = data;

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
            <header className="list-head">
                <div>
                    <div className="badges">
                        {list.archived && <span className="badge">Arkiverad</span>}
                        {!list.archived && (list.isPublic ? (
                            <span className="badge badge-public">Publik</span>
                        ) : (
                            <span className="badge badge-private">Privat</span>
                        ))}
                        {me.isRecipient && <span className="badge badge-gift">Till dig</span>}
                    </div>
                    <h1>{list.title}</h1>
                    <p className="list-date">
                        {formatDate(list.endDate)} <span className="muted">· {relativeDays(list.endDate)}</span>
                    </p>
                    {list.description && <p className="list-description">{list.description}</p>}
                    <dl className="list-meta">
                        <div>
                            <dt>Till</dt>
                            <dd>{names(recipients)}</dd>
                        </div>
                    </dl>
                </div>

                {me.isAdmin && (
                    <div className="actions">
                        {me.canEdit && !list.isPublic && (
                            <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>
                                Publicera
                            </button>
                        )}
                        <SettingsMenu label="Listans inställningar">
                            {me.canEdit && (
                                <Link to={`/lists/${id}/edit`} className="menu-item" role="menuitem">
                                    <Pencil size={16} aria-hidden="true" /> Redigera
                                </Link>
                            )}
                            <button
                                type="button"
                                className="menu-item menu-item-danger"
                                role="menuitem"
                                onClick={remove}
                                disabled={busy}
                            >
                                <Trash2 size={16} aria-hidden="true" /> Ta bort
                            </button>
                        </SettingsMenu>
                    </div>
                )}
            </header>

            <ErrorMessage message={actionError} />

            {!list.isPublic && !list.archived && (
                <Notice>Listan är privat. Bara listans admins ser den tills någon publicerar den.</Notice>
            )}
            {me.isRecipient && (
                <Notice>Listan är till dig, så du ser inte vad som är reserverat – det är en överraskning.</Notice>
            )}
            {list.archived && <Notice>Eventet har varit. Listan är arkiverad och kan inte längre ändras.</Notice>}

            <section className="section">
                <div className="section-head">
                    <h2>Önskningar ({wishes.length})</h2>
                    <div className="actions">
                        {me.canEdit && !adding && (
                            <button type="button" className="btn btn-small" onClick={() => setAdding(true)}>
                                <Plus size={16} aria-hidden="true" /> Lägg till önskning
                            </button>
                        )}
                        {/* A gift bought outside the list – only those who share it ever see it */}
                        {me.seesReservations && (
                            <Link to={`/gifts/new?list=${list.id}`} className="btn btn-small btn-ghost">
                                <Plus size={16} aria-hidden="true" /> Gåva utanför listan
                            </Link>
                        )}
                    </div>
                </div>

                {adding && (
                    <div className="panel">
                        <WishForm
                            listId={list.id}
                            onSaved={() => {
                                setAdding(false);
                                reload();
                            }}
                            onCancel={() => setAdding(false)}
                        />
                    </div>
                )}

                {wishes.length === 0 && !adding ? (
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
        </div>
    );
}
