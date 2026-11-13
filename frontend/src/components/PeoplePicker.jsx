import { useEffect, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import Avatar from "./Avatar.jsx";

// Picking people among the members of the list's groups: the chosen ones as chips, and a search
// field that suggests the others as you type (on name or username).
// lockedIds: always chosen, can't be removed (e.g. the creator as admin).
// disabledIds: can't be picked (e.g. someone else's child) - disabledHint says why.
// single: at most one person - picking someone replaces the choice, and the search hides once someone is chosen.
// bare: no fieldset or legend of its own - for when it sits inside another fieldset (legend is then only
// used to label the search field for screen readers).
// onNotFound: adds a last choice "Hittar du inte den du söker?" to the suggestions, which calls it.
// compact: once someone is chosen the search hides, and a small + next to the chips opens it again for one more.
// Everyone is suggested, in alphabetical order - the list scrolls when it's long
const byName = (a, b) => a.name.localeCompare(b.name, "sv") || (a.username ?? "").localeCompare(b.username ?? "", "sv");

export default function PeoplePicker({
    legend,
    hint,
    people,
    selected,
    onChange,
    lockedIds = [],
    disabledIds = [],
    disabledHint,
    emptyText = "Välj en grupp först.",
    single = false,
    bare = false,
    onNotFound,
    compact = false,
}) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0); // the highlighted suggestion
    const [adding, setAdding] = useState(false); // compact: the search is open for one more
    const listId = useId();

    const isChosen = (id) => lockedIds.includes(id) || selected.includes(id);
    const chosen = people.filter((p) => isChosen(p.id));

    const term = query.trim().toLowerCase();
    const suggestions = people
        .filter((p) => !isChosen(p.id))
        .filter((p) => !term || p.name.toLowerCase().includes(term) || (p.username ?? "").toLowerCase().includes(term))
        .sort(byName);
    const pickable = suggestions.filter((p) => !disabledIds.includes(p.id));

    function add(person) {
        if (disabledIds.includes(person.id)) return;
        onChange(single ? [person.id] : [...selected, person.id]);
        setQuery("");
        setActive(0);
        setAdding(false);
    }

    function notFound() {
        setOpen(false);
        onNotFound();
    }

    function remove(id) {
        onChange(selected.filter((x) => x !== id));
    }

    function onKeyDown(e) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, pickable.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            // Pick the highlighted one - and never submit the form from here
            e.preventDefault();
            if (open && pickable[active]) add(pickable[active]);
            else if (open && onNotFound) notFound();
        } else if (e.key === "Escape") {
            setOpen(false);
            if (query === "") setAdding(false);
        } else if (e.key === "Backspace" && query === "") {
            // An empty field: Backspace removes the last one chosen (not a locked one)
            const last = [...selected].reverse().find((id) => !lockedIds.includes(id));
            if (last !== undefined) remove(last);
        }
    }

    const showSearch = single ? chosen.length === 0 : !compact || chosen.length === 0 || adding;

    const activeId = pickable[active] ? `${listId}-${pickable[active].id}` : undefined;

    // The list can be long now: keep the highlighted one in view when moving with the arrow keys
    useEffect(() => {
        if (open && activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
    }, [open, activeId]);

    const picker =
            people.length === 0 ? (
                <p className="muted small">{emptyText}</p>
            ) : (
                <div className="people-picker">
                    {chosen.length > 0 && (
                        <ul className="people-chosen">
                            {chosen.map((person) => (
                                <li key={person.id} className="person-chip">
                                    <PersonAvatar person={person} />
                                    <span>{person.name}</span>
                                    {!lockedIds.includes(person.id) && (
                                        <button
                                            type="button"
                                            className="person-chip-remove"
                                            onClick={() => remove(person.id)}
                                            aria-label={`Ta bort ${person.name}`}
                                            title="Ta bort"
                                        >
                                            <X size={14} aria-hidden="true" />
                                        </button>
                                    )}
                                </li>
                            ))}
                            {!showSearch && !single && (
                                <li>
                                    <button
                                        type="button"
                                        className="person-chip-add"
                                        onClick={() => setAdding(true)}
                                        aria-label={`Lägg till fler - ${legend}`}
                                        title="Lägg till fler"
                                    >
                                        <Plus size={16} aria-hidden="true" />
                                    </button>
                                </li>
                            )}
                        </ul>
                    )}

                    {showSearch && (
                    <div className="people-search">
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setActive(0);
                                setOpen(true);
                            }}
                            onFocus={() => setOpen(true)}
                            onBlur={() => {
                                setOpen(false);
                                // compact: leaving the field empty closes it again
                                if (query === "") setAdding(false);
                            }}
                            autoFocus={adding}
                            onKeyDown={onKeyDown}
                            placeholder="Sök på namn eller användarnamn"
                            autoCapitalize="none"
                            autoComplete="off"
                            role="combobox"
                            aria-label={`Sök - ${legend}`}
                            aria-expanded={open && (suggestions.length > 0 || Boolean(onNotFound))}
                            aria-controls={listId}
                            aria-activedescendant={open ? activeId : undefined}
                        />

                        {open && (
                            <ul className="people-suggestions" id={listId} role="listbox">
                                {suggestions.length === 0 ? (
                                    <li className="people-suggestion-empty">
                                        {term ? `Hittar ingen som heter "${query.trim()}" i dina grupper.` : "Alla är redan med!"}
                                    </li>
                                ) : (
                                    suggestions.map((person) => {
                                        const disabled = disabledIds.includes(person.id);
                                        const isActive = pickable[active]?.id === person.id;
                                        return (
                                            <li
                                                key={person.id}
                                                id={`${listId}-${person.id}`}
                                                role="option"
                                                aria-selected={isActive}
                                                aria-disabled={disabled}
                                                className={`people-suggestion${isActive ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
                                                title={disabled ? disabledHint : undefined}
                                                // mousedown, not click: picks before the field loses focus and closes the list
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    add(person);
                                                }}
                                            >
                                                <PersonAvatar person={person} />
                                                <span>
                                                    {person.name}{" "}
                                                    {person.isChild ? (
                                                        <span className="badge badge-gift">Barn</span>
                                                    ) : (
                                                        <span className="muted">({person.username})</span>
                                                    )}
                                                    {person.isActivated === false && !person.isChild && (
                                                        <span className="badge badge-private">Ej aktiverad</span>
                                                    )}
                                                </span>
                                                {disabled && disabledHint && <span className="muted small">{disabledHint}</span>}
                                            </li>
                                        );
                                    })
                                )}
                                {onNotFound && (
                                    <li
                                        className="people-suggestion people-suggestion-help"
                                        role="option"
                                        aria-selected={false}
                                        // mousedown, like the people above: before the field loses focus
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            notFound();
                                        }}
                                    >
                                        Hittar du inte den du söker?
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>
                    )}
                </div>
            );

    if (bare) return picker;
    return (
        <fieldset className="fieldset">
            <legend>{legend}</legend>
            {hint && <p className="muted small">{hint}</p>}
            {picker}
        </fieldset>
    );
}

function PersonAvatar({ person }) {
    return person.isChild ? (
        <Avatar isChild id={person.id} size={22} />
    ) : (
        <Avatar icon={person.avatarIcon} color={person.avatarColor} size={22} />
    );
}
