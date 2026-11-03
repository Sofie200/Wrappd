// Checkboxes for picking people among the members of the list's groups.
// lockedIds: always checked, can't be unchecked (e.g. the creator as admin).
// disabledIds: can't be picked (e.g. someone else's child) – disabledHint says why.
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
}) {
    function toggle(id) {
        onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    }

    return (
        <fieldset className="fieldset">
            <legend>{legend}</legend>
            {hint && <p className="muted small">{hint}</p>}
            {people.length === 0 ? (
                <p className="muted small">{emptyText}</p>
            ) : (
                <div className="checks">
                    {people.map((person) => {
                        const locked = lockedIds.includes(person.id);
                        const disabled = disabledIds.includes(person.id);
                        return (
                            <label key={person.id} className={`check${disabled ? " check-disabled" : ""}`} title={disabled ? disabledHint : undefined}>
                                <input
                                    type="checkbox"
                                    checked={locked || selected.includes(person.id)}
                                    onChange={() => toggle(person.id)}
                                    disabled={locked || disabled}
                                />
                                <span>
                                    {person.name}{" "}
                                    {person.isChild ? (
                                        <span className="badge badge-gift">Barn</span>
                                    ) : (
                                        <strong className="username">{person.username}</strong>
                                    )}
                                    {person.isActivated === false && !person.isChild && (
                                        <span className="badge badge-private">Ej aktiverad</span>
                                    )}
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}
        </fieldset>
    );
}
