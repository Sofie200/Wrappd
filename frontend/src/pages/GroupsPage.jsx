import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import { ArrowRight, Baby, Plus, ScrollText, Users } from "lucide-react";
import Avatar from "../components/Avatar.jsx";
import InfoTip from "../components/InfoTip.jsx";

export default function GroupsPage() {
    const navigate = useNavigate();
    const { data, error, loading, reload } = useFetch("/groups");
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

            <section className="section panel">
                <h2>Skapa en grupp</h2>
                <form onSubmit={handleCreate} className="create-group-form">
                    <ErrorMessage message={createError} />
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="T.ex. Familjen eller Jobbet"
                        aria-label="Gruppens namn"
                        maxLength={80}
                        required
                    />
                    {/* The checkbox, with the button beside it */}
                    <div className="create-group-row">
                        <div className="check-field">
                            <label className="check">
                                <input
                                    type="checkbox"
                                    checked={includeChildren}
                                    onChange={(e) => setIncludeChildren(e.target.checked)}
                                    disabled={busy}
                                />
                                Inkludera barn
                            </label>
                            {/* Outside the label: a button inside it would take over as the label's control */}
                            <InfoTip label="Om att inkludera barn">
                                Alla medlemmars barn kommer då med automatiskt. Kan ändras senare.
                            </InfoTip>
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            <Plus size={16} className="icon-lead" aria-hidden="true" />
                            {busy ? "Skapar…" : "Skapa"}
                        </button>
                    </div>
                </form>
            </section>

            <section className="section">
                {!data && loading && <Loading />}
                {!data && <ErrorMessage message={error} onRetry={reload} />}
                {data && data.data.length === 0 && <Empty>Allt blir roligare tillsammans! Skapa en grupp för familjen eller vännerna ovan - eller be någon bjuda in dig.</Empty>}
                {data && data.data.length > 0 && (
                    <div className="cards">
                        {data.data.map((group) => {
                            const preview = group.memberPreview ?? [];
                            const more = group.memberCount - preview.length;
                            return (
                                <Link
                                    key={group.id}
                                    to={`/groups/${group.id}`}
                                    className="card card-link group-card"
                                >
                                    <div className="group-card-head">
                                        <div className="group-card-title">
                                            <h3>{group.name}</h3>
                                            <div className="badges">
                                                {group.isAdmin && <span className="badge">Admin</span>}
                                                {group.includeChildren && (
                                                    <span className="badge badge-gift">
                                                        <Baby size={12} aria-hidden="true" /> Inkl. barn
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ArrowRight size={18} className="group-card-arrow" aria-hidden="true" />
                                    </div>

                                    <div className="group-card-foot">
                                        <div className="avatar-stack">
                                            <span className="visually-hidden">
                                                {group.memberCount} {group.memberCount === 1 ? "medlem" : "medlemmar"}
                                            </span>
                                            {preview.map((m) =>
                                                m.isChild ? (
                                                    <Avatar key={m.id} isChild id={m.id} size={30} />
                                                ) : (
                                                    <Avatar key={m.id} icon={m.avatarIcon} color={m.avatarColor} size={30} />
                                                )
                                            )}
                                            {more > 0 && <span className="avatar-stack-more">+{more}</span>}
                                        </div>
                                        <span className="group-card-stat">
                                            <ScrollText size={14} aria-hidden="true" />
                                            {group.activeListCount} {group.activeListCount === 1 ? "aktuell lista" : "aktuella listor"}
                                        </span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
