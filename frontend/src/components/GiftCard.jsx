import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleMinus, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { formatPrice, joinNames } from "../format.js";
import Avatar from "./Avatar.jsx";
import Modal from "./Modal.jsx";
import SettingsMenu from "./SettingsMenu.jsx";
import { ErrorMessage } from "./Feedback.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";

// One of my gifts as a card on the gifts page: picture, title (opens the gift), quantity and price,
// my share, and who shares it. "…" to edit, or release / delete – the same rules as in GiftTable.
export default function GiftCard({ gift: g, onChanged }) {
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const shared = g.people?.length > 1;

    async function remove() {
        const question = g.offList
            ? `Ta bort "${g.title}"? Gåvan tas bort för alla som delar på den.`
            : `Släpp reservationen av "${g.title}"? Gåvan tas bort för alla som delar på den.`;
        if (!window.confirm(question)) return;
        setBusy(true);
        setError(null);
        try {
            await api(`/gifts/${g.id}`, { method: "DELETE" });
            onChanged();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <article className={`gift-card${g.archived ? " is-archived" : ""}`}>
            <img
                className={`gift-card-image${g.imageUrl ? "" : " is-empty"}`}
                src={g.imageUrl ?? "/gift-placeholder.png"}
                alt=""
                loading="lazy"
            />
            {/* On the picture's top-left corner (the "…" menu has the top-right) */}
            {g.offList && g.listId && <span className="badge gift-card-badge">Överraskning</span>}

            <div className="gift-card-body">
                <h4 className="gift-card-title">
                    {/* state.from: the gift page's "back" link then leads back here */}
                    <Link to={`/gifts/${g.id}`} state={{ from: "gifts" }}>
                        {g.title}
                    </Link>
                </h4>

                <p className="gift-card-meta">
                    {g.quantity > 1 && <span>{g.quantity} st</span>}
                    <span>{g.price === null ? "Inget pris" : formatPrice(g.price)}</span>
                </p>

                <div className="gift-card-foot">
                    <p className="gift-card-share">
                        <span className="muted small">Min utgift</span>
                        <strong>{g.myShare === null ? "–" : formatPrice(g.myShare)}</strong>
                    </p>
                    {shared && (
                        <span className="avatar-stack" title={`Delas av ${joinNames(g.people.map((p) => p.name))}`}>
                            {g.people.map((p) => (
                                <Avatar key={p.id} icon={p.avatarIcon} color={p.avatarColor} size={24} />
                            ))}
                            <span className="visually-hidden">Delas av {joinNames(g.people.map((p) => p.name))}</span>
                        </span>
                    )}
                </div>
                <ErrorMessage message={error} />
            </div>

            <div className="gift-card-menu">
                <SettingsMenu label={`Alternativ för ${g.title}`} icon={Ellipsis} buttonClassName="gift-card-menu-btn">
                    <button type="button" className="menu-item" role="menuitem" onClick={() => setEditing(true)}>
                        <Pencil size={16} aria-hidden="true" /> Redigera
                    </button>
                    {/* A reservation can't be undone after the event – a gift outside the list always can */}
                    {(g.offList || !g.archived) && (
                        <button
                            type="button"
                            className="menu-item menu-item-danger"
                            role="menuitem"
                            onClick={remove}
                            disabled={busy}
                        >
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
            </div>

            {editing && (
                <Modal title={g.title} onClose={() => setEditing(false)}>
                    <GiftEditor
                        id={g.id}
                        onDone={() => {
                            setEditing(false);
                            onChanged();
                        }}
                    />
                </Modal>
            )}
        </article>
    );
}
