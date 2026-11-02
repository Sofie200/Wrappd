import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ListCard from "../components/ListCard.jsx";
import UserSearch from "../components/UserSearch.jsx";
import CreateUserForm from "../components/CreateUserForm.jsx";
import UserLinkBox from "../components/UserLinkBox.jsx";
import Avatar from "../components/Avatar.jsx";
import { Ellipsis, KeyRound, Link2, LogOut, Pencil, ShieldCheck, ShieldOff, UserMinus, UserPlus, Users } from "lucide-react";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import Modal from "../components/Modal.jsx";
import GroupSettingsModal from "../components/GroupSettingsModal.jsx";
import SettingsMenu from "../components/SettingsMenu.jsx";

export default function GroupPage() {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { data, error, loading, reload } = useFetch(`/groups/${id}`);
    const [actionError, setActionError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [editingSettings, setEditingSettings] = useState(false); // the group settings modal
    const [shownLink, setShownLink] = useState(null); // { user, link } – a link to copy and send
    const [addingMember, setAddingMember] = useState(false); // the "add member" modal

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { group, me, members, lists } = data;
    const adminCount = members.filter((m) => m.isAdmin).length;

    // Runs a change, shows any error, and reloads the group
    async function run(action) {
        setBusy(true);
        setActionError(null);
        try {
            await action();
            reload();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const addMember = (member) =>
        run(() => api(`/groups/${id}/members`, { method: "POST", body: { userId: member.id } }));

    const setAdmin = (member, isAdmin) =>
        run(() => api(`/groups/${id}/members/${member.id}`, { method: "PATCH", body: { isAdmin } }));

    function removeMember(member) {
        if (!window.confirm(`Ta bort ${member.name} ur gruppen?`)) return;
        run(() => api(`/groups/${id}/members/${member.id}`, { method: "DELETE" }));
    }

    // Not activated: a new activation link. Activated: a link to choose a new password.
    async function makeLink(member) {
        if (
            member.isActivated &&
            !window.confirm(
                `Skapa en länk där ${member.name} kan välja ett nytt lösenord?\n\nDet nuvarande lösenordet fungerar tills länken används.`
            )
        ) {
            return;
        }
        setBusy(true);
        setActionError(null);
        try {
            setShownLink(await api(`/groups/${id}/members/${member.id}/link`, { method: "POST" }));
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function leave() {
        if (!window.confirm(`Vill du lämna ${group.name}?`)) return;
        setBusy(true);
        setActionError(null);
        try {
            await api(`/groups/${id}/members/${user.id}`, { method: "DELETE" });
            navigate("/groups");
        } catch (err) {
            setActionError(err.message);
            setBusy(false);
        }
    }

    const lastAdmin = me.isAdmin && adminCount === 1;

    return (
        <div className="page">
            <Breadcrumbs items={[{ label: "Mina grupper", to: "/groups" }, { label: group.name }]} />
            <div className="page-head">
                <h1 className="title-with-icon">
                    <Users size={28} aria-hidden="true" /> {group.name}
                </h1>

                <div className="actions">
                    {me.isAdmin && (
                        <button
                            type="button"
                            className="icon-btn"
                            onClick={() => setEditingSettings(true)}
                            disabled={busy}
                            aria-label="Gruppens inställningar"
                            title="Redigera gruppen"
                            aria-haspopup="dialog"
                        >
                            <Pencil size={18} aria-hidden="true" />
                        </button>
                    )}
                    <button
                        type="button"
                        className="icon-btn icon-btn-danger icon-btn-danger-always"
                        onClick={leave}
                        disabled={busy || lastAdmin}
                        aria-label="Lämna gruppen"
                        title={lastAdmin ? "Gör någon annan till admin innan du lämnar" : "Lämna gruppen"}
                    >
                        <LogOut size={18} aria-hidden="true" />
                    </button>
                </div>
            </div>

            <ErrorMessage message={actionError} />

            <section className="section">
                <h2>Listor i gruppen</h2>
                {lists.length === 0 ? (
                    <Empty>Inga publika listor i gruppen än.</Empty>
                ) : (
                    <div className="cards">
                        {lists.map((list) => (
                            <ListCard key={list.id} list={list} />
                        ))}
                    </div>
                )}
            </section>

            <section className="section">
                <div className="section-head">
                    <h2>
                    Medlemmar ({members.length})
                    {group.includeChildren ? (
                        <span className="badge badge-gift">Inkl. barn</span>
                    ) : (
                        <span className="badge">Utan barn</span>
                    )}
                </h2>
                    {me.isAdmin && (
                        <button type="button" className="btn btn-small" onClick={() => setAddingMember(true)} disabled={busy}>
                            <UserPlus size={16} aria-hidden="true" /> Lägg till ny medlem
                        </button>
                    )}
                </div>
                {shownLink && <UserLinkBox {...shownLink} onClose={() => setShownLink(null)} />}
                <ul className="member-list">
                    {members.map((member) => {
                        const isMe = member.id === user.id;
                        const onlyAdmin = member.isAdmin && adminCount === 1;

                        // Children are managed by their parents (Mina barn) – no admin actions here
                        if (member.isChild) {
                            return (
                                <li key={member.id}>
                                    <span className="member-name">
                                        <Avatar isChild id={member.id} size={32} />
                                        {member.name} <span className="badge badge-gift">Barn</span>
                                        {member.parents && <span className="muted small"> · Föräldrar: {member.parents}</span>}
                                    </span>
                                </li>
                            );
                        }

                        return (
                            <li key={member.id}>
                                <span className="member-name">
                                    <Avatar icon={member.avatarIcon} color={member.avatarColor} size={32} />
                                    {member.name} <span className="muted">@{member.username}</span>
                                    {isMe && <span className="muted"> (du)</span>}
                                    {member.isAdmin && <span className="badge">Admin</span>}
                                    {!member.isActivated && <span className="badge badge-private">Ej aktiverad</span>}
                                </span>

                                {me.isAdmin && (
                                    <SettingsMenu label={`Alternativ för ${member.name}`} icon={Ellipsis}>
                                        {!isMe && (
                                            <button
                                                type="button"
                                                className="menu-item"
                                                role="menuitem"
                                                onClick={() => makeLink(member)}
                                                disabled={busy}
                                            >
                                                {member.isActivated ? (
                                                    <>
                                                        <KeyRound size={16} aria-hidden="true" /> Återställ lösenord
                                                    </>
                                                ) : (
                                                    <>
                                                        <Link2 size={16} aria-hidden="true" /> Ny länk
                                                    </>
                                                )}
                                            </button>
                                        )}
                                        {member.isAdmin ? (
                                            <button
                                                type="button"
                                                className="menu-item"
                                                role="menuitem"
                                                onClick={() => setAdmin(member, false)}
                                                disabled={busy || onlyAdmin}
                                                title={onlyAdmin ? "Gruppen måste ha minst en admin" : undefined}
                                            >
                                                <ShieldOff size={16} aria-hidden="true" /> Ta bort som admin
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="menu-item"
                                                role="menuitem"
                                                onClick={() => setAdmin(member, true)}
                                                disabled={busy}
                                            >
                                                <ShieldCheck size={16} aria-hidden="true" /> Gör till admin
                                            </button>
                                        )}
                                        {!isMe && (
                                            <button
                                                type="button"
                                                className="menu-item menu-item-danger"
                                                role="menuitem"
                                                onClick={() => removeMember(member)}
                                                disabled={busy || onlyAdmin}
                                            >
                                                <UserMinus size={16} aria-hidden="true" /> Ta bort ur gruppen
                                            </button>
                                        )}
                                    </SettingsMenu>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>

            {editingSettings && (
                <GroupSettingsModal
                    group={group}
                    onSaved={() => {
                        setEditingSettings(false);
                        reload();
                    }}
                    onClose={() => setEditingSettings(false)}
                />
            )}

            {addingMember && (
                <Modal title="Lägg till medlem" onClose={() => setAddingMember(false)}>
                    <p className="muted small">Har personen redan ett konto? Sök på namn eller användarnamn.</p>
                    <UserSearch
                        excludeGroupId={group.id}
                        onSelect={(member) => {
                            setAddingMember(false);
                            addMember(member);
                        }}
                        busy={busy}
                    />

                    <h3 className="subhead">Eller skapa en ny användare</h3>
                    <CreateUserForm
                        groupId={group.id}
                        onCreated={(result) => {
                            setAddingMember(false);
                            setShownLink(result);
                            reload();
                            // Scroll to the link, so it isn't missed
                            setTimeout(() => {
                                document.getElementById("user-link")?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }, 0);
                        }}
                    />
                </Modal>
            )}
        </div>
    );
}
