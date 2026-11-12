import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import Modal from "./Modal.jsx";
import UserSearch from "./UserSearch.jsx";
import CreateUserForm from "./CreateUserForm.jsx";
import UserLinkBox from "./UserLinkBox.jsx";
import { ErrorMessage } from "./Feedback.jsx";

// "Hittar du inte den du söker?" under "Vem är det vi firar?": who can be picked, and - in the list's groups
// where I'm an admin - a quick way to add someone: an existing account, or a new one (with an activation link).
// groups: the list's chosen groups ({ id, name, isAdmin }). onAdded(userId): the person is now a member.
export default function MissingPersonModal({ groups, onAdded, onClose }) {
    const adminGroups = groups.filter((g) => g.isAdmin);
    const [groupId, setGroupId] = useState(adminGroups[0]?.id ?? null);
    const [created, setCreated] = useState(null); // { user, link } - a new account, its link shown to copy
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function addExisting(member) {
        setBusy(true);
        setError(null);
        try {
            await api(`/groups/${groupId}/members`, { method: "POST", body: { userId: member.id } });
            onAdded(member.id);
            onClose();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <Modal title="Hittar du inte den du söker?" onClose={onClose}>
            {created ? (
                <>
                    <p>
                        <strong>{created.user.name}</strong> är tillagd i gruppen och vald som mottagare.
                    </p>
                    <UserLinkBox {...created} />
                    <div className="form-actions">
                        <button type="button" className="btn btn-primary" onClick={onClose}>
                            Klar
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <p className="muted">
                        Den du firar måste vara med i någon av listans grupper. Barn kommer med via sina föräldrar, om
                        gruppen inkluderar barn - ett eget barn lägger du till under <Link to="/children">Mina barn</Link>.
                    </p>

                    {adminGroups.length === 0 ? (
                        <p className="muted">
                            Du är inte admin i {groups.length === 1 ? "gruppen" : "någon av grupperna"}, så be en admin
                            lägga till personen. Sen dyker hen upp här.
                        </p>
                    ) : (
                        <>
                            <h3 className="subhead">Lägg till en ny medlem</h3>
                            {adminGroups.length > 1 && (
                                <label className="field">
                                    <span>Grupp</span>
                                    <select value={groupId} onChange={(e) => setGroupId(Number(e.target.value))} disabled={busy}>
                                        {adminGroups.map((g) => (
                                            <option key={g.id} value={g.id}>
                                                {g.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}

                            <p className="muted small">
                                Har personen redan ett konto? Personer i dina grupper dyker upp medan du skriver. Andra
                                hittar du genom att skriva hela användarnamnet och trycka på Sök.
                            </p>
                            {/* key: a new group starts a fresh search (it hides that group's members) */}
                            <UserSearch key={groupId} excludeGroupId={groupId} onSelect={addExisting} busy={busy} />
                            <ErrorMessage message={error} />

                            <h3 className="subhead">Eller skapa en ny användare</h3>
                            <CreateUserForm
                                groupId={groupId}
                                onCreated={(result) => {
                                    onAdded(result.user.id);
                                    setCreated(result);
                                }}
                            />
                        </>
                    )}
                </>
            )}
        </Modal>
    );
}
