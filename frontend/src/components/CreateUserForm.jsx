import { Send } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import { ErrorMessage } from "./Feedback.jsx";

// A group admin creates an account for someone. onCreated gets { user, link }.
// Only a name: the server makes a username from it, and the person can pick another one on the link page.
// groupPicker: shown above the button once the name is filled in (to pick the group last).
// hideIntro: leave out the line about the link - the caller shows it its own way (e.g. in an InfoTip).
export default function CreateUserForm({ groupId, onCreated, groupPicker = null, hideIntro = false }) {
    const [name, setName] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    // Everything needed is filled in: a name and a group
    const ready = name.trim().length > 0 && Boolean(groupId);

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const result = await api(`/groups/${groupId}/users`, { method: "POST", body: { name } });
            setName("");
            onCreated(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="form">
            {/* First, right under the heading above the form ("Eller bjud in en ny användare") */}
            {!hideIntro && <small className="muted">{CREATE_USER_INTRO}</small>}
            {/* The name, with "Bjud in" right of it */}
            <div className="invite-row">
                <label className="field">
                    <span>Namn</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
                </label>
                <button type="submit" className="btn btn-primary" disabled={busy || !ready}>
                    <Send size={16} className="icon-lead" aria-hidden="true" />
                    {busy ? "Bjuder in…" : "Bjud in"}
                </button>
            </div>
            {groupPicker && name.trim() && groupPicker}
            <ErrorMessage message={error} />
        </form>
    );
}

export const CREATE_USER_INTRO =
    "Personen läggs till i gruppen direkt. Du får en länk till en sida där hen väljer användarnamn och lösenord.";
