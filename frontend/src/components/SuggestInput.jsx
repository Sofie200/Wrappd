import { useId, useState } from "react";

// A text field with suggestions: they show when the field is clicked (or focused), narrow down as you
// type, and are picked with the mouse or with ↓ ↑ and Enter. Anything else can still be typed.
// The same look as the people search's suggestions (.people-suggestions).
export default function SuggestInput({ value, onChange, suggestions = [], ...inputProps }) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const listId = useId();

    const term = value.trim().toLowerCase();
    const shown = suggestions.filter((s) => s.toLowerCase().includes(term) && s.toLowerCase() !== term);
    const visible = open && shown.length > 0;

    function pick(text) {
        onChange(text);
        setOpen(false);
        setActive(-1);
    }

    function onKeyDown(e) {
        if (!visible) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, shown.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault(); // pick – don't submit the form
            pick(shown[active]);
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    }

    return (
        <div className="people-search">
            <input
                {...inputProps}
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                    setActive(-1);
                }}
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={onKeyDown}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={visible}
                aria-controls={listId}
                aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
            />
            {visible && (
                <ul className="people-suggestions" id={listId} role="listbox">
                    {shown.map((s, i) => (
                        <li
                            key={s}
                            id={`${listId}-${i}`}
                            role="option"
                            aria-selected={i === active}
                            className={`people-suggestion${i === active ? " is-active" : ""}`}
                            // mousedown, not click: picks before the field loses focus and closes the list
                            onMouseDown={(e) => {
                                e.preventDefault();
                                pick(s);
                            }}
                        >
                            {s}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
