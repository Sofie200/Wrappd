import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";

// A cog button that opens a small dropdown menu. Pass the items as children
// (links or buttons with className="menu-item"). Closes on a click outside, on Esc
// and when an item is chosen.
export default function SettingsMenu({ label = "Inställningar", children }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const buttonRef = useRef(null);

    useEffect(() => {
        if (!open) return;

        function onPointerDown(e) {
            if (!ref.current.contains(e.target)) setOpen(false);
        }
        function onKeyDown(e) {
            if (e.key === "Escape") {
                setOpen(false);
                buttonRef.current.focus();
            }
        }

        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    return (
        <div className="menu" ref={ref}>
            <button
                ref={buttonRef}
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={label}
                title={label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
            >
                <Settings size={18} aria-hidden="true" />
            </button>

            {open && (
                <div className="menu-list" role="menu" onClick={() => setOpen(false)}>
                    {children}
                </div>
            )}
        </div>
    );
}
