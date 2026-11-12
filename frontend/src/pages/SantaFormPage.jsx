import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Shuffle, HatGlasses } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import Avatar from "../components/Avatar.jsx";
import { todayIso } from "../format.js";

const MIN_PARTICIPANTS = 3;

// /santa/new - pick a group, a date and who takes part, then draw.
// Everyone gets someone else; only you will ever see who you got.
export default function SantaFormPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const groups = useFetch("/groups");

    const [groupId, setGroupId] = useState(searchParams.get("group") ?? "");
    const group = useFetch(groupId ? `/groups/${groupId}` : null);
    const [title, setTitle] = useState("Secret Santa");
    const [date, setDate] = useState("");
    const [budget, setBudget] = useState("");
    const [memberIds, setMemberIds] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // Only adults can take part - children can't log in to see who they got
    const adults = (group.data?.members ?? []).filter((m) => !m.isChild);

    // A new group: everyone is in from the start
    useEffect(() => {
        setMemberIds(adults.map((m) => m.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [group.data]);

    if (!groups.data && groups.loading) return <Loading />;
    if (!groups.data) return <ErrorMessage message={groups.error} onRetry={groups.reload} />;

    function toggle(id) {
        setMemberIds(memberIds.includes(id) ? memberIds.filter((x) => x !== id) : [...memberIds, id]);
    }

    async function draw(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api("/santas", {
                method: "POST",
                body: { groupId: Number(groupId), title, date, budget, memberIds },
            });
            navigate("/");
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    const tooFew = memberIds.length < MIN_PARTICIPANTS;

    return (
        <div className="page page-narrow">
            <h1 className="title-with-icon">
                <HatGlasses size={28} aria-hidden="true" /> Secret Santa
            </h1>
            <p className="muted">
                Alla som är med lottas till någon annan. Var och en ser bara vem de själva ska ge till - inte ens du
                som lottar ser de andras.
            </p>

            {groups.data.data.length === 0 ? (
                <Empty>
                    Secret Santa behöver deltagare! <Link to="/groups">Skapa en grupp</Link> först, så kan ni dra lott
                    tillsammans.
                </Empty>
            ) : (
                <form className="form" onSubmit={draw}>
                    <label className="field">
                        <span>Grupp</span>
                        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required disabled={busy}>
                            <option value="">Välj en grupp</option>
                            {groups.data.data.map((g) => (
                                <option key={g.id} value={g.id}>
                                    {g.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="field">
                        <span>Namn</span>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} disabled={busy} />
                    </label>

                    <div className="field-row">
                        <label className="field">
                            <span>Datum</span>
                            <input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} required disabled={busy} />
                            <small>När gåvorna ska ges.</small>
                        </label>
                        <label className="field">
                            <span>Budget (kr)</span>
                            <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="Valfritt, t.ex. 300" disabled={busy} />
                            <small>Ungefär vad varje gåva får kosta.</small>
                        </label>
                    </div>

                    {groupId && (
                        <fieldset className="fieldset">
                            <legend>Vilka är med?</legend>
                            {!group.data ? (
                                group.loading ? <Loading /> : <ErrorMessage message={group.error} onRetry={group.reload} />
                            ) : (
                                <>
                                    <div className="checks">
                                        {adults.map((m) => (
                                            <label key={m.id} className="check">
                                                <input type="checkbox" checked={memberIds.includes(m.id)} onChange={() => toggle(m.id)} disabled={busy} />
                                                <Avatar icon={m.avatarIcon} color={m.avatarColor} size={26} />
                                                <span>
                                                    {m.name}
                                                    {m.id === user.id && <span className="muted"> (du)</span>}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className={`small${tooFew ? " field-error" : " muted"}`}>
                                        {memberIds.length} valda
                                        {tooFew && ` - minst ${MIN_PARTICIPANTS} behövs, annars vet alla vem som fick vem.`}
                                    </p>
                                </>
                            )}
                        </fieldset>
                    )}

                    <ErrorMessage message={error} />

                    <div className="form-actions">
                        <button type="submit" className="btn btn-primary" disabled={busy || !group.data || tooFew}>
                            <Shuffle size={16} aria-hidden="true" /> {busy ? "Lottar…" : "Lotta"}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => navigate("/")} disabled={busy}>
                            Avbryt
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
