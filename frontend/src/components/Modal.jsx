import { useEffect, useId, useRef } from "react";

// A modal built on the native <dialog>: focus trap, Esc to close and the backdrop come for free.
// Mount it to open it, unmount it to close it. Clicking the backdrop also closes.
export default function Modal({ title, onClose, children }) {
    const ref = useRef(null);
    const titleId = useId();

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
            // (We don't listen to "close" – in StrictMode the effect's cleanup closes the dialog,
            // and that late close event would shut the modal right after it opened.)
            onCancel={(e) => {
                e.preventDefault();
                onClose();
            }}
            onClick={(e) => {
                // A click straight on <dialog> (not its content) is a click on the backdrop
                if (e.target === ref.current) onClose();
            }}
        >
            <div className="modal-inner">
                <header className="modal-head">
                    <h2 id={titleId}>{title}</h2>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Stäng">
                        ×
                    </button>
                </header>
                {children}
            </div>
        </dialog>
    );
}
