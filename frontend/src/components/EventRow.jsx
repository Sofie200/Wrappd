// The rows on the overview and the gifts page: one event (a list, a Secret Santa, a wish profile, or gifts
// without a list) with its details on the left in a contrasting colour, and my gifts for it on the right.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, CircleMinus, Ellipsis, Gift, HatGlasses, Pencil, ScrollText, Sparkles, Table2, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { ErrorMessage } from "./Feedback.jsx";
import Modal from "./Modal.jsx";
import PersonLink from "./PersonLink.jsx";
import SettingsMenu from "./SettingsMenu.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";
import { formatPrice, joinNames } from "../format.js";
import Avatar from "./Avatar.jsx";
import DateBadge, { EventDate } from "./DateBadge.jsx";
import AddGiftButton from "./AddGiftButton.jsx";
import GiftPlusIcon from "./GiftPlusIcon.jsx";

export const sumShares = (rows) => rows.reduce((sum, g) => sum + Math.round((g.myShare ?? 0) * 100), 0) / 100;
// The gifts' total prices added up (null when none of them has a price)
const sumPrices = (rows) =>
    rows.some((g) => g.price !== null)
        ? rows.reduce((sum, g) => sum + Math.round((Number(g.price) || 0) * 100), 0) / 100
        : null;

// One event per wish list, with my gifts for it. `lists` are the public, coming lists in my groups
// (mine and others') – they're shown even when I haven't bought anything yet. Gifts for a list that
// isn't among them, gifts for a Secret Santa (one event per draw), gifts from someone's wish profile
// (one event per person, without a date), and gifts without a list (grouped by recipient and date)
// get an event of their own.
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
            wishCount: list.wishCount,
            reservedCount: list.reservedCount, // null on lists to me
            // Lists TO me can only be opened by their admins
            canOpen: !list.isRecipient || list.isAdmin,
            gifts: [],
        });
    }
    for (const g of gifts) {
        const key = g.listId
            ? `list:${g.listId}`
            : g.santaId
              ? `santa:${g.santaId}`
              : g.personId
                ? `person:${g.personId}`
                : `off:${g.eventName}|${g.recipients ?? ""}|${g.endDate}`; // an own event: name, person and date
        if (!events.has(key)) {
            events.set(key, {
                key,
                listId: g.listId,
                santaId: g.listId ? null : g.santaId,
                personId: g.listId || g.santaId ? null : g.personId,
                title: g.listTitle ?? g.santaTitle ?? g.eventName,
                // An own event: its name and linked person – so more gifts can be added to it
                eventName: g.eventName,
                recipientId: g.recipientId,
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
// Edit and delete as icons at the end of each row. Also used on the Secret Santa card.
export function GiftTable({ rows, onChanged, totalLabel = "Totalt" }) {
    const [editing, setEditing] = useState(null); // the gift being edited in the modal
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState(null);

    async function remove(g) {
        const question = g.offList
            ? `Ta bort "${g.title}"? Gåvan tas bort för alla som delar på den.`
            : `Släpp reservationen av "${g.title}"? Gåvan tas bort för alla som delar på den.`;
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
                                    {g.offList && g.listId && <span className="muted small"> · överraskningsgåva</span>}
                                    {/* Shared: everyone's avatars next to the name, like on a reservation */}
                                    {g.people?.length > 1 && (
                                        <span className="avatar-stack gift-people" title={`Delas av ${joinNames(g.people.map((p) => p.name))}`}>
                                            {g.people.map((p) => (
                                                <Avatar key={p.id} icon={p.avatarIcon} color={p.avatarColor} size={22} />
                                            ))}
                                            <span className="visually-hidden">Delas av {joinNames(g.people.map((p) => p.name))}</span>
                                        </span>
                                    )}
                                </td>
                                <td className="num col-optional">{g.quantity}</td>
                                <td className="num col-optional">{g.price === null ? "–" : formatPrice(g.price)}</td>
                                <td className="num share">{g.myShare === null ? "–" : formatPrice(g.myShare)}</td>
                                <td className="row-actions">
                                    <SettingsMenu label={`Alternativ för ${g.title}`} icon={Ellipsis}>
                                        <button type="button" className="menu-item" role="menuitem" onClick={() => setEditing(g)}>
                                            <Pencil size={16} aria-hidden="true" /> Redigera
                                        </button>
                                        {/* A reservation can't be undone after the event – a gift outside the list always can */}
                                        {(g.offList || !g.archived) && (
                                            <button
                                                type="button"
                                                className="menu-item menu-item-danger"
                                                role="menuitem"
                                                onClick={() => remove(g)}
                                                disabled={busyId === g.id}
                                            >
                                                {/* An own gift is deleted; a reservation is released – like on the list */}
                                                {g.offList ? (
                                                    <>
                                                        <Trash2 size={16} aria-hidden="true" /> Ta bort
                                                    </>
                                                ) : (
                                                    <>
                                                        <CircleMinus size={16} aria-hidden="true" /> Släpp reservation
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </SettingsMenu>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            {/* Separate cells, so the row still lines up when Antal and Pris are hidden on mobile */}
                            <td>{totalLabel}</td>
                            <td className="col-optional" />
                            <td className="num col-optional">{sumPrices(rows) === null ? "–" : formatPrice(sumPrices(rows))}</td>
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

// "Mina inköp" on a card. On phones it starts folded away behind a bar with a down arrow and
// rolls out when tapped; on wider screens the bar is hidden and the section always shows
// (the wrappers are display: contents there).
export function GiftsCollapse({ count = null, children }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                className={`event-gifts-toggle${open ? " is-open" : ""}`}
                aria-expanded={open}
                onClick={() => setOpen(!open)}
            >
                <span>
                    Mina inköp {count !== null && <span className="muted small">({count})</span>}
                </span>
                <ChevronDown size={18} aria-hidden="true" />
            </button>
            <div className={`event-gifts-collapse${open ? " is-open" : ""}`}>
                <div className="event-gifts-collapse-inner">{children}</div>
            </div>
        </>
    );
}

// One event: the list's details on the left (in a contrasting colour), my gifts for it on the right
export function EventRow({ event, archived = false, onChanged }) {
    const { listId, santaId, personId, title, endDate, recipients, isRecipient, canOpen, gifts, wishCount, reservedCount } =
        event;
    const { eventName, recipientId } = event;
    // The kind of event decides the colour; past events keep it, toned down (event-archived)
    const kind = isRecipient ? " event-to-me" : santaId ? " event-santa" : !listId ? " event-no-list" : "";
    const variant = kind + (archived ? " event-archived" : "");
    const kicker = listId ? "Önskelista" : santaId ? "Secret Santa" : personId ? "Önskeprofil" : "Egen lista";
    const KickerIcon = listId ? ScrollText : santaId ? HatGlasses : personId ? null : Table2;

    return (
        <div className={`event-group${variant}`}>
            {/* Who it's for, as a label above the card – a list's recipients, or the person linked to an own event */}
            {(listId || (!santaId && !personId)) && recipients && (
                <p className="event-to">
                    Till: <span className="event-for">{recipients}</span>
                </p>
            )}
            <article className={`event${variant}`}>
                <div className="event-info">
                    <div className="event-head">
                        {endDate && <DateBadge iso={endDate} />}
                        <div className="event-title">
                            <p className="event-kicker">
                                {KickerIcon && <KickerIcon size={14} aria-hidden="true" />} {kicker}
                            </p>
                            <h3>{title ?? `Till ${recipients}`}</h3>
                            {endDate && <EventDate iso={endDate} />}
                        </div>
                    </div>
                    {wishCount !== undefined && (
                        <p className="event-stats">
                            <span>
                                <Sparkles size={14} aria-hidden="true" /> {wishCount} {wishCount === 1 ? "önskning" : "önskningar"}
                            </span>
                            {reservedCount !== null && (
                                <span>
                                    <Gift size={14} aria-hidden="true" /> {reservedCount} reserverade
                                </span>
                            )}
                        </p>
                    )}
                    {/* Bottom row: the button, on the right */}
                    {listId && canOpen && (
                        <div className="event-foot">
                            <Link to={`/lists/${listId}`} className="btn btn-small event-link">
                                Se lista <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        </div>
                    )}
                    {personId && (
                        <span className="event-link-wrap">
                            <PersonLink person={{ id: personId, name: recipients }}>
                                Se önskeprofilen <ArrowRight size={16} aria-hidden="true" />
                            </PersonLink>
                        </span>
                    )}
                </div>

                <GiftsCollapse count={isRecipient ? null : gifts.length}>
                <div className="event-gifts">
                    {isRecipient ? (
                        <p className="event-note">
                            🎁 Listan är till dig, så vad andra har köpt är en överraskning.
                        </p>
                    ) : (
                        <>
                            {/* Always the same head: "Mina inköp" on the left, the button on the right */}
                            <div className="event-gifts-head">
                                <h4>
                                    Mina inköp {gifts.length > 0 && <span className="muted small">({gifts.length})</span>}
                                </h4>
                                {listId && !archived && (
                                    <AddGiftButton listId={listId} className="btn btn-small btn-ghost" onAdded={onChanged}>
                                        <GiftPlusIcon /> Överraskningsgåva
                                    </AddGiftButton>
                                )}
                                {/* An own event: another gift for the same event (name, person and date filled in) */}
                                {!listId && !santaId && !personId && eventName && !archived && (
                                    <AddGiftButton
                                        presetEvent={{ name: eventName, recipientId, recipientName: recipients, date: endDate }}
                                        title="Logga en gåva"
                                        className="btn btn-small btn-ghost"
                                        onAdded={onChanged}
                                    >
                                        <GiftPlusIcon /> Ytterligare gåva
                                    </AddGiftButton>
                                )}
                                {santaId && !archived && (
                                    <AddGiftButton santaId={santaId} className="btn btn-small btn-ghost" onAdded={onChanged}>
                                        <GiftPlusIcon /> Överraskningsgåva
                                    </AddGiftButton>
                                )}
                            </div>
                            {gifts.length > 0 ? (
                                <GiftTable rows={gifts} onChanged={onChanged} />
                            ) : (
                                <div className="event-empty">
                                    <p>
                                        Du har inte registrerat några köp än 🙁
                                        {listId && !archived && (
                                            <>
                                                <br />
                                                Reservera något från{" "}
                                                {canOpen ? (
                                                    <Link to={`/lists/${listId}`} className="text-link">
                                                        listan
                                                    </Link>
                                                ) : (
                                                    "listan"
                                                )}{" "}
                                                eller lägg till en{" "}
                                                <AddGiftButton listId={listId} className="text-link" onAdded={onChanged}>
                                                    överraskningsgåva
                                                </AddGiftButton>
                                                .
                                            </>
                                        )}
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
                </GiftsCollapse>
            </article>
        </div>
    );
}
