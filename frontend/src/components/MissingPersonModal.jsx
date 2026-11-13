import { useState } from "react";
import { api } from "../api.js";
import Modal from "./Modal.jsx";
import UserSearch from "./UserSearch.jsx";
import CreateUserForm, { CREATE_USER_INTRO } from "./CreateUserForm.jsx";
import UserLinkBox from "./UserLinkBox.jsx";
import { ErrorMessage } from "./Feedback.jsx";
import Select from "./Select.jsx";
import InfoTip from "./InfoTip.jsx";

// "Hittar du inte den du söker?" under "Vem är det vi firar?": who can be picked, and - in the list's groups
// where I'm an admin - a quick way to add someone: an existing account, or a new one (with an activation link).
// groups: the list's chosen groups ({ id, name, isAdmin }). onAdded(userId): the person is now a member.
export default function MissingPersonModal({ groups, onAdded, onClose }) {
    const adminGroups = groups.filter((g) => g.isAdmin);
    const [groupId, setGroupId] = useState(adminGroups[0]?.id ?? null);
    const [created, setCreated] = useState(null); // { user, link } - a new account, its link shown to copy
    const [picked, setPicked] = useState(null); // someone found in the search - the group is chosen after that
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function addExisting(member) {
        if (!member) return;
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
                        Den du firar måste vara med i någon av dina grupper. Barn kan bara vara med i grupper som minst en
                        förälder är med i.
                    </p>

                    {adminGroups.length === 0 ? (
                        <p className="muted">
                            Du är inte admin i {groups.length === 1 ? "gruppen" : "någon av grupperna"}, så be en admin
                            lägga till personen. Sen dyker hen upp här.
                        </p>
                    ) : (
                        <>
                            <h3 className="subhead subhead-divided">
                                Lägg till en ny medlem{" "}
                                <InfoTip label="Hur hittar jag någon?">
                                    Har personen redan ett konto? Personer i dina grupper dyker upp medan du skriver. Andra
                                    hittar du genom att skriva hela användarnamnet och trycka på Sök.
                                </InfoTip>
                            </h3>

                            {picked ? (
                                // Found someone: now which group they join
                                <div className="picked-person">
                                    <p>
                                        Lägg till <strong>{picked.name}</strong>
                                        {adminGroups.length === 1 ? <> i {adminGroups[0].name}</> : " i gruppen:"}
                                    </p>
                                    {adminGroups.length > 1 && (
                                        <Select
                                        label="Grupp"
                                        value={groupId}
                                        onChange={(v) => setGroupId(Number(v))}
                                        options={adminGroups.map((g) => ({ value: g.id, label: g.name }))}
                                        disabled={busy}
                                    />
                                    )}
                                    <div className="form-actions">
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => addExisting(picked)}
                                            disabled={busy}
                                        >
                                            {busy ? "Lägger till…" : "Lägg till"}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => {
                                                setPicked(null);
                                                setError(null);
                                            }}
                                            disabled={busy}
                                        >
                                            Sök igen
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <UserSearch onSelect={setPicked} busy={busy} />
                            )}
                            <ErrorMessage message={error} />

                            <h3 className="subhead subhead-divided">
                                Eller skapa en ny användare{" "}
                                <InfoTip label="Vad händer när jag skapar en användare?">{CREATE_USER_INTRO}</InfoTip>
                            </h3>
                            <CreateUserForm
                                hideIntro
                                groupId={groupId}
                                // The group is picked last - once name and username are filled in
                                groupPicker={
                                    adminGroups.length > 1 && (
                                        <div className="field">
                                            <span>Grupp</span>
                                            <Select
                                                label="Grupp"
                                                value={groupId}
                                                onChange={(v) => setGroupId(Number(v))}
                                                options={adminGroups.map((g) => ({ value: g.id, label: g.name }))}
                                                disabled={busy}
                                            />
                                        </div>
                                    )
                                }
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
