import { useState } from "react";
import { Link } from "react-router-dom";
import { ScrollText, Sparkles } from "lucide-react";
import SettingsMenu from "./SettingsMenu.jsx";
import GiftPlusIcon from "./GiftPlusIcon.jsx";
import { AddGiftModal } from "./AddGiftButton.jsx";

// The last card in an event's row on the gifts page: an empty card saying "Logga gåva".
//  - A wish list: a menu – "Från önskelistan" (opens the list to reserve a wish) or "Överraskningsgåva".
//  - A Secret Santa: straight to a surprise gift. An own event: straight to another gift for it.
//  - Wish profiles and past events: no card (returns null).
export default function AddGiftCard({ event, archived = false, onChanged }) {
    const [adding, setAdding] = useState(false);
    const { listId, santaId, personId, eventName, recipientId, recipients, endDate, canOpen } = event;
    if (archived || personId) return null;
    if (!listId && !santaId && !eventName) return null;

    const face = (
        <>
            <span className="gift-add-icon">
                <GiftPlusIcon size={24} />
            </span>
            <span className="gift-add-text">Logga gåva</span>
        </>
    );

    const modal = adding && (
        <AddGiftModal
            listId={listId ?? ""}
            santaId={santaId ?? ""}
            presetEvent={!listId && !santaId ? { name: eventName, recipientId, recipientName: recipients, date: endDate } : null}
            title={listId || santaId ? "Ny överraskningsgåva" : "Logga en gåva"}
            onClose={() => setAdding(false)}
            onAdded={onChanged}
        />
    );

    // Only one way to add: the card opens the form directly
    if (!listId || !canOpen) {
        return (
            <>
                <button type="button" className="gift-add-card" onClick={() => setAdding(true)} aria-haspopup="dialog">
                    {face}
                </button>
                {modal}
            </>
        );
    }

    return (
        <>
            <div className="gift-add-wrap">
                <SettingsMenu label="Logga gåva" title="Logga gåva" trigger={face} buttonClassName="gift-add-card" atPointer>
                    <Link to={`/lists/${listId}`} className="menu-item" role="menuitem">
                        <ScrollText size={16} aria-hidden="true" /> Från önskelistan
                    </Link>
                    <button type="button" className="menu-item" role="menuitem" onClick={() => setAdding(true)}>
                        <Sparkles size={16} aria-hidden="true" /> Överraskningsgåva
                    </button>
                </SettingsMenu>
            </div>
            {modal}
        </>
    );
}
