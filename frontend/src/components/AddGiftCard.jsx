import { useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { Heart, ScrollText, Sparkles } from "lucide-react";
import PersonModal from "./PersonModal.jsx";
import SettingsMenu from "./SettingsMenu.jsx";
import GiftPlusIcon from "./GiftPlusIcon.jsx";
import { AddGiftModal } from "./AddGiftButton.jsx";

// The last card in an event's row on the gifts page: an empty card saying "Logga gåva".
//  - A wish list: a menu - "Från önskelistan" (opens the list to reserve a wish) or "Överraskning".
//  - A Secret Santa: a menu - "Från önskeprofilen" (the wish profile of the one I give to - reserving there
//    counts for the Secret Santa) or "Egen gåva". An own event: straight to another gift for it.
//  - Wish profiles and past events: no card (returns null).
export default function AddGiftCard({ event, archived = false, onChanged }) {
    const [adding, setAdding] = useState(false);
    const [showingProfile, setShowingProfile] = useState(false);
    const { listId, santaId, santaReceiverId, personId, eventId, eventName, recipientId, recipients, endDate, canOpen } = event;
    if (archived || personId) return null;
    if (!listId && !santaId && !eventId) return null;

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
            presetEvent={eventId ? { eventId, name: eventName, recipientId, recipientName: recipients, date: endDate } : null}
            title={listId || santaId ? "Ny överraskning" : "Logga en gåva"}
            onClose={() => setAdding(false)}
            onAdded={onChanged}
        />
    );

    // A Secret Santa where I know who I give to: their wish profile, or an own gift
    if (santaId && santaReceiverId) {
        return (
            <>
                <div className="gift-add-wrap">
                    <SettingsMenu label="Logga gåva" title="Logga gåva" trigger={face} buttonClassName="gift-add-card" atPointer>
                        <button type="button" className="menu-item" role="menuitem" onClick={() => setShowingProfile(true)}>
                            <Heart size={16} aria-hidden="true" /> Från önskeprofilen
                        </button>
                        <button type="button" className="menu-item" role="menuitem" onClick={() => setAdding(true)}>
                            <Sparkles size={16} aria-hidden="true" /> Egen gåva
                        </button>
                    </SettingsMenu>
                </div>
                {modal}
                {showingProfile &&
                    createPortal(
                        <PersonModal
                            personId={santaReceiverId}
                            santa={{ id: santaId, title: eventName ?? event.title, date: endDate }}
                            onClose={() => setShowingProfile(false)}
                            onReserved={onChanged}
                        />,
                        document.body
                    )}
            </>
        );
    }

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
                        <Sparkles size={16} aria-hidden="true" /> Överraskning
                    </button>
                </SettingsMenu>
            </div>
            {modal}
        </>
    );
}
