import { useState } from "react";
import { Save } from "lucide-react";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import Modal from "./Modal.jsx";
import EventFields, { useGroupPeople } from "./EventFields.jsx";
import { ErrorMessage, Loading } from "./Feedback.jsx";

// "Redigera händelse": an event of my own ("Loggade gåvor") – name, date and who it's for.
// Changes it for all the event's gifts, and for everyone in them.
export default function EditEventModal({ eventId, onClose, onSaved }) {
    const events = useFetch("/gifts/events");
    const people = useGroupPeople();
    const event = events.data?.data.find((e) => e.id === eventId);

    return (
        <Modal title="Redigera händelse" onClose={onClose}>
            {!events.data ? (
                events.loading ? <Loading /> : <ErrorMessage message={events.error} onRetry={events.reload} />
            ) : !event ? (
                <ErrorMessage message="Händelsen finns inte längre." />
            ) : (
                <EventForm event={event} people={people} onClose={onClose} onSaved={onSaved} />
            )}
        </Modal>
    );
}

function EventForm({ event, people, onClose, onSaved }) {
    const [draft, setDraft] = useState({
        name: event.name,
        date: event.date,
        recipientId: event.recipientId ? String(event.recipientId) : "",
        recipientName: event.recipientId ? event.recipientName : "",
        recipientText: event.recipientText ?? "",
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function save(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api(`/gifts/events/${event.id}`, {
                method: "PUT",
                body: {
                    recipient: draft.name,
                    giftDate: draft.date,
                    recipientId: draft.recipientId,
                    recipientText: draft.recipientId ? "" : draft.recipientText,
                },
            });
            onSaved();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <form className="form" onSubmit={save}>
            <p className="muted small">Ändringen gäller alla gåvor som loggats på händelsen.</p>
            <ErrorMessage message={error} />
            <EventFields draft={draft} onChange={setDraft} people={people} unknown={event.recipientUnknown} disabled={busy} />
            <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                    <Save size={16} aria-hidden="true" />
                    {busy ? "Sparar…" : "Spara"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                    Avbryt
                </button>
            </div>
        </form>
    );
}
