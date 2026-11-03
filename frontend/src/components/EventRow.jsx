// The rows on the overview and the gifts page: one event (a list, a wish profile, or gifts without
// a list) with its details on the left in a contrasting colour, and my gifts for it on the right.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { ErrorMessage } from "./Feedback.jsx";
import Modal from "./Modal.jsx";
import PersonLink from "./PersonLink.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";
import { formatDate, formatPrice, relativeDays } from "../format.js";

export const sumShares = (rows) => rows.reduce((sum, g) => sum + Math.round((g.myShare ?? 0) * 100), 0) / 100;

// One event per wish list, with my gifts for it. `lists` are the public, coming lists in my groups
// (mine and others') – they're shown even when I haven't bought anything yet. Gifts for a list that
// isn't among them, gifts from someone's wish profile (one event per person, without a date), and
// gifts without a list (grouped by recipient and date) get an event of their own.
export function buildEvents(lists, gifts, { newestFirst = false } = {}) {
    const events = new Map();
    for (const list of lists) {
        events.set(`list:${list.id}`, {
            key: `list:${list.id}`,
            listId: list.id,
            title: list.title,
            endDate: list.endDate,
            recipients: list.recipients,
            isRecipient: list.isRecipient,
            isAdmin: list.isAdmin,
            // Lists TO me can only be opened by their admins
            canOpen: !list.isRecipient || list.isAdmin,
            gifts: [],
        });
    }
    for (const g of gifts) {
        const key = g.listId ? `list:${g.listId}` : g.personId ? `person:${g.personId}` : `off:${g.recipients}|${g.endDate}`;
        if (!events.has(key)) {
            events.set(key, {
                key,
                listId: g.listId,
                personId: g.listId ? null : g.personId,
                title: g.listTitle,
                endDate: g.endDate,
                recipients: g.recipients,
                isRecipient: false,
                isAdmin: false,
                canOpen: Boolean(g.listId),
                gifts: [],
            });
        }
        events.get(key).gifts.push(g);
    }
    const order = newestFirst ? -1 : 1;
    return [...events.values()].sort((a, b) => order * (dateOrder(a.endDate) - dateOrder(b.endDate)));
}

// For sorting: events without a date (gifts from a wish profile) last
export const dateOrder = (iso) => (iso ? new Date(iso).getTime() : Infinity);

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
                            <th className="num col-optional">Antal</th>
                            <th className="num col-optional">Pris</th>
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
                                <td className="num col-optional">{g.quantity}</td>
                                <td className="num col-optional">{g.price === null ? "–" : formatPrice(g.price)}</td>
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
                            {/* Separate cells, so the row still lines up when Antal and Pris are hidden on mobile */}
                            <td>Min del för kalaset</td>
                            <td className="col-optional" />
                            <td className="col-optional" />
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

// One event: the list's details on the left (in a contrasting colour), my gifts for it on the right
export function EventRow({ event, archived = false, onChanged }) {
    const { listId, personId, title, endDate, recipients, isRecipient, isAdmin, canOpen, gifts } = event;
    const variant = archived ? " event-archived" : isRecipient ? " event-to-me" : !listId ? " event-no-list" : "";
    const kicker = listId ? "Önskelista" : personId ? "Önskeprofil" : "Gåva utanför lista";

    return (
        <article className={`event${variant}`}>
            <div className="event-info">
                {/* My list: edit it straight from here */}
                {listId && isAdmin && !archived && (
                    <Link
                        to={`/lists/${listId}/edit`}
                        className="event-edit"
                        aria-label={`Redigera ${title}`}
                        title="Redigera listan"
                    >
                        <Pencil size={16} aria-hidden="true" />
                    </Link>
                )}
                <p className="event-kicker">{kicker}</p>
                <h3>{listId ? title : `Till ${recipients}`}</h3>
                {endDate && (
                    <p className="event-date">
                        <CalendarDays size={16} aria-hidden="true" /> {formatDate(endDate)}
                    </p>
                )}
                {endDate && !archived && <p className="event-when">{relativeDays(endDate)}</p>}
                {listId && recipients && <p className="event-recipients">Till {isRecipient ? "dig" : recipients}</p>}
                {listId && canOpen && (
                    <Link to={`/lists/${listId}`} className="btn btn-small event-link">
                        Se önskelistan <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                )}
                {personId && (
                    <span className="event-link-wrap">
                        <PersonLink person={{ id: personId, name: recipients }}>
                            Se önskeprofilen <ArrowRight size={16} aria-hidden="true" />
                        </PersonLink>
                    </span>
                )}
            </div>

            <div className="event-gifts">
                {isRecipient ? (
                    <p className="event-note">
                        🎁 Listan är till dig, så vad andra har köpt är en överraskning.
                    </p>
                ) : gifts.length > 0 ? (
                    <>
                        <div className="event-gifts-head">
                            <h4>
                                Mina inköp <span className="muted small">({gifts.length})</span>
                            </h4>
                            {listId && !archived && (
                                <Link to={`/gifts/new?list=${listId}`} className="btn btn-small btn-ghost">
                                    <Plus size={16} aria-hidden="true" /> Gåva utanför listan
                                </Link>
                            )}
                        </div>
                        <GiftTable rows={gifts} onChanged={onChanged} />
                    </>
                ) : (
                    <div className="event-empty">
                        <p>Du har inte köpt något till det här än.</p>
                        <Link to={`/gifts/new?list=${listId}`} className="btn btn-small btn-ghost">
                            <Plus size={16} aria-hidden="true" /> Gåva utanför listan
                        </Link>
                    </div>
                )}
            </div>
        </article>
    );
}
