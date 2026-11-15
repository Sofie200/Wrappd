import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useFetch } from "../hooks/useFetch.js";
import { formatDate } from "../format.js";
import Modal from "./Modal.jsx";
import EventFields, { useGroupPeople } from "./EventFields.jsx";
import { ErrorMessage, Loading } from "./Feedback.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";

// "Logga gåva" on the gifts page: a modal in two steps.
//  1. The event: one of my events ("Loggade gåvor") - or a new one, with its name, date and recipient.
//  2. "Nästa": the ordinary gift form, already logged on that event ("Ändra" goes back to step 1).
// The new event is created on the server together with the gift (an event never exists without gifts).
export default function LogGiftButton({ className = "btn btn-primary", onAdded, children }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
                {children}
            </button>
            {open && (
                <LogGiftModal
                    onClose={() => setOpen(false)}
                    onAdded={() => {
                        setOpen(false);
                        onAdded?.();
                    }}
                />
            )}
        </>
    );
}

function LogGiftModal({ onClose, onAdded }) {
    const events = useFetch("/gifts/events");
    // Who a new event can be for: someone in my groups (the same as on the gift page)
    const people = useGroupPeople();

    const [step, setStep] = useState(1);
    // "existing" or "new" - existing is chosen from the start when there are events to pick from
    const [mode, setMode] = useState(null);
    const [eventId, setEventId] = useState("");
    const [draft, setDraft] = useState({ name: "", date: "", recipientId: "", recipientText: "" });
    const [error, setError] = useState(null);

    const list = events.data?.data ?? [];
    const chosenMode = mode ?? (list.length > 0 ? "existing" : "new");

    // Step 2's "preset" event: the chosen one (with its id), or the new one's fields (no id - created with the gift)
    function presetEvent() {
        if (chosenMode === "existing") {
            const ev = list.find((x) => String(x.id) === eventId);
            return { eventId: ev.id, name: ev.name, date: ev.date, recipientId: ev.recipientId, recipientName: ev.recipientName };
        }
        const person = people.find((p) => String(p.id) === draft.recipientId);
        return {
            name: draft.name.trim(),
            date: draft.date,
            recipientId: draft.recipientId,
            recipientName: person?.name ?? (draft.recipientText.trim() || null),
            recipientText: draft.recipientId ? "" : draft.recipientText.trim(),
            isNew: true,
        };
    }

    function next(e) {
        e.preventDefault();
        if (chosenMode === "existing" && !eventId) return setError("Välj en händelse");
        if (chosenMode === "new" && (!draft.name.trim() || !draft.date)) return setError("Ange händelsens namn och datum");
        setError(null);
        setStep(2);
    }

    if (step === 2) {
        return (
            <Modal title="Logga gåva" onClose={onClose}>
                {/* "Ändra" after "Loggas på …" goes back to step 1 */}
                <GiftEditor id="new" presetEvent={presetEvent()} onDone={onAdded} onChangeEvent={() => setStep(1)} />
            </Modal>
        );
    }

    return (
        <Modal title="Logga gåva" onClose={onClose}>
            {events.loading && !events.data ? (
                <Loading />
            ) : (
                <form className="form" onSubmit={next}>
                    <ErrorMessage message={events.error ?? error} />
                    <fieldset className="fieldset">
                        <legend>Vilken händelse gäller gåvan?</legend>
                        <div className="checks checks-inline">
                            {list.length > 0 && (
                                <label className="check">
                                    <input
                                        type="radio"
                                        name="event-mode"
                                        checked={chosenMode === "existing"}
                                        onChange={() => setMode("existing")}
                                    />
                                    En befintlig
                                </label>
                            )}
                            <label className="check">
                                <input type="radio" name="event-mode" checked={chosenMode === "new"} onChange={() => setMode("new")} />
                                En ny händelse
                            </label>
                        </div>
                    </fieldset>

                    {chosenMode === "existing" ? (
                        <label className="field">
                            <span>Händelse</span>
                            <select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
                                <option value="">Välj…</option>
                                {list.map((ev) => (
                                    <option key={ev.id} value={ev.id}>
                                        {ev.name}
                                        {ev.recipientName ? ` · till ${ev.recipientName}` : ""} · {formatDate(ev.date)}
                                        {ev.archived ? " (har varit)" : ""}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : (
                        <EventFields draft={draft} onChange={setDraft} people={people} />
                    )}

                    <div className="form-actions">
                        <button type="submit" className="btn btn-primary">
                            Nästa <ArrowRight size={16} aria-hidden="true" />
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>
                            Avbryt
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
}
