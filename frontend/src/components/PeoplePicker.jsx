// Checkboxes for picking people among the members of the list's groups.
// lockedIds are always checked and can't be unchecked (e.g. the creator as admin).
export default function PeoplePicker({ legend, hint, people, selected, onChange, lockedIds = [] }) {
    function toggle(id) {
        onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    }

    return (
        <fieldset className="fieldset">
            <legend>{legend}</legend>
            {hint && <p className="muted small">{hint}</p>}
            {people.length === 0 ? (
                <p className="muted small">Välj en grupp först.</p>
            ) : (
                <div className="checks">
                    {people.map((person) => {
                        const locked = lockedIds.includes(person.id);
                        return (
                            <label key={person.id} className="check">
                                <input
                                    type="checkbox"
                                    checked={locked || selected.includes(person.id)}
                                    onChange={() => toggle(person.id)}
                                    disabled={locked}
                                />
                                <span>
                                    {person.name} <span className="muted">@{person.username}</span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}
        </fieldset>
    );
}
