import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";

// A button (a cog by default, the lucide icon passed as `icon`, or any content passed as `trigger`,
// e.g. a profile icon) that opens a small dropdown menu. Pass the items as children
// (links or buttons with className="menu-item"). Closes on a click outside, on Esc
// and when an item is chosen.
//
// The menu is position: fixed and placed from the button's position on screen, so it always
// stays inside the window: under the button, right-aligned to it - pushed in from the edges
// if needed, and opened upwards if there's no room below.
// atPointer: for a big trigger (e.g. a whole card) - the menu opens where it was clicked instead,
// centred under the pointer (from the keyboard: the middle of the trigger).
export default function SettingsMenu({
    label = "Inställningar",
    icon: Icon = Settings,
    trigger,
    buttonClassName = "btn btn-ghost btn-icon",
    title,
    atPointer = false,
    children,
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const buttonRef = useRef(null);
    const listRef = useRef(null);
    const [position, setPosition] = useState(null); // { top, left } once measured
    // atPointer: where in the trigger it was clicked (relative to it, so it follows when the page scrolls)
    const anchor = useRef(null);

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

            // The point to open from: the click (atPointer), or the button's bottom-right corner
            const point = atPointer && anchor.current
                ? { x: button.left + anchor.current.x, top: button.top + anchor.current.y, bottom: button.top + anchor.current.y }
                : null;
            const left = Math.min(
                Math.max(EDGE, point ? point.x - menu.width / 2 : button.right - menu.width),
                window.innerWidth - menu.width - EDGE
            );
            const below = (point ? point.bottom : button.bottom) + GAP;
            const above = (point ? point.top : button.top) - GAP - menu.height;
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
                className={buttonClassName}
                aria-label={label}
                title={title ?? label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={(e) => {
                    if (atPointer) {
                        const rect = buttonRef.current.getBoundingClientRect();
                        // detail === 0: pressed with the keyboard - no pointer, so use the middle
                        anchor.current =
                            e.detail === 0
                                ? { x: rect.width / 2, y: rect.height / 2 }
                                : { x: e.clientX - rect.left, y: e.clientY - rect.top };
                    }
                    setOpen((o) => !o);
                }}
            >
                {trigger ?? <Icon size={18} aria-hidden="true" />}
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
