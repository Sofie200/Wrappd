import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Save, ScrollText } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import PeoplePicker from "../components/PeoplePicker.jsx";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
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

    // /lists/new?for=12 (from Mina barn): start with the child as recipient, in the child's groups that I'm in
    const [searchParams] = useSearchParams();
    const forChildId = isEdit ? null : Number(searchParams.get("for")) || null;
    const myChildren = useFetch(forChildId ? "/children" : null);
    const prefilled = useRef(false);

    useEffect(() => {
        if (prefilled.current || !myChildren.data || !myGroups.data) return;
        prefilled.current = true;
        const child = myChildren.data.data.find((c) => c.id === forChildId);
        if (!child) return;
        const mine = myGroups.data.data.map((g) => g.id);
        setForm((prev) => ({
            ...prev,
            title: prev.title || `Önskelista till ${child.name}`,
            recipientIds: [child.id],
            groupIds: child.groups.map((g) => g.id).filter((id) => mine.includes(id)),
        }));
    }, [myChildren.data, myGroups.data, forChildId]);

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
                <h1 className="title-with-icon">
                    <ScrollText size={28} aria-hidden="true" /> Ny lista
                </h1>
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

    // Children: only recipients, and only my own children can be picked (one already on the list may stay).
    // A list to children is administered only by their parents.
    const savedRecipientIds = isEdit ? existing.data.recipients.map((r) => r.id) : [];
    const othersChildren = people
        .filter((p) => p.isChild && !(p.parentIds ?? []).includes(user.id) && !savedRecipientIds.includes(p.id))
        .map((p) => p.id);
    const childRecipients = people.filter((p) => p.isChild && form.recipientIds.includes(p.id));
    const parentsOfRecipients = new Set(childRecipients.flatMap((c) => c.parentIds ?? []));
    const adminPeople = people.filter(
        (p) => !p.isChild && (childRecipients.length === 0 || parentsOfRecipients.has(p.id))
    );
    const adminPeopleIds = adminPeople.map((p) => p.id);

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
            // Only the people who may be admins right now (e.g. only parents, when the list is to a child)
            adminIds: form.adminIds.filter((x) => adminPeopleIds.includes(x)),
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
            {/* Editing: a way back to the list */}
            {isEdit && (
                <Breadcrumbs items={[{ label: existing.data.list.title, to: `/lists/${id}` }, { label: "Redigera" }]} />
            )}
            <h1 className="title-with-icon">
                <ScrollText size={28} aria-hidden="true" /> {isEdit ? "Redigera lista" : "Ny lista"}
            </h1>
            {!isEdit && <p className="muted form-intro">Listan är privat tills du publicerar den. Bara listans admins ser den innan dess.</p>}

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
                    <span>Datum för firandet</span>
                    <input
                        type="date"
                        value={form.endDate}
                        min={todayIso()}
                        onChange={(e) => update("endDate")(e.target.value)}
                        required
                    />
                    <small>Dagen efter arkiveras listan och går inte längre att ändra eller reservera önskningar på.</small>
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

                {/* Who it's for and the admins come from the groups – shown once at least one group is chosen */}
                {form.groupIds.length > 0 && (
                    <>
                    {candidates.error && <ErrorMessage message={candidates.error} onRetry={candidates.reload} />}

                    <PeoplePicker
                        legend="Vem är det vi firar?"
                        hint="Mottagarna ser aldrig vad som är reserverat."
                        people={people}
                        selected={form.recipientIds}
                        onChange={update("recipientIds")}
                        disabledIds={othersChildren}
                        disabledHint="Bara barnets föräldrar kan göra listor till barnet"
                    />

                    <PeoplePicker
                        legend="Admins"
                        hint={
                            childRecipients.length > 0
                                ? "Listor till barn kan bara administreras av barnets föräldrar."
                                : "Admins kan lägga till önskningar, ändra och publicera listan."
                        }
                        people={adminPeople}
                        selected={form.adminIds}
                        onChange={update("adminIds")}
                        lockedIds={isEdit ? [] : [user.id]}
                        emptyText={
                            childRecipients.length > 0
                                ? "Ingen av barnets föräldrar är med i de valda grupperna."
                                : "Välj en grupp först."
                        }
                    />
                    </>
                )}

                <ErrorMessage message={error} />

                <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy || candidates.loading}>
                        {isEdit ? <Save size={16} aria-hidden="true" /> : <Plus size={16} className="icon-lead" aria-hidden="true" />}
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
