import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import WishCard from "../components/WishCard.jsx";
import WishForm from "../components/WishForm.jsx";
import { formatDate, relativeDays } from "../format.js";

const names = (people) => people.map((p) => p.name).join(", ");

export default function ListPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data, error, loading, reload } = useFetch(`/lists/${id}`);
    const [adding, setAdding] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [busy, setBusy] = useState(false);

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { list, me, groups, admins, recipients, wishes } = data;

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
                        <div>
                            <dt>Grupper</dt>
                            <dd>{names(groups)}</dd>
                        </div>
                        <div>
                            <dt>Admins</dt>
                            <dd>{names(admins)}</dd>
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
                        {me.canEdit && (
                            <Link to={`/lists/${id}/edit`} className="btn btn-ghost">
                                Redigera
                            </Link>
                        )}
                        <button type="button" className="btn btn-danger-ghost" onClick={remove} disabled={busy}>
                            Radera
                        </button>
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
                                + Lägg till önskning
                            </button>
                        )}
                        {/* A gift bought outside the list – only those who share it ever see it */}
                        {me.seesReservations && (
                            <Link to={`/gifts/new?list=${list.id}`} className="btn btn-small btn-ghost">
                                + Gåva utanför listan
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
                    <div className="wishes">
                        {wishes.map((wish) => (
                            <WishCard key={wish.id} wish={wish} me={me} listId={list.id} onChanged={reload} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
