import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ListPanelCard from "../components/ListPanelCard.jsx";
import Pagination from "../components/Pagination.jsx";
import UserSearch from "../components/UserSearch.jsx";
import CreateUserForm from "../components/CreateUserForm.jsx";
import UserLinkBox from "../components/UserLinkBox.jsx";
import Avatar from "../components/Avatar.jsx";
import { Archive, Ellipsis, KeyRound, ScrollText, Link2, LogOut, Pencil, ShieldCheck, ShieldOff, UserMinus, UserPlus, Users } from "lucide-react";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import Modal from "../components/Modal.jsx";
import GroupSettingsModal from "../components/GroupSettingsModal.jsx";
import SettingsMenu from "../components/SettingsMenu.jsx";
import PersonLink from "../components/PersonLink.jsx";

const MEMBERS_PER_PAGE = 10;

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
    const [createdLink, setCreatedLink] = useState(null); // { user, link } for a user just created there

    function closeAddMember() {
        setAddingMember(false);
        setCreatedLink(null);
    }
    const [showArchive, setShowArchive] = useState(false); // the group's past lists instead of the current ones
    const [memberPage, setMemberPage] = useState(0); // the members are shown MEMBERS_PER_PAGE at a time

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { group, me, members, lists } = data;
    const memberPageCount = Math.max(1, Math.ceil(members.length / MEMBERS_PER_PAGE));
    const page = Math.min(memberPage, memberPageCount - 1); // e.g. after someone was removed from the last page
    const shownMembers = members.slice(page * MEMBERS_PER_PAGE, (page + 1) * MEMBERS_PER_PAGE);
    const archivedLists = lists.filter((l) => l.archived).reverse(); // most recent first
    const currentLists = lists.filter((l) => !l.archived);
    const shownLists = showArchive ? archivedLists : currentLists;
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
            {/* The group's name with a "…" menu right after it: edit (admins) and leave */}
            <div className="title-row">
                <h1 className="title-with-icon">
                    <Users size={28} aria-hidden="true" /> {group.name}
                </h1>
                <SettingsMenu label="Alternativ för gruppen" icon={Ellipsis}>
                    {me.isAdmin && (
                        <button
                            type="button"
                            className="menu-item"
                            role="menuitem"
                            onClick={() => setEditingSettings(true)}
                            disabled={busy}
                        >
                            <Pencil size={16} aria-hidden="true" /> Redigera gruppen
                        </button>
                    )}
                    <button
                        type="button"
                        className="menu-item menu-item-danger"
                        role="menuitem"
                        onClick={leave}
                        disabled={busy || lastAdmin}
                        title={lastAdmin ? "Gör någon annan till admin innan du lämnar" : undefined}
                    >
                        <LogOut size={16} aria-hidden="true" /> Lämna gruppen
                    </button>
                </SettingsMenu>
            </div>

            <ErrorMessage message={actionError} />

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
                <ul className="member-list">
                    {shownMembers.map((member) => {
                        const isMe = member.id === user.id;
                        const onlyAdmin = member.isAdmin && adminCount === 1;

                        // Children are managed by their parents (Mina barn) – no admin actions here
                        if (member.isChild) {
                            return (
                                <li key={member.id}>
                                    <span className="member-name">
                                        <Avatar isChild id={member.id} size={32} />
                                        <PersonLink person={member} /> <span className="badge badge-gift">Barn</span>
                                        {member.parents && <span className="muted small"> · Föräldrar: {member.parents}</span>}
                                    </span>
                                </li>
                            );
                        }

                        return (
                            <li key={member.id}>
                                <span className="member-name">
                                    <Avatar icon={member.avatarIcon} color={member.avatarColor} size={32} />
                                    <PersonLink person={member} /> <span className="muted">({member.username})</span>
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
                                {/* The link right under the member it's for, so there's no scrolling up */}
                                {shownLink?.user.id === member.id && (
                                    <UserLinkBox {...shownLink} onClose={() => setShownLink(null)} />
                                )}
                            </li>
                        );
                    })}
                </ul>
                <Pagination page={page} pageCount={memberPageCount} onChange={setMemberPage} label="Sidor med medlemmar" />
            </section>

            <section className="section">
                <div className="section-head">
                    <h2>{showArchive ? "Arkiverade listor i gruppen" : "Listor i gruppen"}</h2>
                    {/* The archive is shown here, in place of the current lists */}
                    <button type="button" className="btn btn-ghost" onClick={() => setShowArchive(!showArchive)}>
                        {showArchive ? (
                            <>
                                <ScrollText size={16} aria-hidden="true" /> Aktuella listor{currentLists.length > 0 && ` (${currentLists.length})`}
                            </>
                        ) : (
                            <>
                                <Archive size={16} aria-hidden="true" /> Arkiv{archivedLists.length > 0 && ` (${archivedLists.length})`}
                            </>
                        )}
                    </button>
                </div>
                {shownLists.length === 0 ? (
                    <Empty>{showArchive ? "Inga arkiverade listor i gruppen." : "Inga publika listor i gruppen än."}</Empty>
                ) : (
                    <div className="cards list-cards">
                        {shownLists.map((list) => (
                            <ListPanelCard key={list.id} list={list} />
                        ))}
                    </div>
                )}
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
                <Modal title="Lägg till medlem" onClose={closeAddMember}>
                    {createdLink ? (
                        // Just created: the link to send them, right here (the modal's X closes it)
                        <UserLinkBox {...createdLink} />
                    ) : (
                        <>
                            <p className="muted small">
                                Har personen redan ett konto? Personer i dina grupper dyker upp medan du skriver. Andra
                                hittar du genom att skriva hela användarnamnet och trycka på Sök.
                            </p>
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
                                    setCreatedLink(result);
                                    reload();
                                }}
                            />
                        </>
                    )}
                </Modal>
            )}
        </div>
    );
}
