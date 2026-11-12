import { useState } from "react";
import { createPortal } from "react-dom";
import PersonModal from "./PersonModal.jsx";

// A name you can click to see the person's wish profile. The modal is rendered at the end of
// <body>, since a name often sits inside text (a <dialog> isn't allowed inside a <p> or <span>).
// className replaces the link look, e.g. to make it a button.
// santa / onReserved: passed on to the wish profile - reserving there counts for that Secret Santa (PersonModal)
export default function PersonLink({ person, children, className = "person-link", title, santa = null, onReserved }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                className={className}
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                title={title ?? `Visa ${person.name}s önskeprofil`}
            >
                {children ?? person.name}
            </button>
            {open &&
                createPortal(
                    <PersonModal personId={person.id} santa={santa} onReserved={onReserved} onClose={() => setOpen(false)} />,
                    document.body
                )}
        </>
    );
}
