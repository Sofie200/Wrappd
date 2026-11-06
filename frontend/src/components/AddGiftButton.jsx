import { useState } from "react";
import Modal from "./Modal.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";

// "Lägg till egen gåva": opens the gift form in a modal, already linked to the list or the
// Secret Santa it was pressed on. children is the button's content; onAdded runs after saving.
export default function AddGiftButton({ listId = "", santaId = "", className = "btn btn-small", onAdded, children }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
                {children}
            </button>
            {open && (
                <Modal title="Lägg till egen gåva" onClose={() => setOpen(false)}>
                    <GiftEditor
                        id="new"
                        presetListId={String(listId)}
                        presetSantaId={String(santaId)}
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
