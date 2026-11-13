import { Plus, Save } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import PeoplePicker from "./PeoplePicker.jsx";
import { ErrorMessage } from "./Feedback.jsx";
import InfoTip from "./InfoTip.jsx";

// Create a child (no `child`) or edit one. Groups aren't chosen here: the child is automatically in
// every group with "Inkludera barn" that one of its parents is in.
export default function ChildForm({ child, onSaved, onCancel }) {
    const { user } = useAuth();

    const [name, setName] = useState(child?.name ?? "");

    // Parents ({ id, username, name }), saved as usernames. When creating, I'm always a parent and can add one co-parent.
    // Someone added by username (not among my groups' members) gets the id "u:<username>".
    const [parents, setParents] = useState(() =>
        child
            ? child.parents.map((p) => ({ id: p.id, username: p.username, name: p.name }))
            : [{ id: user.id, username: user.username, name: user.name, avatarIcon: user.avatarIcon, avatarColor: user.avatarColor }]
    );
    const [newParent, setNewParent] = useState("");
    const [byUsername, setByUsername] = useState(false); // "Hittar du inte den du söker?": type a username instead

    // Who can be picked: the grown-ups in my groups, plus the parents already chosen
    const myGroups = useFetch("/groups");
    const groupIds = (myGroups.data?.data ?? []).map((g) => g.id).sort((a, b) => a - b).join(",");
    const members = useFetch(groupIds ? `/groups/members?ids=${groupIds}` : null);
    const people = [];
    for (const p of [...parents, ...(members.data?.data ?? []).filter((m) => !m.isChild)]) {
        if (!people.some((x) => x.username === p.username)) people.push(p);
    }
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    function addParent() {
        const username = newParent.trim().replace(/^@/, "").toLowerCase();
        if (!username) return;
        if (parents.some((p) => p.username === username)) {
            setError("Den personen är redan förälder");
            return;
        }
        // Someone in my groups: the real person (with name and avatar)
        const known = people.find((p) => p.username === username);
        setParents([...parents, known ?? { id: `u:${username}`, username, name: null }]);
        setNewParent("");
        setByUsername(false);
        setError(null);
    }

    // From the picker: the chosen ids, in order. Removing myself asks first.
    function changeParents(ids) {
        if (parents.some((p) => p.id === user.id) && !ids.includes(user.id)) {
            if (!window.confirm("Ta bort dig själv som förälder? Du kommer inte längre att kunna hantera barnet.")) return;
        }
        setParents(ids.map((id) => people.find((p) => p.id === id)).filter(Boolean).slice(0, 2));
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
            </label>

            <fieldset className="fieldset">
                <legend>
                    Föräldrar{" "}
                    {/* Groups aren't chosen - the child follows its parents */}
                    <InfoTip label="Vilka grupper kommer barnet med i?">
                        Barnet kommer med automatiskt i alla grupper med <strong>Inkludera barn</strong> som någon av
                        föräldrarna är med i.
                    </InfoTip>
                </legend>
                <p className="muted small parent-hint">
                    Ett barn kan ha en eller två föräldrar. Medföräldern behöver inte vara med i någon grupp.
                </p>
                <PeoplePicker
                    bare
                    compact
                    max={2}
                    legend="Föräldrar"
                    people={people}
                    selected={parents.map((p) => p.id)}
                    onChange={changeParents}
                    // When creating I'm always a parent. Later anyone can be removed, as long as one remains.
                    lockedIds={isNew ? [user.id] : parents.length === 1 ? [parents[0].id] : []}
                    onNotFound={() => setByUsername(true)}
                />
                {/* A co-parent who isn't in any of my groups: by their username */}
                {byUsername && canAddParent && (
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
                            autoFocus
                        />
                        <button type="button" className="btn" onClick={addParent}>
                            <Plus size={16} className="icon-lead" aria-hidden="true" /> Lägg till
                        </button>
                    </div>
                )}
            </fieldset>

            <ErrorMessage message={error} />

            <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                    {isNew ? <Plus size={16} className="icon-lead" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                    {busy ? "Sparar…" : isNew ? "Lägg till barn" : "Spara"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
                    Avbryt
                </button>
            </div>
        </form>
    );
}
