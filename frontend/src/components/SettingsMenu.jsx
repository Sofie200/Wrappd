import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";

// A button (a cog by default, or the lucide icon passed as `icon`) that opens a small dropdown menu. Pass the items as children
// (links or buttons with className="menu-item"). Closes on a click outside, on Esc
// and when an item is chosen.
//
// The menu is position: fixed and placed from the button's position on screen, so it always
// stays inside the window: under the button, right-aligned to it – pushed in from the edges
// if needed, and opened upwards if there's no room below.
export default function SettingsMenu({ label = "Inställningar", icon: Icon = Settings, children }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const buttonRef = useRef(null);
    const listRef = useRef(null);
    const [position, setPosition] = useState(null); // { top, left } once measured

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

    // Measure before paint, so the menu never flashes in the wrong place
    useLayoutEffect(() => {
        if (!open) return;

        function place() {
            const GAP = 6;
            const EDGE = 8; // keep this far from the window's edges
            const button = buttonRef.current.getBoundingClientRect();
            const menu = listRef.current.getBoundingClientRect();

            const left = Math.min(
                Math.max(EDGE, button.right - menu.width),
                window.innerWidth - menu.width - EDGE
            );
            const below = button.bottom + GAP;
            const above = button.top - GAP - menu.height;
            const fitsBelow = below + menu.height <= window.innerHeight - EDGE;
            const top = fitsBelow || above < EDGE ? below : above;

            setPosition({ top, left: Math.max(EDGE, left) });
        }

        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true); // true: also when a parent scrolls
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
            setPosition(null);
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
                <Icon size={18} aria-hidden="true" />
            </button>

            {open && (
                <div
                    ref={listRef}
                    className="menu-list"
                    role="menu"
                    style={position ?? { top: 0, left: 0, visibility: "hidden" }}
                    onClick={() => setOpen(false)}
                >
                    {children}
                </div>
            )}
        </div>
    );
}
