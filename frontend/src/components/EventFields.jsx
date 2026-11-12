import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import PeoplePicker from "./PeoplePicker.jsx";
import SuggestInput from "./SuggestInput.jsx";

// The people an event of my own can be for: everyone in my groups but me
export function useGroupPeople() {
    const { user } = useAuth();
    const myGroups = useFetch("/groups");
    const groupIds = (myGroups.data?.data ?? []).map((g) => g.id).join(",");
    const groupMembers = useFetch(groupIds ? `/groups/members?ids=${groupIds}` : null);
    return (groupMembers.data?.data ?? []).filter((p) => p.id !== user.id);
}

// An event of my own ("Loggade gåvor"): its name, date and who it's for - someone in my groups,
// or a name in free text. Used in "Logga gåva" (a new event) and "Redigera händelse".
// draft: { name, date, recipientId, recipientText } (all strings); unknown: the recipient's account was deleted.
export default function EventFields({ draft, onChange, people, unknown = false, disabled = false }) {
    const set = (field) => (e) => onChange({ ...draft, [field]: e.target.value });
    // Names I've typed in before - suggested when the free-text field is clicked
    const recentNames = useFetch("/gifts/recipient-names");
    // The linked person, also if they're no longer in my groups
    const options =
        draft.recipientId && !people.some((p) => String(p.id) === draft.recipientId) && draft.recipientName
            ? [{ id: Number(draft.recipientId), name: draft.recipientName }, ...people]
            : people;

    return (
        <>
            <div className="field-row">
                <label className="field">
                    <span>Händelse</span>
                    <input
                        value={draft.name}
                        onChange={set("name")}
                        maxLength={100}
                        required
                        disabled={disabled}
                        placeholder="t.ex. Farmors 80-årsdag"
                    />
                </label>
                <label className="field">
                    <span>Datum</span>
                    <input type="date" value={draft.date} onChange={set("date")} required disabled={disabled} />
                </label>
            </div>
            <PeoplePicker
                legend="Till vem? (valfritt)"
                hint="Sök bland personerna i dina grupper. Hen ser aldrig gåvan."
                people={options}
                selected={draft.recipientId ? [Number(draft.recipientId)] : []}
                onChange={(ids) => onChange({ ...draft, recipientId: ids.length ? String(ids[0]) : "" })}
                emptyText="Det finns inga andra i dina grupper än."
                single
            />
            {!draft.recipientId && (
                <label className="field recipient-text-field">
                    <span>…eller skriv ett namn</span>
                    <SuggestInput
                        value={draft.recipientText}
                        onChange={(text) => onChange({ ...draft, recipientText: text })}
                        suggestions={recentNames.data?.data ?? []}
                        maxLength={100}
                        placeholder={unknown ? "Okänd mottagare" : "T.ex. Farmor"}
                        disabled={disabled}
                    />
                    {unknown && !draft.recipientText && (
                        <small>Mottagarens konto är raderat. Skriv ett namn om du vill komma ihåg vem gåvan var till.</small>
                    )}
                </label>
            )}
        </>
    );
}
