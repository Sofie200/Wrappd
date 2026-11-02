import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import { joinNames } from "../format.js";
import { Users } from "lucide-react";

export default function GroupsPage() {
    const navigate = useNavigate();
    const { data, error, loading, reload } = useFetch("/groups");
    const children = useFetch("/children");
    const myChildren = children.data?.data ?? [];
    const [name, setName] = useState("");
    const [includeChildren, setIncludeChildren] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function handleCreate(e) {
        e.preventDefault();
        setBusy(true);
        setCreateError(null);
        try {
            const { id } = await api("/groups", { method: "POST", body: { name, includeChildren } });
            navigate(`/groups/${id}`);
        } catch (err) {
            setCreateError(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="page">
            <h1 className="title-with-icon">
                <Users size={28} aria-hidden="true" /> Mina grupper
            </h1>

            <section className="section">
                {!data && loading && <Loading />}
                {!data && <ErrorMessage message={error} onRetry={reload} />}
                {data && data.data.length === 0 && <Empty>Du är inte med i någon grupp än. Skapa en nedan.</Empty>}
                {data && data.data.length > 0 && (
                    <div className="cards">
                        {data.data.map((group) => (
                            <Link key={group.id} to={`/groups/${group.id}`} className="card card-link">
                                <div className="card-top">
                                    <h3>{group.name}</h3>
                                    {group.isAdmin && <span className="badge">Admin</span>}
                                </div>
                                <p className="muted">
                                    {group.memberCount} {group.memberCount === 1 ? "medlem" : "medlemmar"}
                                </p>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            <section className="section panel">
                <h2>Skapa en grupp</h2>
                <p className="muted">Du blir admin och kan lägga till andra.</p>
                <form onSubmit={handleCreate} className="create-group-form">
                    <ErrorMessage message={createError} />
                    <div className="inline-form">
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="T.ex. Familjen eller Jobbet"
                            aria-label="Gruppens namn"
                            maxLength={80}
                            required
                        />
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            {busy ? "Skapar…" : "Skapa"}
                        </button>
                    </div>
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
                        Alla medlemmars barn kommer då med automatiskt
                        {myChildren.length > 0 && <> – dina ({joinNames(myChildren.map((c) => c.name))}) direkt</>}. Utan det
                        kan inga barn vara med i gruppen. Det går inte att ändra efteråt.
                    </small>
                </form>
            </section>
        </div>
    );
}
