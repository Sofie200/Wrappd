import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { formatPrice, joinNames } from "../format.js";
import { ErrorMessage } from "./Feedback.jsx";
import WishForm from "./WishForm.jsx";

// One wish. What it shows depends on `me` from the server:
//  - seesReservations: who has reserved it, per gift (never for recipients)
//  - canReserve: reserve (creates a gift), or go to my gift
//  - canEdit: edit and delete (list admins, not archived) – not once someone has reserved it
export default function WishCard({ wish, me, listId, onChanged }) {
    const navigate = useNavigate();
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
    async function reserve() {
        setBusy(true);
        setError(null);
        try {
            const { id } = await api(`/wishes/${wish.id}/gifts`, { method: "POST", body: { quantity: Number(qty) } });
            navigate(`/gifts/${id}`);
        } catch (err) {
            setError(err.message);
            setBusy(false);
            onChanged();
        }
    }

    function remove() {
        if (!window.confirm(`Ta bort "${wish.title}"?`)) return;
        run(() => api(`/wishes/${wish.id}`, { method: "DELETE" }));
    }

    if (editing) {
        return (
            <article className="wish wish-editing">
                <WishForm
                    listId={listId}
                    wish={wish}
                    onSaved={() => {
                        setEditing(false);
                        onChanged();
                    }}
                    onCancel={() => setEditing(false)}
                />
            </article>
        );
    }

    const reserved = wish.reserved ?? 0;
    const available = wish.quantity - reserved;
    const full = me.seesReservations && available <= 0;
    const options = Array.from({ length: Math.max(available, 0) }, (_, i) => i + 1);
    // Recipients don't know if it's reserved – the server answers them if they try
    const locked = me.seesReservations && reserved > 0;

    return (
        <article className={`wish${full ? " wish-full" : ""}`}>
            {wish.imageUrl ? (
                <img className="wish-image" src={wish.imageUrl} alt={wish.title} loading="lazy" />
            ) : (
                <div className="wish-image wish-image-empty" aria-hidden="true">
                    🎁
                </div>
            )}

            <div className="wish-body">
                <div className="card-top">
                    <h3>{wish.title}</h3>
                    {wish.price !== null && <span className="price">{formatPrice(wish.price)}</span>}
                </div>

                {wish.description && <p className="wish-description">{wish.description}</p>}

                {wish.url && (
                    <a href={wish.url} target="_blank" rel="noopener noreferrer" className="wish-link">
                        Se produkten ↗
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
                                <button type="button" className="btn btn-small btn-primary" onClick={reserve} disabled={busy}>
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
        </article>
    );
}
