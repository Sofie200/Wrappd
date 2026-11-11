import { useState } from "react";
import Modal from "./Modal.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";

// "+ Överraskning" (a gift bought outside the wish list): opens the gift form in a modal, already linked to the list or the
// Secret Santa it was pressed on. children is the button's content; onAdded runs after saving.
// presetEvent: { name, recipientId, date } – a new gift for an own event that already exists
export default function AddGiftButton({
    listId = "",
    santaId = "",
    presetEvent = null,
    title = "Ny överraskning",
    className = "btn btn-small",
    onAdded,
    children,
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
                {children}
            </button>
            {open && (
                <AddGiftModal
                    listId={listId}
                    santaId={santaId}
                    presetEvent={presetEvent}
                    title={title}
                    onClose={() => setOpen(false)}
                    onAdded={onAdded}
                />
            )}
        </>
    );
}

// The gift form in a modal, on its own – for when something other than a plain button opens it
// (e.g. the "Logga gåva" card on the gifts page). Mount it to open it; onClose closes it.
export function AddGiftModal({ listId = "", santaId = "", presetEvent = null, title = "Ny överraskning", onClose, onAdded }) {
    return (
        <Modal title={title} onClose={onClose}>
            <GiftEditor
                id="new"
                presetListId={String(listId)}
                presetSantaId={String(santaId)}
                presetEvent={presetEvent}
                onDone={() => {
                    onClose();
                    onAdded?.();
                }}
            />
        </Modal>
    );
}
