import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ChildForm from "../components/ChildForm.jsx";
import { Baby, Plus } from "lucide-react";

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
    const [mode, setMode] = useState(null); // "new" | child id being edited
    const [actionError, setActionError] = useState(null);
    const [busy, setBusy] = useState(false);

    if (!children.data && children.loading) return <Loading />;
    if (!children.data) return <ErrorMessage message={children.error} onRetry={children.reload} />;

    function saved() {
        setMode(null);
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
                        {children.data.data.map((child) =>
                            mode === child.id ? (
                                <div key={child.id} className="card card-wide">
                                    <ChildForm child={child} onSaved={saved} onCancel={() => setMode(null)} />
                                </div>
                            ) : (
                                <div key={child.id} className="card">
                                    <div className="card-top">
                                        <h3>{child.name}</h3>
                                        <span className="badge badge-gift">Barn</span>
                                    </div>
                                    <p className="muted small">Föräldrar: {child.parents.map((p) => p.name).join(", ")}</p>
                                    <p className="muted small">
                                        Grupper: {child.groups.length > 0 ? child.groups.map((g) => g.name).join(", ") : "inga än"}
                                    </p>
                                    <p className="muted small">
                                        {child.listCount} {child.listCount === 1 ? "lista" : "listor"}
                                    </p>
                                    <div className="card-actions">
                                        <Link to={`/lists/new?for=${child.id}`} className="btn btn-small">
                                            <Plus size={16} aria-hidden="true" /> Ny lista
                                        </Link>
                                        <button type="button" className="btn btn-small btn-ghost" onClick={() => setMode(child.id)} disabled={busy}>
                                            Redigera
                                        </button>
                                        <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => remove(child)} disabled={busy}>
                                            Radera
                                        </button>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
