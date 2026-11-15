import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useFetch } from "../hooks/useFetch.js";
import { formatShortDate } from "../format.js";
import Modal from "./Modal.jsx";
import Select from "./Select.jsx";
import EventFields, { useGroupPeople } from "./EventFields.jsx";
import { ErrorMessage, Loading } from "./Feedback.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";

// "Logga gåva" on the gifts page: a modal in two steps.
//  1. What it's for: a coming wish list, a coming Secret Santa where I give, or one of my events
//     ("Loggade gåvor", past ones behind "Arkiverade händelser") - or a new event, with its name, date and recipient.
//  2. "Nästa": the ordinary gift form - for a list or a Secret Santa the same as "Överraskning"; for an event
//     already logged on it ("Ändra" goes back to step 1).
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
    // The coming wish lists and Secret Santas a gift outside the list can go on (the same as on the gift page)
    const linkable = useFetch("/gifts/lists");
    // Who a new event can be for: someone in my groups (the same as on the gift page)
    const people = useGroupPeople();

    const [step, setStep] = useState(1);
    // "existing" or "new" - existing is chosen from the start when there are events to pick from
    const [mode, setMode] = useState(null);
    const [eventId, setEventId] = useState("");
    // Past events are tucked away behind "Arkiverade händelser" at the bottom of the list
    const [showArchived, setShowArchived] = useState(false);
    const [draft, setDraft] = useState({ name: "", date: "", recipientId: "", recipientText: "" });
    const [error, setError] = useState(null);

    const list = events.data?.data ?? [];
    const wishLists = (linkable.data?.data ?? []).filter((l) => !l.archived);
    const santas = (linkable.data?.santas ?? []).filter((x) => !x.archived);
    const hasChoices = list.length + wishLists.length + santas.length > 0;
    const chosenMode = mode ?? (hasChoices ? "existing" : "new");
    // Everything a gift can be logged on, as one list sorted by date (soonest first): "Titel · Till: Sigrid · 24 dec."
    // A Secret Santa without who I give to - that stays hidden until it's revealed on the Santa's card.
    // Past events (archived) are shown last, newest first.
    const choiceLabel = (title, recipient, date) =>
        [title, recipient && `Till: ${recipient}`, formatShortDate(date)].filter(Boolean).join(" · ");
    const choices = [
        ...wishLists.map((l) => ({ value: `list:${l.id}`, date: l.endDate, label: choiceLabel(l.title, l.recipients, l.endDate) })),
        ...santas.map((x) => ({ value: `santa:${x.id}`, date: x.date, label: choiceLabel(x.title, null, x.date) })),
        ...list.map((ev) => ({
            value: `event:${ev.id}`,
            date: ev.date,
            archived: ev.archived,
            label: choiceLabel(ev.name, ev.recipientName, ev.date),
        })),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // The choice: "list:5", "santa:3" or "event:7"
    const [chosenKind, chosenId] = eventId.split(":");

    // Step 2's "preset" event: the chosen one (with its id), or the new one's fields (no id - created with the gift)
    function presetEvent() {
        if (chosenMode === "existing") {
            const ev = list.find((x) => String(x.id) === chosenId);
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
        if (chosenMode === "existing" && !eventId) return setError("Välj vad gåvan är till");
        if (chosenMode === "new" && (!draft.name.trim() || !draft.date)) return setError("Ange händelsens namn och datum");
        setError(null);
        setStep(2);
    }

    // A wish list or a Secret Santa: the ordinary form for a gift outside the list, with it chosen
    if (step === 2 && chosenMode === "existing" && chosenKind !== "event") {
        return (
            <Modal title="Logga gåva" onClose={onClose}>
                <GiftEditor
                    id="new"
                    presetListId={chosenKind === "list" ? chosenId : ""}
                    presetSantaId={chosenKind === "santa" ? chosenId : ""}
                    onDone={onAdded}
                />
            </Modal>
        );
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
            {(events.loading && !events.data) || (linkable.loading && !linkable.data) ? (
                <Loading />
            ) : (
                <form className="form" onSubmit={next}>
                    <ErrorMessage message={events.error ?? error} />
                    <fieldset className="fieldset">
                        <legend>Vilken händelse gäller gåvan?</legend>
                        <div className="checks checks-inline">
                            {hasChoices && (
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
                            <span>Vad är gåvan till?</span>
                            {/* The coming events - and last, "Arkiverade händelser …", which brings in the past ones */}
                            <Select
                                label="Vad är gåvan till?"
                                placeholder="Välj…"
                                value={eventId}
                                onChange={(v) => {
                                    if (v === "archived") return setShowArchived(true);
                                    setEventId(String(v));
                                }}
                                options={[
                                    ...choices.filter((c) => !c.archived),
                                    // Past events: after the coming ones, once "Arkiverade händelser" has been chosen
                                    ...(showArchived ? choices.filter((c) => c.archived).reverse() : []),
                                    ...(!showArchived && choices.some((c) => c.archived)
                                        ? [{ value: "archived", label: "Arkiverade händelser", help: true }]
                                        : []),
                                ]}
                            />
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
