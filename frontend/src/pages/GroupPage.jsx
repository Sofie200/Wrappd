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

export default function GroupPage() {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { data, error, loading, reload } = useFetch(`/groups/${id}`);
    const [actionError, setActionError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [newName, setNewName] = useState("");
    const [shownLink, setShownLink] = useState(null); // { user, link } – a link to copy and send

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

    function rename(e) {
        e.preventDefault();
        run(async () => {
            await api(`/groups/${id}`, { method: "PATCH", body: { name: newName } });
            setRenaming(false);
        });
    }

    const lastAdmin = me.isAdmin && adminCount === 1;

    return (
        <div className="page">
            <div className="page-head">
                {renaming ? (
                    <form onSubmit={rename} className="inline-form">
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            aria-label="Gruppens namn"
                            maxLength={80}
                            required
                            autoFocus
                        />
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            Spara
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => setRenaming(false)}>
                            Avbryt
                        </button>
                    </form>
                ) : (
                    <h1>{group.name}</h1>
                )}

                <div className="actions">
                    {me.isAdmin && !renaming && (
                        <button
                            type="button"
                            className="btn btn-small btn-ghost"
                            onClick={() => {
                                setNewName(group.name);
                                setRenaming(true);
                            }}
                        >
                            Byt namn
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        onClick={leave}
                        disabled={busy || lastAdmin}
                        title={lastAdmin ? "Gör någon annan till admin innan du lämnar" : undefined}
                    >
                        Lämna gruppen
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
                <h2>Medlemmar ({members.length})</h2>
                {shownLink && <UserLinkBox {...shownLink} onClose={() => setShownLink(null)} />}
                <ul className="member-list">
                    {members.map((member) => {
                        const isMe = member.id === user.id;
                        const onlyAdmin = member.isAdmin && adminCount === 1;

                        // Children are managed by their parents (Mina barn) – no admin actions here
                        if (member.isChild) {
                            return (
                                <li key={member.id}>
                                    <span>
                                        {member.name} <span className="badge badge-gift">Barn</span>
                                        {member.parents && <span className="muted small"> · Föräldrar: {member.parents}</span>}
                                    </span>
                                </li>
                            );
                        }

                        return (
                            <li key={member.id}>
                                <span>
                                    {member.name} <span className="muted">@{member.username}</span>
                                    {isMe && <span className="muted"> (du)</span>}
                                    {member.isAdmin && <span className="badge">Admin</span>}
                                    {!member.isActivated && <span className="badge badge-private">Ej aktiverad</span>}
                                </span>

                                {me.isAdmin && (
                                    <span className="member-actions">
                                        {!isMe && (
                                            <button
                                                type="button"
                                                className="btn btn-small btn-ghost"
                                                onClick={() => makeLink(member)}
                                                disabled={busy}
                                            >
                                                {member.isActivated ? "Återställ lösenord" : "Ny länk"}
                                            </button>
                                        )}
                                        {member.isAdmin ? (
                                            <button
                                                type="button"
                                                className="btn btn-small btn-ghost"
                                                onClick={() => setAdmin(member, false)}
                                                disabled={busy || onlyAdmin}
                                                title={onlyAdmin ? "Gruppen måste ha minst en admin" : undefined}
                                            >
                                                Ta bort som admin
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn btn-small btn-ghost"
                                                onClick={() => setAdmin(member, true)}
                                                disabled={busy}
                                            >
                                                Gör till admin
                                            </button>
                                        )}
                                        {!isMe && (
                                            <button
                                                type="button"
                                                className="btn btn-small btn-danger-ghost"
                                                onClick={() => removeMember(member)}
                                                disabled={busy || onlyAdmin}
                                            >
                                                Ta bort
                                            </button>
                                        )}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>

            {me.isAdmin && (
                <section className="section panel">
                    <h2>Lägg till medlem</h2>
                    <p className="muted small">Har personen redan ett konto? Sök på namn eller användarnamn.</p>
                    <UserSearch excludeGroupId={group.id} onSelect={addMember} busy={busy} />

                    <h3 className="subhead">Eller skapa en ny användare</h3>
                    <CreateUserForm
                        groupId={group.id}
                        onCreated={(result) => {
                            setShownLink(result);
                            reload();
                            // Scroll to the link, so it isn't missed
                            setTimeout(() => {
                                document.getElementById("user-link")?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }, 0);
                        }}
                    />
                </section>
            )}
        </div>
    );
}
