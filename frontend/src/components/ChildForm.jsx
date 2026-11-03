import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ErrorMessage } from "./Feedback.jsx";

// Create a child (no `child`) or edit one. Groups aren't chosen here: the child is automatically in
// every group with "Inkludera barn" that one of its parents is in.
export default function ChildForm({ child, onSaved, onCancel }) {
    const { user } = useAuth();

    const [name, setName] = useState(child?.name ?? "");

    // Parents as usernames. When creating, I'm always a parent and can add one co-parent.
    const [parents, setParents] = useState(
        child ? child.parents.map((p) => ({ username: p.username, name: p.name })) : [{ username: user.username, name: user.name }]
    );
    const [newParent, setNewParent] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    function addParent() {
        const username = newParent.trim().replace(/^@/, "").toLowerCase();
        if (!username) return;
        if (parents.some((p) => p.username === username)) {
            setError("Den personen är redan förälder");
            return;
        }
        setParents([...parents, { username, name: null }]);
        setNewParent("");
        setError(null);
    }

    function removeParent(username) {
        if (
            username === user.username &&
            !window.confirm("Ta bort dig själv som förälder? Du kommer inte längre att kunna hantera barnet.")
        ) {
            return;
        }
        setParents(parents.filter((p) => p.username !== username));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);

        try {
            if (child) {
                await api(`/children/${child.id}`, {
                    method: "PUT",
                    body: { name, parentUsernames: parents.map((p) => p.username) },
                });
            } else {
                const coParent = parents.find((p) => p.username !== user.username);
                await api("/children", {
                    method: "POST",
                    body: { name, coParentUsername: coParent?.username ?? "" },
                });
            }
            onSaved();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    const canAddParent = parents.length < 2;
    const isNew = !child;

    return (
        <form onSubmit={handleSubmit} className="form">
            <label className="field">
                <span>Namn</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />
                <small>Barn har inget användarnamn och kan inte logga in – de kan bara få listor.</small>
            </label>

            {/* Groups aren't chosen – they're shown under Info on the child */}
            {!child && (
                <p className="muted small">
                    Barnet kommer med automatiskt i alla grupper med <strong>Inkludera barn</strong> som någon av
                    föräldrarna är med i.
                </p>
            )}

            <fieldset className="fieldset">
                <legend>Föräldrar</legend>
                <ul className="parent-list">
                    {parents.map((p) => {
                        const isMe = p.username === user.username;
                        return (
                            <li key={p.username}>
                                <span>
                                    {p.name ?? <strong className="username">{p.username}</strong>}
                                    {p.name && (
                                        <>
                                            {" "}
                                            <strong className="username">{p.username}</strong>
                                        </>
                                    )}
                                    {isMe && <span className="muted"> (du)</span>}
                                </span>
                                {/* When creating I'm always a parent. Later anyone can be removed, as long as one remains. */}
                                {!(isNew && isMe) && parents.length > 1 && (
                                    <button type="button" className="btn btn-small btn-ghost" onClick={() => removeParent(p.username)}>
                                        Ta bort
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {canAddParent && (
                    <div className="inline-form">
                        <input
                            value={newParent}
                            onChange={(e) => setNewParent(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addParent();
                                }
                            }}
                            placeholder="Medförälderns användarnamn"
                            aria-label="Medförälderns användarnamn"
                            autoCapitalize="none"
                        />
                        <button type="button" className="btn" onClick={addParent}>
                            Lägg till
                        </button>
                    </div>
                )}
                <p className="muted small">Ett barn kan ha en eller två föräldrar. Medföräldern behöver inte vara med i någon grupp.</p>
            </fieldset>

            <ErrorMessage message={error} />

            <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? "Sparar…" : isNew ? "Lägg till barn" : "Spara"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
                    Avbryt
                </button>
            </div>
        </form>
    );
}
