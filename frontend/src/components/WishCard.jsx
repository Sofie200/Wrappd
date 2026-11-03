import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { formatPrice, joinNames } from "../format.js";
import Avatar from "./Avatar.jsx";
import { ErrorMessage } from "./Feedback.jsx";
import Modal from "./Modal.jsx";
import WishForm from "./WishForm.jsx";
import { ArrowUpRight } from "lucide-react";

// One wish: a compact row (image, title, price, reserved badge) that opens the full wish in a modal.
// What the modal shows depends on `me` from the server:
//  - seesReservations: who has reserved it, per gift (never for recipients)
//  - canReserve: reserve (creates a gift), or go to my gift
//  - canEdit: edit and delete (list admins, not archived) – not once someone has reserved it
export default function WishCard({ wish, me, listId, onChanged }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [qty, setQty] = useState(1);

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

    // Reserving creates a gift – then straight to it, to add a price, comment or people to share with
    // quantity: from the row it's always 1, from the modal what's chosen there
    async function reserve(quantity = qty) {
        setBusy(true);
        setError(null);
        try {
            const { id } = await api(`/wishes/${wish.id}/gifts`, { method: "POST", body: { quantity: Number(quantity) } });
            navigate(`/gifts/${id}`);
        } catch (err) {
            setError(err.message);
            setBusy(false);
            setOpen(true); // show the error in the wish (also when reserving straight from the row)
            onChanged();
        }
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
            <div className={`${className} wish-image-empty`} aria-hidden="true">
                🎁
            </div>
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
                    {full ? "Reserverad" : `Reserverad ${reserved}/${wish.quantity}`}
                </span>
                {reservers.length > 0 && (
                    <span className="avatar-stack" title={joinNames(reservers.map((p) => p.name))}>
                        {reservers.map((p) => (
                            <Avatar key={p.id} icon={p.avatarIcon} color={p.avatarColor} size={22} />
                        ))}
                        <span className="visually-hidden">av {joinNames(reservers.map((p) => p.name))}</span>
                    </span>
                )}
            </span>
        ) : null;

    // "Reservera" straight on the row: when I can reserve, haven't already, and there's some left (1 st –
    // the quantity can be changed on the gift afterwards)
    const quickReserve = me.canReserve && !wish.myGiftId && available > 0;

    return (
        <>
            <div className={`wish-row${quickReserve ? " has-quick" : ""}`}>
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
                        {busy ? "Reserverar…" : "Reservera"}
                    </button>
                )}
            </div>

            {open && (
                <Modal title={wish.title} onClose={close}>
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
                        <div className="wish-detail">
                            {image("wish-detail-image")}

                            <div className="wish-detail-top">
                                {wish.price !== null && <span className="price">{formatPrice(wish.price)}</span>}
                                {reservedBadge}
                            </div>

                            {wish.description && <p className="wish-description">{wish.description}</p>}

                            {wish.url && (
                                <a href={wish.url} target="_blank" rel="noopener noreferrer" className="wish-link">
                                    Se produkten <ArrowUpRight size={16} aria-hidden="true" />
                                </a>
                            )}

                            <p className="muted small">
                                Önskat antal: {wish.quantity}
                                {me.seesReservations && ` · Reserverat: ${reserved} av ${wish.quantity}`}
                            </p>

                            {/* Who shares each gift – not the price, the split or who reserved first */}
                            {me.seesReservations &&
                                wish.gifts.map((gift, i) => (
                                    <p key={i} className="small">
                                        Reserverad av {joinNames(gift.names)}
                                        {wish.quantity > 1 && ` (${gift.quantity} st)`}
                                    </p>
                                ))}

                            <ErrorMessage message={error} />

                            {me.canReserve && (
                                <div className="wish-actions">
                                    {wish.myGiftId ? (
                                        <Link to={`/gifts/${wish.myGiftId}`} className="btn btn-small">
                                            Hantera gåva
                                        </Link>
                                    ) : available > 0 ? (
                                        <>
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
                                                Reservera
                                            </button>
                                        </>
                                    ) : (
                                        <span className="badge">Fullt reserverad</span>
                                    )}
                                </div>
                            )}

                            {wish.myGiftId && <p className="small reserved-by-me">✓ Du är med i en gåva ({wish.myQuantity} st)</p>}

                            {me.canEdit && (
                                <div className="wish-admin">
                                    <button
                                        type="button"
                                        className="btn btn-small btn-ghost"
                                        onClick={() => setEditing(true)}
                                        disabled={busy || locked}
                                        title={locked ? "Önskningen är reserverad och kan inte ändras" : undefined}
                                    >
                                        Redigera
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-small btn-danger-ghost"
                                        onClick={remove}
                                        disabled={busy || locked}
                                        title={locked ? "Önskningen är reserverad och kan inte tas bort" : undefined}
                                    >
                                        Ta bort
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </Modal>
            )}
        </>
    );
}
