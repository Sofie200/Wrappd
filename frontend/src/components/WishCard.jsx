import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatPrice } from "../format.js";
import { ErrorMessage } from "./Feedback.jsx";
import WishForm from "./WishForm.jsx";

// One wish. What it shows depends on `me` from the server:
//  - seesReservations: who has reserved what (never for recipients)
//  - canReserve: reserve / change / undo my own reservation
//  - canEdit: edit and delete (list admins, not archived)
export default function WishCard({ wish, me, listId, onChanged }) {
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [qty, setQty] = useState(wish.myQuantity || 1);

    // After a reload: show my current number
    useEffect(() => setQty(wish.myQuantity || 1), [wish.myQuantity]);

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

    const reserve = () =>
        run(() => api(`/wishes/${wish.id}/reservation`, { method: "PUT", body: { quantity: Number(qty) } }));
    const unreserve = () => run(() => api(`/wishes/${wish.id}/reservation`, { method: "DELETE" }));

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
    const mine = wish.myQuantity ?? 0;
    const full = me.seesReservations && reserved >= wish.quantity;
    // The most I can hold: what's left, plus what I already have
    const maxForMe = wish.quantity - reserved + mine;
    const options = Array.from({ length: Math.max(maxForMe, 0) }, (_, i) => i + 1);

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
                    {wish.quantity > 1 ? `Önskat antal: ${wish.quantity}` : "Önskat antal: 1"}
                    {me.seesReservations && ` · Reserverat: ${reserved} av ${wish.quantity}`}
                </p>

                {me.seesReservations && wish.reservations.length > 0 && (
                    <p className="small">
                        Reserverad av:{" "}
                        {wish.reservations.map((r) => `${r.name}${wish.quantity > 1 ? ` (${r.quantity})` : ""}`).join(", ")}
                    </p>
                )}

                <ErrorMessage message={error} />

                {me.canReserve && (
                    <div className="wish-actions">
                        {mine > 0 ? (
                            <>
                                {maxForMe > 1 && (
                                    <select value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Antal" disabled={busy}>
                                        {options.map((n) => (
                                            <option key={n} value={n}>
                                                {n} st
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {maxForMe > 1 && Number(qty) !== mine && (
                                    <button type="button" className="btn btn-small" onClick={reserve} disabled={busy}>
                                        Ändra
                                    </button>
                                )}
                                <button type="button" className="btn btn-small btn-ghost" onClick={unreserve} disabled={busy}>
                                    Ångra reservation
                                </button>
                            </>
                        ) : maxForMe > 0 ? (
                            <>
                                {maxForMe > 1 && (
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

                {mine > 0 && <p className="small reserved-by-me">✓ Du har reserverat {mine} st</p>}

                {me.canEdit && (
                    <div className="wish-admin">
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(true)} disabled={busy}>
                            Redigera
                        </button>
                        <button type="button" className="btn btn-small btn-danger-ghost" onClick={remove} disabled={busy}>
                            Ta bort
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
}
