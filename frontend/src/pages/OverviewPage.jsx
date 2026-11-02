import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ListCard from "../components/ListCard.jsx";
import Modal from "../components/Modal.jsx";
import { GiftEditor } from "./GiftPage.jsx";
import { formatDate, formatPrice } from "../format.js";

const sumShares = (rows) => rows.reduce((sum, g) => sum + Math.round((g.myShare ?? 0) * 100), 0) / 100;

// Group my gifts by event: one group per wish list. Gifts without a list are grouped
// by recipient and date. Keeps the server's order (soonest/latest event first).
// `events` are lists I'm invited to – those I haven't bought anything for yet become
// empty groups, as a reminder. Then everything is sorted by date, soonest first.
function groupByEvent(rows, events = []) {
    const groups = new Map();
    for (const g of rows) {
        const key = g.listId ? `list:${g.listId}` : `off:${g.recipients}|${g.endDate}`;
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                listId: g.listId,
                title: g.listTitle,
                recipients: g.recipients,
                endDate: g.endDate,
                gifts: [],
            });
        }
        groups.get(key).gifts.push(g);
    }

    if (events.length === 0) return [...groups.values()];

    for (const list of events) {
        const key = `list:${list.id}`;
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                listId: list.id,
                title: list.title,
                recipients: list.recipients,
                endDate: list.endDate,
                gifts: [],
            });
        }
    }
    return [...groups.values()].sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
}

// The gifts for one event: the gift's total price, and my share of it.
// Edit and delete as icons at the end of each row.
function GiftTable({ rows, onChanged }) {
    const [editing, setEditing] = useState(null); // the gift being edited in the modal
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState(null);

    async function remove(g) {
        const question = g.offList
            ? `Ta bort "${g.title}"? Gåvan tas bort för alla som delar på den.`
            : `Ångra reservationen av "${g.title}"? Gåvan tas bort för alla som delar på den.`;
        if (!window.confirm(question)) return;
        setBusyId(g.id);
        setError(null);
        try {
            await api(`/gifts/${g.id}`, { method: "DELETE" });
            onChanged();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <>
            <ErrorMessage message={error} />
            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Gåva</th>
                            <th className="num">Antal</th>
                            <th className="num">Pris</th>
                            <th className="num">Min del</th>
                            <th>
                                <span className="visually-hidden">Åtgärder</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((g) => (
                            <tr key={g.id}>
                                <td>
                                    {g.title}
                                    {g.offList && <span className="muted small"> · utanför listan</span>}
                                    {g.sharedWith && <div className="muted small">Delas med {g.sharedWith}</div>}
                                </td>
                                <td className="num">{g.quantity}</td>
                                <td className="num">{g.price === null ? "–" : formatPrice(g.price)}</td>
                                <td className="num share">{g.myShare === null ? "–" : formatPrice(g.myShare)}</td>
                                <td className="row-actions">
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        onClick={() => setEditing(g)}
                                        aria-label={`Redigera ${g.title}`}
                                        title="Redigera"
                                    >
                                        <Pencil size={16} aria-hidden="true" />
                                    </button>
                                    {/* A reservation can't be undone after the event – a gift outside the list always can */}
                                    {(g.offList || !g.archived) && (
                                        <button
                                            type="button"
                                            className="icon-btn icon-btn-danger"
                                            onClick={() => remove(g)}
                                            disabled={busyId === g.id}
                                            aria-label={`Ta bort ${g.title}`}
                                            title="Ta bort"
                                        >
                                            <Trash2 size={16} aria-hidden="true" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={3}>Min del för kalaset</td>
                            <td className="num share">{formatPrice(sumShares(rows))}</td>
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>

            {editing && (
                <Modal title={editing.title} onClose={() => setEditing(null)}>
                    <GiftEditor
                        id={editing.id}
                        onDone={() => {
                            setEditing(null);
                            onChanged();
                        }}
                    />
                </Modal>
            )}
        </>
    );
}

// All my gifts, one block per event, with a grand total when there is more than one event
function GiftGroups({ rows, events, onChanged }) {
    const groups = groupByEvent(rows, events);

    return (
        <div className="gift-groups">
            {groups.map((group) => (
                <article key={group.key} className={`gift-group${group.gifts.length === 0 ? " gift-group-empty" : ""}`}>
                    <header className="gift-group-head">
                        <div>
                            <h3>
                                {group.listId ? (
                                    <Link to={`/lists/${group.listId}`}>{group.title}</Link>
                                ) : (
                                    <>Till {group.recipients}</>
                                )}
                            </h3>
                            <p className="muted small">
                                {formatDate(group.endDate)}
                                {group.listId && group.recipients && ` · Till ${group.recipients}`}
                            </p>
                        </div>
                        {group.gifts.length > 0 && (
                            <span className="gift-group-count muted small">
                                {group.gifts.length} {group.gifts.length === 1 ? "gåva" : "gåvor"}
                            </span>
                        )}
                    </header>
                    {group.gifts.length > 0 ? (
                        <GiftTable rows={group.gifts} onChanged={onChanged} />
                    ) : (
                        <div className="gift-reminder">
                            <p>🎁 Du har inte köpt något till det här kalaset än.</p>
                            <div className="actions">
                                <Link to={`/lists/${group.listId}`} className="btn btn-small btn-primary">
                                    Se önskelistan
                                </Link>
                                <Link to={`/gifts/new?list=${group.listId}`} className="btn btn-small btn-ghost">
                                    <Plus size={16} aria-hidden="true" /> Gåva utanför listan
                                </Link>
                            </div>
                        </div>
                    )}
                </article>
            ))}

            {groups.filter((g) => g.gifts.length > 0).length > 1 && (
                <p className="gift-grand-total">
                    <span>Totalt för mig</span>
                    <span className="share">{formatPrice(sumShares(rows))}</span>
                </p>
            )}
        </div>
    );
}

export default function OverviewPage() {
    const { user } = useAuth();
    const { data, error, loading, reload } = useFetch("/profile");

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { upcoming, gifts, adminLists } = data;
    const activeAdminLists = adminLists.filter((list) => !list.archived);
    const archivedCount = adminLists.length - activeAdminLists.length;
    // Events I'm invited to (not my own birthday – I shouldn't buy for myself)
    const invitedTo = upcoming.filter((list) => !list.isRecipient);

    return (
        <div className="page">
            <h1>Hej {user.name}!</h1>

            <section className="section">
                <h2>Kommande händelser</h2>
                {upcoming.length === 0 ? (
                    <Empty>
                        Inget planerat än, men allt kan firas 🎉 <Link to="/lists/new">Klicka här</Link> för att skapa en ny önskelista!
                    </Empty>
                ) : (
                    <div className="cards">
                        {upcoming.map((list) => (
                            <ListCard
                                key={list.id}
                                list={list}
                                extra={list.groups && <p className="muted small">Grupper: {list.groups}</p>}
                            />
                        ))}
                    </div>
                )}
            </section>

            <section className="section">
                <div className="section-head">
                    <h2>Mina inköp</h2>
                    <Link to="/gifts/new" className="btn btn-small">
                        <Plus size={16} aria-hidden="true" /> Lägg till gåva
                    </Link>
                </div>
                {gifts.current.length === 0 && invitedTo.length === 0 ? (
                    <Empty>Du har inga aktuella gåvor.</Empty>
                ) : (
                    <GiftGroups rows={gifts.current} events={invitedTo} onChanged={reload} />
                )}

                {gifts.history.length > 0 && (
                    <details className="history">
                        <summary>Historik ({gifts.history.length})</summary>
                        <GiftGroups rows={gifts.history} onChanged={reload} />
                    </details>
                )}
            </section>

            <section className="section">
                <div className="section-head">
                    <h2>Mina önskelistor</h2>
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
                {activeAdminLists.length === 0 ? (
                    <Empty>Du har inga aktuella önskelistor.</Empty>
                ) : (
                    <div className="cards">
                        {activeAdminLists.map((list) => (
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
                )}
            </section>
        </div>
    );
}
