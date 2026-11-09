import { useState } from "react";
import { api } from "../api.js";
import { formatPrice, joinNames } from "../format.js";
import { useAuth } from "../context/AuthContext.jsx";
import Avatar from "./Avatar.jsx";
import { ErrorMessage } from "./Feedback.jsx";
import Modal from "./Modal.jsx";
import WishForm from "./WishForm.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";
import { ArrowUpRight, CircleMinus, CirclePlus, Ellipsis, Pencil, Trash2 } from "lucide-react";
import SettingsMenu from "./SettingsMenu.jsx";

// One wish: a compact row (image, title, price, reserved badge) that opens the full wish in a modal.
// What the modal shows depends on `me` from the server:
//  - seesReservations: who has reserved it, per gift (never for recipients)
//  - canReserve: reserve (creates a gift), or go to my gift
//  - canEdit: edit and delete (list admins, not archived) – not once someone has reserved it
export default function WishCard({ wish, me, listId, onChanged }) {
    const { user } = useAuth();
    // "dig och Ted" – me first, as "dig"
    const whoNames = (people) =>
        joinNames([
            ...people.filter((p) => p.id === user.id).map(() => "dig"),
            ...people.filter((p) => p.id !== user.id).map((p) => p.name),
        ]);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [qty, setQty] = useState(1);
    const [editingGift, setEditingGift] = useState(false); // my reservation, in a modal on top

    async function run(action) {
        setBusy(true);
        setError(null);
        try {
            await action();
            onChanged();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    // Reserving creates a gift – and stays here; the gift can be edited later (Gåvor / the overview)
    // quantity: from the row it's always 1, from the modal what's chosen there
    async function reserve(quantity = qty) {
        setBusy(true);
        setError(null);
        try {
            // The gift is created as a straight copy of the wish – price, comment and sharing can be changed later
            await api(`/wishes/${wish.id}/gifts`, { method: "POST", body: { quantity: Number(quantity) } });
            setBusy(false);
            onChanged();
        } catch (err) {
            setError(err.message);
            setBusy(false);
            setOpen(true); // show the error in the wish (also when reserving straight from the row)
            onChanged();
        }
    }

    // Undo my reservation – the whole gift goes, also for the others who share it
    function unreserve() {
        if (!window.confirm(`Släpp din reservation av "${wish.title}"? Gåvan tas bort för alla som delar på den.`)) return;
        run(() => api(`/gifts/${wish.myGiftId}`, { method: "DELETE" }));
    }

    function remove() {
        if (!window.confirm(`Ta bort "${wish.title}"?`)) return;
        run(() => api(`/wishes/${wish.id}`, { method: "DELETE" }));
    }

    function close() {
        setOpen(false);
        setEditing(false);
        setError(null);
    }

    const reserved = wish.reserved ?? 0;
    const available = wish.quantity - reserved;
    const full = me.seesReservations && available <= 0;
    const options = Array.from({ length: Math.max(available, 0) }, (_, i) => i + 1);
    // Recipients don't know if it's reserved – the server answers them if they try
    const locked = me.seesReservations && reserved > 0;

    const image = (className) =>
        wish.imageUrl ? (
            <img className={className} src={wish.imageUrl} alt="" loading="lazy" />
        ) : (
            // No picture: the app's own illustration of presents
            <img className={`${className} wish-image-empty`} src="/gift-placeholder.png" alt="" />
        );

    // Everyone who has reserved it (in any of its gifts), once each
    const reservers = [];
    for (const gift of wish.gifts ?? []) {
        for (const person of gift.people ?? []) {
            if (!reservers.some((p) => p.id === person.id)) reservers.push(person);
        }
    }

    // Only those who may see reservations get the badge and the icons – recipients never do
    const reservedBadge =
        me.seesReservations && reserved > 0 ? (
            <span className="reserved-by">
                <span className={`badge ${full ? "badge-gift" : "badge-partial"}`}>
                    {/* "av dig" when I'm one of those who share a gift for it */}
                    {(wish.myGiftId ? "Reserverad av dig" : "Reserverad") + (full ? "" : ` ${reserved}/${wish.quantity}`)}
                </span>
                {reservers.length > 0 && (
                    <span className="avatar-stack" title={`Reserverad av ${whoNames(reservers)}`}>
                        {reservers.map((p) => (
                            <Avatar key={p.id} icon={p.avatarIcon} color={p.avatarColor} size={22} />
                        ))}
                        <span className="visually-hidden">av {whoNames(reservers)}</span>
                    </span>
                )}
            </span>
        ) : null;

    // "Reservera" straight on the row: when I can reserve, haven't already, and there's some left (1 st –
    // the quantity can be changed on the gift afterwards)
    const quickReserve = me.canReserve && !wish.myGiftId && available > 0;
    // A "…" menu on the row for my own reservation
    const myMenu = me.canReserve && Boolean(wish.myGiftId);

    return (
        <>
            <div className={`wish-row${quickReserve ? " has-quick" : ""}${myMenu ? " has-menu" : ""}`}>
                <button
                    type="button"
                    className={`wish${full ? " wish-full" : ""}`}
                    onClick={() => setOpen(true)}
                    aria-haspopup="dialog"
                >
                    {image("wish-image")}
                    <span className="wish-summary">
                        <span className="wish-title">{wish.title}</span>
                        {wish.price !== null && (
                            <span className="wish-meta">
                                <span className="price">{formatPrice(wish.price)}</span>
                            </span>
                        )}
                    </span>
                    {/* Reserved and by whom – out on the right */}
                    {reservedBadge && <span className="wish-reserved">{reservedBadge}</span>}
                </button>
                {quickReserve && (
                    <button
                        type="button"
                        className="btn btn-small btn-primary wish-quick-reserve"
                        onClick={() => reserve(1)}
                        disabled={busy}
                        aria-label={`Reservera ${wish.title}`}
                    >
                        <CirclePlus size={16} aria-hidden="true" /> {busy ? "Reserverar…" : "Reservera"}
                    </button>
                )}
                {/* My reservation: "…" right after the badge, to edit or release it */}
                {myMenu && (
                    <div className="wish-row-menu">
                        <SettingsMenu label={`Min reservation av ${wish.title}`} icon={Ellipsis}>
                            <button type="button" className="menu-item" role="menuitem" onClick={() => setEditingGift(true)}>
                                <Pencil size={16} aria-hidden="true" /> Redigera reservation
                            </button>
                            <button type="button" className="menu-item menu-item-danger" role="menuitem" onClick={unreserve} disabled={busy}>
                                <CircleMinus size={16} aria-hidden="true" /> Släpp reservation
                            </button>
                        </SettingsMenu>
                    </div>
                )}
            </div>

            {open && (
                <Modal title={wish.title} hideTitle={!editing} onClose={close}>
                    {/* Viewing: the title sits under the image instead of in the modal's head */}
                    {editing ? (
                        <WishForm
                            listId={listId}
                            wish={wish}
                            onSaved={() => {
                                setEditing(false);
                                onChanged();
                            }}
                            onCancel={() => setEditing(false)}
                        />
                    ) : (
                        <div className={`wish-detail${full ? " is-reserved" : ""}`}>
                            {image("wish-detail-image")}

                            {/* A small bar under the image: the reservation, and "Släpp reservation" when I'm in it */}
                            {(reservedBadge || (me.canReserve && wish.myGiftId)) && (
                                <div className="wish-status-bar">
                                    {reservedBadge}
                                    {me.canReserve && wish.myGiftId && (
                                        <>
                                            <button
                                                type="button"
                                                className="btn btn-small btn-ghost"
                                                onClick={() => setEditingGift(true)}
                                                aria-haspopup="dialog"
                                            >
                                                <Pencil size={16} aria-hidden="true" /> Redigera reservation
                                            </button>
                                            <button type="button" className="btn btn-small btn-danger-ghost" onClick={unreserve} disabled={busy}>
                                                <CircleMinus size={16} aria-hidden="true" /> Släpp reservation
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* The product info, as one block with air above and below */}
                            <div className="wish-detail-info">
                                <h3 className="wish-detail-title" aria-hidden="true">
                                    {wish.title}
                                </h3>

                                {wish.price !== null && (
                                    <div className="wish-detail-top">
                                        <span className="price">{formatPrice(wish.price)}</span>
                                    </div>
                                )}

                                {wish.description && <p className="wish-description">{wish.description}</p>}

                                {wish.url && (
                                    <a href={wish.url} target="_blank" rel="noopener noreferrer" className="wish-link">
                                        Se produkten <ArrowUpRight size={16} aria-hidden="true" />
                                    </a>
                                )}
                            </div>

                            {/* Not needed once everything is reserved – the badge already says so */}
                            {!full && (
                                <p className="muted small">
                                    Önskat antal: {wish.quantity}
                                    {me.seesReservations && ` · Reserverat: ${reserved} av ${wish.quantity}`}
                                </p>
                            )}

                            <ErrorMessage message={error} />

                            {/* Only while there's something left to reserve */}
                            {me.canReserve && !wish.myGiftId && available > 0 && (
                                <div className="wish-actions">
                                    {available > 1 && (
                                        <select value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Antal" disabled={busy}>
                                            {options.map((n) => (
                                                <option key={n} value={n}>
                                                    {n} st
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <button type="button" className="btn btn-small btn-primary" onClick={() => reserve()} disabled={busy}>
                                        <CirclePlus size={16} aria-hidden="true" /> Reservera
                                    </button>
                                </div>
                            )}

                            {me.canEdit && (
                                <div
                                    className={`wish-admin${locked ? " is-locked" : ""}`}
                                    title={locked ? "Önskningen är reserverad och kan inte ändras" : undefined}
                                >
                                    {/* Greyed out as a whole when it can't be changed (someone has reserved it) */}
                                    <span className="wish-admin-label">Hantera önskning:</span>
                                    <button
                                        type="button"
                                        className="btn btn-small btn-ghost"
                                        onClick={() => setEditing(true)}
                                        disabled={busy || locked}
                                        title={locked ? "Önskningen är reserverad och kan inte ändras" : undefined}
                                    >
                                        <Pencil size={16} aria-hidden="true" /> Redigera
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-small btn-danger-ghost"
                                        onClick={remove}
                                        disabled={busy || locked}
                                        title={locked ? "Önskningen är reserverad och kan inte tas bort" : undefined}
                                    >
                                        <Trash2 size={16} aria-hidden="true" /> Ta bort
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </Modal>
            )}

            {/* My reservation (the gift): price, comment, who shares – on top of the wish */}
            {editingGift && wish.myGiftId && (
                <Modal title="Redigera reservation" onClose={() => setEditingGift(false)}>
                    <GiftEditor
                        id={wish.myGiftId}
                        onDone={() => {
                            setEditingGift(false);
                            onChanged();
                        }}
                    />
                </Modal>
            )}
        </>
    );
}
