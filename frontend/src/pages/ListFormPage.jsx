import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import PeoplePicker from "../components/PeoplePicker.jsx";
import { todayIso } from "../format.js";

// Create a new list (/lists/new) or edit one (/lists/:id/edit)
export default function ListFormPage() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const { user } = useAuth();
    const navigate = useNavigate();

    const myGroups = useFetch("/groups");
    const existing = useFetch(isEdit ? `/lists/${id}` : null);

    const [form, setForm] = useState(() =>
        isEdit
            ? null // filled in when the list has loaded
            : { title: "", description: "", endDate: "", groupIds: [], recipientIds: [], adminIds: [user.id] }
    );
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    // Edit: fill the form once, from the loaded list
    useEffect(() => {
        if (form || !existing.data) return;
        const { list, groups, admins, recipients } = existing.data;
        setForm({
            title: list.title,
            description: list.description ?? "",
            endDate: list.endDate,
            groupIds: groups.map((g) => g.id),
            recipientIds: recipients.map((u) => u.id),
            adminIds: admins.map((u) => u.id),
        });
    }, [existing.data, form]);

    // Everyone in the chosen groups – recipients and admins are picked among them
    const idsKey = form ? [...form.groupIds].sort((a, b) => a - b).join(",") : "";
    const candidates = useFetch(idsKey ? `/groups/members?ids=${idsKey}` : null);

    if (myGroups.error) return <ErrorMessage message={myGroups.error} onRetry={myGroups.reload} />;
    if (existing.error) return <ErrorMessage message={existing.error} onRetry={existing.reload} />;
    if (!myGroups.data || !form) return <Loading />;

    if (isEdit && !existing.data.me.canEdit) {
        return (
            <div className="page">
                <Notice>Listan kan inte ändras – den är arkiverad, eller så är du inte admin för den.</Notice>
                <Link to={`/lists/${id}`}>Tillbaka till listan</Link>
            </div>
        );
    }

    if (!isEdit && myGroups.data.data.length === 0) {
        return (
            <div className="page">
                <h1>Ny lista</h1>
                <Empty>
                    En lista hör till en eller flera grupper. <Link to="/groups">Skapa eller gå med i en grupp</Link> först.
                </Empty>
            </div>
        );
    }

    const isPublic = isEdit && existing.data.list.isPublic;
    const savedGroupIds = isEdit ? existing.data.groups.map((g) => g.id) : [];

    // My groups, plus groups already on the list that I'm not a member of (another admin added them)
    const groupOptions = [...myGroups.data.data];
    if (isEdit) {
        for (const g of existing.data.groups) {
            if (!groupOptions.some((o) => o.id === g.id)) groupOptions.push(g);
        }
    }

    const people = candidates.data?.data ?? [];
    const peopleIds = people.map((p) => p.id);
    const onlyCandidates = (ids) => ids.filter((x) => peopleIds.includes(x));

    const update = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

    function toggleGroup(groupId) {
        const { groupIds } = form;
        update("groupIds")(groupIds.includes(groupId) ? groupIds.filter((x) => x !== groupId) : [...groupIds, groupId]);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);

        // People who are no longer in any chosen group are dropped – the server would refuse them anyway
        const body = {
            title: form.title,
            description: form.description,
            endDate: form.endDate,
            groupIds: form.groupIds,
            recipientIds: onlyCandidates(form.recipientIds),
            adminIds: onlyCandidates(form.adminIds),
        };

        try {
            if (isEdit) {
                await api(`/lists/${id}`, { method: "PUT", body });
                // If I removed myself as admin, I may no longer be able to see the list
                navigate(body.adminIds.includes(user.id) ? `/lists/${id}` : "/");
            } else {
                const { id: newId } = await api("/lists", { method: "POST", body });
                navigate(`/lists/${newId}`);
            }
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="page page-narrow">
            <h1>{isEdit ? "Redigera lista" : "Ny lista"}</h1>
            {!isEdit && <p className="muted">Listan är privat tills du publicerar den. Bara listans admins ser den innan dess.</p>}

            <form onSubmit={handleSubmit} className="form">
                <label className="field">
                    <span>Titel</span>
                    <input
                        value={form.title}
                        onChange={(e) => update("title")(e.target.value)}
                        placeholder="T.ex. Sigrids 5-årskalas"
                        maxLength={120}
                        required
                    />
                </label>

                <label className="field">
                    <span>Beskrivning (valfri)</span>
                    <textarea
                        value={form.description}
                        onChange={(e) => update("description")(e.target.value)}
                        rows={3}
                        maxLength={2000}
                    />
                </label>

                <label className="field">
                    <span>Datum för eventet</span>
                    <input
                        type="date"
                        value={form.endDate}
                        min={todayIso()}
                        onChange={(e) => update("endDate")(e.target.value)}
                        required
                    />
                    <small>Dagen efter arkiveras listan och går inte längre att ändra eller reservera på.</small>
                </label>

                <fieldset className="fieldset">
                    <legend>Grupper</legend>
                    <p className="muted small">
                        {isPublic
                            ? "Listan är publik. Du kan lägga till fler grupper, men inte ta bort någon."
                            : "Medlemmarna i grupperna ser listan när den har publicerats."}
                    </p>
                    <div className="checks">
                        {groupOptions.map((group) => {
                            const locked = isPublic && savedGroupIds.includes(group.id);
                            return (
                                <label key={group.id} className="check">
                                    <input
                                        type="checkbox"
                                        checked={form.groupIds.includes(group.id)}
                                        onChange={() => toggleGroup(group.id)}
                                        disabled={locked}
                                    />
                                    <span>{group.name}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

                {candidates.error && <ErrorMessage message={candidates.error} onRetry={candidates.reload} />}

                <PeoplePicker
                    legend="Vem är listan till?"
                    hint="Mottagarna ser aldrig vad som är reserverat."
                    people={people}
                    selected={form.recipientIds}
                    onChange={update("recipientIds")}
                />

                <PeoplePicker
                    legend="Admins"
                    hint="Admins kan lägga till önskningar, ändra och publicera listan."
                    people={people}
                    selected={form.adminIds}
                    onChange={update("adminIds")}
                    lockedIds={isEdit ? [] : [user.id]}
                />

                <ErrorMessage message={error} />

                <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy || candidates.loading}>
                        {busy ? "Sparar…" : isEdit ? "Spara ändringar" : "Skapa lista"}
                    </button>
                    <Link to={isEdit ? `/lists/${id}` : "/"} className="btn btn-ghost">
                        Avbryt
                    </Link>
                </div>
            </form>
        </div>
    );
}
