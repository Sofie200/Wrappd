import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// A drop-down list in the same look as the people search's suggestions (a native <select> can't be styled
// when open). options: [{ value, label }]. value "" = nothing chosen yet, shown as the placeholder.
// Keyboard: Enter/Space/↓ opens, ↑↓ moves, Enter picks, Escape closes, Home/End jump.
export default function Select({ value, onChange, options, placeholder = "Välj", disabled = false, label }) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const listId = useId();
    const wrap = useRef(null);

    const chosen = options.find((o) => String(o.value) === String(value));

    // Close when clicking outside
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (!wrap.current?.contains(e.target)) setOpen(false);
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

            {open && (
                <ul className="people-suggestions" id={listId} role="listbox">
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
