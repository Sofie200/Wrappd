import { Plus } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import { ErrorMessage } from "./Feedback.jsx";

// A group admin creates an account for someone. onCreated gets { user, link }.
// groupPicker: shown above the button once name and username are filled in (to pick the group last).
// hideIntro: leave out the line about the link - the caller shows it its own way (e.g. in an InfoTip).
export default function CreateUserForm({ groupId, onCreated, groupPicker = null, hideIntro = false }) {
    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    // Everything needed is filled in: a name, a valid username and a group
    const USERNAME = /^[A-Za-z0-9._-]{3,30}$/;
    const ready = name.trim().length > 0 && USERNAME.test(username) && Boolean(groupId);

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const result = await api(`/groups/${groupId}/users`, { method: "POST", body: { name, username } });
            setName("");
            setUsername("");
            onCreated(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="form">
            {/* First, right under the heading above the form ("Eller skapa en ny användare") */}
            {!hideIntro && <small className="muted">{CREATE_USER_INTRO}</small>}
            <div className="field-row">
                <label className="field">
                    <span>Namn</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
                </label>
                <label className="field">
                    <span>Användarnamn</span>
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoCapitalize="none"
                        pattern="[A-Za-z0-9._\-]{3,30}"
                        title="3-30 tecken: a-z, siffror, punkt, bindestreck eller understreck"
                        required
                    />
                </label>
            </div>
            {groupPicker && name.trim() && username.trim() && groupPicker}
            <ErrorMessage message={error} />
            <div>
                <button type="submit" className="btn btn-primary" disabled={busy || !ready}>
                    <Plus size={16} className="icon-lead" aria-hidden="true" />
                    {busy ? "Skapar…" : "Skapa användare"}
                </button>
            </div>
        </form>
    );
}

export const CREATE_USER_INTRO = "Personen läggs till i gruppen direkt. Du får en länk till en sida där hen kan välja lösenord.";
