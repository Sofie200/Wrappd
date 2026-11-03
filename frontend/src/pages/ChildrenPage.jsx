import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ChildForm from "../components/ChildForm.jsx";
import ChildGroupsModal from "../components/ChildGroupsModal.jsx";
import ChildListsModal from "../components/ChildListsModal.jsx";
import Avatar from "../components/Avatar.jsx";
import Modal from "../components/Modal.jsx";
import SettingsMenu from "../components/SettingsMenu.jsx";
import { ArrowRight, Baby, Ellipsis, Gift, Heart, Pencil, Plus, ScrollText, Trash2, Users } from "lucide-react";

// What disappears when a child is deleted – shown in the confirmation
function deleteWarning(child) {
    const lines = [`Radera ${child.name}?`];
    if (child.listsDeletedWithChild > 0) {
        lines.push(
            `${child.listsDeletedWithChild} ${child.listsDeletedWithChild === 1 ? "lista" : "listor"} till ${child.name} raderas också` +
                (child.giftsDeletedWithChild > 0
                    ? `, med ${child.giftsDeletedWithChild} ${child.giftsDeletedWithChild === 1 ? "reserverad gåva" : "reserverade gåvor"}. Gåvorna försvinner från inköpen för dem som köpt dem.`
                    : ".")
        );
    }
    const shared = child.listCount - child.listsDeletedWithChild;
    if (shared > 0) {
        lines.push(`${child.name} tas bort som mottagare på ${shared} ${shared === 1 ? "lista" : "listor"} som även har andra mottagare.`);
    }
    lines.push("Det går inte att ångra.");
    return lines.join("\n\n");
}

export default function ChildrenPage() {
    const children = useFetch("/children");
    const [mode, setMode] = useState(null); // "new" – the form for a new child is open
    const [editing, setEditing] = useState(null); // the child being edited (modal)
    const [showing, setShowing] = useState(null); // { child, what: "lists" | "groups" } (modal)
    const [actionError, setActionError] = useState(null);
    const [busy, setBusy] = useState(false);

    if (!children.data && children.loading) return <Loading />;
    if (!children.data) return <ErrorMessage message={children.error} onRetry={children.reload} />;

    function saved() {
        setMode(null);
        setEditing(null);
        children.reload();
    }

    async function remove(child) {
        if (!window.confirm(deleteWarning(child))) return;
        setBusy(true);
        setActionError(null);
        try {
            await api(`/children/${child.id}`, { method: "DELETE" });
            children.reload();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="page">
            <div className="page-head">
                <h1 className="title-with-icon">
                    <Baby size={28} aria-hidden="true" /> Mina barn
                </h1>
                {mode !== "new" && (
                    <button type="button" className="btn btn-primary" onClick={() => setMode("new")}>
                        <Plus size={16} aria-hidden="true" /> Lägg till barn
                    </button>
                )}
            </div>
            <p className="muted">
                Barn kan inte logga in, men du kan göra listor till dem. Bara barnets föräldrar kan göra och administrera listorna.
            </p>

            <ErrorMessage message={actionError} />

            {mode === "new" && (
                <section className="panel">
                    <h2>Nytt barn</h2>
                    <ChildForm onSaved={saved} onCancel={() => setMode(null)} />
                </section>
            )}

            <section className="section">
                {children.data.data.length === 0 && mode !== "new" ? (
                    <Empty>Du har inte lagt till några barn än.</Empty>
                ) : (
                    <div className="cards">
                        {children.data.data.map((child) => (
                            <div key={child.id} className="card">
                                <div className="card-top">
                                    <h3 className="child-title">
                                        <Avatar isChild id={child.id} size={32} />
                                        {child.name}
                                    </h3>
                                    <div className="actions">
                                        <Link to={`/lists/new?for=${child.id}`} className="btn btn-small">
                                            <ScrollText size={16} aria-hidden="true" /> Ny lista
                                        </Link>
                                        <SettingsMenu label={`Alternativ för ${child.name}`} icon={Ellipsis}>
                                            <button
                                                type="button"
                                                className="menu-item"
                                                role="menuitem"
                                                onClick={() => setShowing({ child, what: "lists" })}
                                            >
                                                <Gift size={16} aria-hidden="true" /> Listor
                                            </button>
                                            <button
                                                type="button"
                                                className="menu-item"
                                                role="menuitem"
                                                onClick={() => setShowing({ child, what: "groups" })}
                                            >
                                                <Users size={16} aria-hidden="true" /> Grupper
                                            </button>
                                            <button type="button" className="menu-item" role="menuitem" onClick={() => setEditing(child)} disabled={busy}>
                                                <Pencil size={16} aria-hidden="true" /> Redigera
                                            </button>
                                            <button
                                                type="button"
                                                className="menu-item menu-item-danger"
                                                role="menuitem"
                                                onClick={() => remove(child)}
                                                disabled={busy}
                                            >
                                                <Trash2 size={16} aria-hidden="true" /> Ta bort
                                            </button>
                                        </SettingsMenu>
                                    </div>
                                </div>
                                <p className="muted small">Föräldrar: {child.parents.map((p) => p.name).join(", ")}</p>
                                <p className="muted small">
                                    {child.listCount} {child.listCount === 1 ? "lista" : "listor"}
                                </p>
                                <Link to={`/people/${child.id}/edit`} className="child-profile-link">
                                    <Heart size={16} aria-hidden="true" /> {child.name}s önskeprofil
                                    <ArrowRight size={16} aria-hidden="true" />
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {showing?.what === "lists" && <ChildListsModal child={showing.child} onClose={() => setShowing(null)} />}
            {showing?.what === "groups" && <ChildGroupsModal child={showing.child} onClose={() => setShowing(null)} />}

            {editing && (
                <Modal title={`Redigera ${editing.name}`} onClose={() => setEditing(null)}>
                    <ChildForm child={editing} onSaved={saved} onCancel={() => setEditing(null)} />
                </Modal>
            )}
        </div>
    );
}
