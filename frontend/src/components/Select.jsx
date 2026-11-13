import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// A drop-down list in the same look as the people search's suggestions (a native <select> can't be styled
// when open). options: [{ value, label }]. value "" = nothing chosen yet, shown as the placeholder.
// Keyboard: Enter/Space/↓ opens, ↑↓ moves, Enter picks, Escape closes, Home/End jump.
// The list is position: fixed, placed from the button - so a scrolling parent (a modal) can't clip it.
// It opens upwards when there's more room above, and follows the button when something scrolls.
export default function Select({ value, onChange, options, placeholder = "Välj", disabled = false, label }) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const listId = useId();
    const wrap = useRef(null);
    const button = useRef(null);
    const [pos, setPos] = useState(null); // where the list sits on screen

    const chosen = options.find((o) => String(o.value) === String(value));

    // Place the list under (or over) the button - again whenever anything scrolls or the window resizes
    useLayoutEffect(() => {
        if (!open) return;
        function place() {
            const r = button.current.getBoundingClientRect();
            const below = window.innerHeight - r.bottom - 8;
            const above = r.top - 8;
            const up = below < 180 && above > below;
            setPos({
                left: r.left,
                width: r.width,
                // "auto", not undefined: the CSS of .people-suggestions sets a top of its own
                top: up ? "auto" : r.bottom + 4,
                bottom: up ? window.innerHeight - r.top + 4 : "auto",
                maxHeight: Math.min(288, Math.max(up ? above : below, 120)),
            });
        }
        place();
        window.addEventListener("scroll", place, true); // true: also scrolling inside a modal
        window.addEventListener("resize", place);
        return () => {
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("resize", place);
        };
    }, [open]);

    // Close when clicking outside - but not on a scrollbar (a mousedown straight on the scrolling
    // <dialog> or page): scrolling the modal keeps the list open
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (wrap.current?.contains(e.target)) return;
            if (e.target.tagName === "DIALOG" || e.target === document.documentElement) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    function openList() {
        const i = options.findIndex((o) => String(o.value) === String(value));
        setActive(i >= 0 ? i : 0);
        setOpen(true);
    }

    function pick(option) {
        onChange(option.value);
        setOpen(false);
    }

    function onKeyDown(e) {
        if (!open) {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
                e.preventDefault();
                openList();
            }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Home") {
            e.preventDefault();
            setActive(0);
        } else if (e.key === "End") {
            e.preventDefault();
            setActive(options.length - 1);
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (options[active]) pick(options[active]);
        } else if (e.key === "Escape" || e.key === "Tab") {
            setOpen(false);
        }
    }

    const activeId = open && options[active] ? `${listId}-${active}` : undefined;

    return (
        <div className="select" ref={wrap}>
            <button
                ref={button}
                type="button"
                className={`select-button${chosen ? "" : " is-placeholder"}`}
                onClick={() => (open ? setOpen(false) : openList())}
                onKeyDown={onKeyDown}
                disabled={disabled}
                role="combobox"
                aria-label={label}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={activeId}
            >
                <span>{chosen ? chosen.label : placeholder}</span>
                <ChevronDown size={18} aria-hidden="true" />
            </button>

            {open && pos && (
                <ul className="people-suggestions select-list" id={listId} role="listbox" style={pos}>
                    {options.map((option, i) => (
                        <li
                            key={option.value}
                            id={`${listId}-${i}`}
                            role="option"
                            aria-selected={String(option.value) === String(value)}
                            className={`people-suggestion${i === active ? " is-active" : ""}`}
                            onMouseEnter={() => setActive(i)}
                            // mousedown, like the people search: picks before the button loses focus
                            onMouseDown={(e) => {
                                e.preventDefault();
                                pick(option);
                            }}
                        >
                            {option.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
