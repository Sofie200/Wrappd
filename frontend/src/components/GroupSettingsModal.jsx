import { useState } from "react";
import { api } from "../api.js";
import { ErrorMessage } from "./Feedback.jsx";
import Modal from "./Modal.jsx";

// Group settings (admin): the name, and whether all members' children are included
export default function GroupSettingsModal({ group, onSaved, onClose }) {
    const [name, setName] = useState(group.name);
    const [includeChildren, setIncludeChildren] = useState(group.includeChildren);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function save(e) {
        e.preventDefault();
        if (
            group.includeChildren &&
            !includeChildren &&
            !window.confirm("Alla barn tas bort ur gruppen. Fortsätta?")
        ) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await api(`/groups/${group.id}`, { method: "PATCH", body: { name, includeChildren } });
            onSaved();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <Modal title="Gruppens inställningar" onClose={onClose}>
            <form className="form" onSubmit={save}>
                <label className="field">
                    <span>Namn</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required disabled={busy} />
                </label>

                <div className="field">
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={includeChildren}
                            onChange={(e) => setIncludeChildren(e.target.checked)}
                            disabled={busy}
                        />
                        Inkludera barn
                    </label>
                    <small className="muted">
                        {includeChildren
                            ? "Alla medlemmars barn är med i gruppen automatiskt."
                            : "Inga barn kan vara med i gruppen."}
                    </small>
                </div>

                <ErrorMessage message={error} />

                <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                        {busy ? "Sparar…" : "Spara"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                        Avbryt
                    </button>
                </div>
            </form>
        </Modal>
    );
}
