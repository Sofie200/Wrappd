import { useState } from "react";
import Modal from "./Modal.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";

// "+ Överraskningsgåva" (a gift bought outside the wish list): opens the gift form in a modal, already linked to the list or the
// Secret Santa it was pressed on. children is the button's content; onAdded runs after saving.
// presetEvent: { name, recipientId, date } – a new gift for an own event that already exists
export default function AddGiftButton({
    listId = "",
    santaId = "",
    presetEvent = null,
    title = "Ny överraskningsgåva",
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
                <Modal title={title} onClose={() => setOpen(false)}>
                    <GiftEditor
                        id="new"
                        presetListId={String(listId)}
                        presetSantaId={String(santaId)}
                        presetEvent={presetEvent}
                        onDone={() => {
                            setOpen(false);
                            onAdded?.();
                        }}
                    />
                </Modal>
            )}
        </>
    );
}
