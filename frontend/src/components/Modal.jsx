import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// A modal built on the native <dialog>: focus trap, Esc to close and the backdrop come for free.
// Mount it to open it, unmount it to close it. Clicking the backdrop also closes.
// If something in it has been changed (typed into, picked) and not saved, closing by the backdrop,
// Esc or × asks first. A submitted form counts as saved.
// hideTitle: the title is only for screen readers - the content shows it its own way.
export default function Modal({ title, hideTitle = false, onClose, children }) {
    const ref = useRef(null);
    const titleId = useId();
    const dirty = useRef(false);

    function requestClose() {
        if (dirty.current && !window.confirm("Du har ändringar som inte är sparade. Vill du stänga ändå?")) return;
        onClose();
    }

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog.open) dialog.showModal();
        return () => {
            if (dialog.open) dialog.close();
        };
    }, []);

    return (
        <dialog
            ref={ref}
            className="modal"
            aria-labelledby={titleId}
            // Esc fires "cancel": stop the browser closing it on its own and let React decide.
            // (We don't listen to "close" - in StrictMode the effect's cleanup closes the dialog,
            // and that late close event would shut the modal right after it opened.)
            onCancel={(e) => {
                e.preventDefault();
                requestClose();
            }}
            onClick={(e) => {
                // A click straight on <dialog> (not its content) is a click on the backdrop
                if (e.target === ref.current) requestClose();
            }}
            // Any typing or picking inside marks it as changed; submitting a form clears that
            onInput={() => (dirty.current = true)}
            onChange={() => (dirty.current = true)}
            onSubmit={() => (dirty.current = false)}
        >
            <div className="modal-inner">
                {/* With a hidden title the close button floats over the content's top-right corner */}
                <header className={`modal-head${hideTitle ? " modal-head-floating" : ""}`}>
                    <h2 id={titleId} className={hideTitle ? "visually-hidden" : undefined}>
                        {title}
                    </h2>
                    <button type="button" className="modal-close" onClick={requestClose} aria-label="Stäng">
                        <X size={20} aria-hidden="true" />
                    </button>
                </header>
                {children}
            </div>
        </dialog>
    );
}
