import { Plus } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import { ErrorMessage } from "./Feedback.jsx";

// A group admin creates an account for someone. onCreated gets { user, link }.
export default function CreateUserForm({ groupId, onCreated }) {
    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

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
            <small className="muted">
                Personen läggs till i gruppen direkt. Du får en länk där hen väljer sitt lösenord.
            </small>
            <ErrorMessage message={error} />
            <div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                    <Plus size={16} className="icon-lead" aria-hidden="true" />
                    {busy ? "Skapar…" : "Skapa användare"}
                </button>
            </div>
        </form>
    );
}
