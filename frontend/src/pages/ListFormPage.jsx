import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Plus, Save, ScrollText, TriangleAlert } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import PeoplePicker from "../components/PeoplePicker.jsx";
import MissingPersonModal from "../components/MissingPersonModal.jsx";
import InfoTip from "../components/InfoTip.jsx";
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
    const [missingOpen, setMissingOpen] = useState(false); // "Hittar du inte den du söker?"
    // New list: one step at a time - 0 VEM (recipients and groups), 1 VAD, 2 NÄR. Editing shows everything at once.
    const [step, setStep] = useState(0);
    const stepHeading = useRef(null);
    const stepChanged = useRef(false);

    // Move focus to the new step's heading, so keyboard and screen reader users follow along
    useEffect(() => {
        if (!stepChanged.current) return;
        stepHeading.current?.focus();
    }, [step]);

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

    // Everyone in the chosen groups - recipients and admins are picked among them
    const idsKey = form ? [...form.groupIds].sort((a, b) => a - b).join(",") : "";
    const candidates = useFetch(idsKey ? `/groups/members?ids=${idsKey}` : null);

    // New list: the recipient is picked first, among everyone in any of my groups
    // Editing: also the list's groups (another admin may have added one I'm not in) - to know which groups
    // the recipients are in, so only groups shared by me and the recipients are offered
    const everyoneIds = [
        ...new Set([
            ...(myGroups.data?.data ?? []).map((g) => g.id),
            ...(isEdit ? (existing.data?.groups ?? []).map((g) => g.id) : []),
        ]),
    ].sort((a, b) => a - b);
    const myGroupsKey = myGroups.data && (!isEdit || existing.data) ? everyoneIds.join(",") : "";
    const everyone = useFetch(myGroupsKey ? `/groups/members?ids=${myGroupsKey}` : null);

    if (myGroups.error) return <ErrorMessage message={myGroups.error} onRetry={myGroups.reload} />;
    if (existing.error) return <ErrorMessage message={existing.error} onRetry={existing.reload} />;
    if (!myGroups.data || !form) return <Loading />;

    if (isEdit && !existing.data.me.canEdit) {
        return (
            <div className="page">
                <Notice>Listan kan inte ändras - den är arkiverad, eller så är du inte admin för den.</Notice>
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
                    En lista behöver någon att delas med. <Link to="/groups">Skapa en grupp</Link> först - eller be någon
                    bjuda in dig till sin.
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

    // Recipients chosen as admins (not me - a list to myself that I run is normal): they'll see their own list
    const recipientAdmins = adminPeople.filter(
        (p) => p.id !== user.id && form.adminIds.includes(p.id) && form.recipientIds.includes(p.id)
    );

    const update = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

    function toggleGroup(groupId) {
        const { groupIds } = form;
        update("groupIds")(groupIds.includes(groupId) ? groupIds.filter((x) => x !== groupId) : [...groupIds, groupId]);
    }

    // New list: recipients come from everyone in my groups; editing: from the list's groups
    const recipientPool = everyone.data?.data ?? (isEdit ? people : []);
    const chosenRecipients = recipientPool.filter((p) => form.recipientIds.includes(p.id));
    const othersChildrenAll = recipientPool
        .filter((p) => p.isChild && !(p.parentIds ?? []).includes(user.id) && !savedRecipientIds.includes(p.id))
        .map((p) => p.id);

    // New list: only my groups that at least one recipient is in - and every recipient must be in a chosen one
    // Editing: the recipients' groups come from `everyone` (people only knows the list's chosen groups).
    // Groups that can't be removed (the list is published) are always shown.
    const groupsOf = (personId) => (everyone.data?.data ?? []).find((p) => p.id === personId)?.groupIds ?? [];
    const sharedGroups = isEdit
        ? groupOptions.filter(
              (g) =>
                  !everyone.data ||
                  form.recipientIds.length === 0 ||
                  (isPublic && savedGroupIds.includes(g.id)) ||
                  form.recipientIds.some((rid) => groupsOf(rid).includes(g.id))
          )
        : groupOptions.filter((g) => chosenRecipients.some((r) => (r.groupIds ?? []).includes(g.id)));
    const sharedGroupIds = sharedGroups.map((g) => g.id);
    const chosenGroups = sharedGroups.filter((g) => form.groupIds.includes(g.id));
    const uncovered = chosenRecipients.filter((r) => !(r.groupIds ?? []).some((gid) => form.groupIds.includes(gid)));

    // What each step needs before the next one opens
    const stepDone = [
        chosenRecipients.length > 0 &&
            !everyone.loading &&
            chosenGroups.length > 0 &&
            uncovered.length === 0 &&
            !candidates.loading,
        form.title.trim().length > 0,
        Boolean(form.endDate),
    ];

    // New list: picking recipients also tidies the groups - drops those no recipient is in,
    // and picks the only one there is
    function changeRecipients(ids) {
        const locked = isPublic ? savedGroupIds : []; // a published list's groups can't be removed
        const shared = groupOptions
            .filter((g) => recipientPool.some((p) => ids.includes(p.id) && (p.groupIds ?? []).includes(g.id)))
            .map((g) => g.id);
        setForm((prev) => {
            const kept = prev.groupIds.filter((gid) => shared.includes(gid) || locked.includes(gid));
            return {
                ...prev,
                recipientIds: ids,
                groupIds: kept.length === 0 && shared.length === 1 ? shared : kept,
            };
        });
    }

    function goTo(next) {
        stepChanged.current = true;
        setError(null);
        setStep(next);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        // Wizard: Enter (or "Nästa") on an earlier step moves on instead of saving
        if (!isEdit && step < STEPS.length - 1) {
            if (stepDone[step]) goTo(step + 1);
            return;
        }
        setBusy(true);
        setError(null);

        // People who are no longer in any chosen group are dropped - the server would refuse them anyway
        const body = {
            title: form.title,
            description: form.description,
            endDate: form.endDate,
            groupIds: form.groupIds.filter((gid) => sharedGroupIds.includes(gid)),
            recipientIds: form.recipientIds.filter((x) => recipientPool.some((p) => p.id === x)),
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
            <h1 className={isEdit ? "title-with-icon title-spaced" : "title-with-icon"}>
                <ScrollText size={28} aria-hidden="true" /> {isEdit ? "Redigera lista" : "Ny lista"}
            </h1>
            {!isEdit && <p className="muted form-intro">En ny lista är privat tills du är redo att publicera den.</p>}

            {/* The three parts of the form - shown one at a time when creating, all together when editing */}
            {(() => {
                // Editing: who it's for, the groups that see it, and the admins - the same wording as a new list
                const editRecipientNames = joinNames(chosenRecipients.map((p) => p.name));
                const who = (
                    <>
                        <p className="muted small step-hint">
                            Välj bland medlemmarna i dina grupper. Mottagaren kommer inte att kunna se listan.
                        </p>
                        {candidates.error && <ErrorMessage message={candidates.error} onRetry={candidates.reload} />}
                        <PeoplePicker
                            bare
                            compact
                            legend="Vem är det vi firar?"
                            people={recipientPool}
                            selected={form.recipientIds}
                            onChange={changeRecipients}
                            disabledIds={othersChildrenAll}
                            disabledHint="Bara barnets föräldrar kan göra listor till barnet"
                            onNotFound={() => setMissingOpen(true)}
                        />

                        <fieldset className="fieldset">
                            <legend className="legend-large">
                                Vilka grupper ska se listan?{" "}
                                {chosenRecipients.length > 0 && (
                                    <InfoTip label="Vem ser listan?">
                                        Alla i{" "}
                                        {chosenGroups.length > 0
                                            ? joinNames(chosenGroups.map((g) => g.name))
                                            : "grupperna du väljer"}{" "}
                                        kan se listan när den har publicerats - utom {editRecipientNames}.
                                    </InfoTip>
                                )}
                            </legend>
                            <p className="muted small">
                                {isPublic
                                    ? "Listan är publicerad. Du kan lägga till fler grupper, men inte ta bort någon."
                                    : form.recipientIds.length === 0
                                      ? "Mottagaren och listans admins väljs bland medlemmarna i grupperna."
                                      : `Här visas de grupper där både du och ${editRecipientNames} är med.`}
                            </p>
                            <div className="checks">
                                {sharedGroups.map((group) => {
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

                        {chosenGroups.length > 0 && uncovered.length > 0 && (
                            <p className="muted small">
                                Välj också en grupp där {joinNames(uncovered.map((p) => p.name))} är med.
                            </p>
                        )}

                        {form.groupIds.length > 0 && (
                            <PeoplePicker
                                compact
                                legend="Admins"
                                hint={
                                    childRecipients.length > 0
                                        ? "Listor till barn kan bara administreras av barnets föräldrar."
                                        : "Admins kan lägga till önskningar, ändra och publicera listan."
                                }
                                people={adminPeople}
                                selected={form.adminIds}
                                onChange={update("adminIds")}
                                emptyText={
                                    childRecipients.length > 0
                                        ? "Barnets föräldrar är inte med i någon av de valda grupperna - välj en grupp där de finns."
                                        : "Välj en grupp först."
                                }
                            />
                        )}

                        {recipientAdmins.length > 0 && (
                            <div className="alert alert-warning" role="status">
                                <span>
                                    <TriangleAlert size={16} className="icon-lead" aria-hidden="true" />
                                    {recipientAdmins.length === 1
                                        ? `Om ${recipientAdmins[0].name} görs till admin så kommer hen att kunna se sin egen lista.`
                                        : `Om ${joinNames(recipientAdmins.map((p) => p.name))} görs till admins så kommer de att kunna se sin egen lista.`}
                                </span>
                            </div>
                        )}
                    </>
                );

                // New list, step 1: who it's for - anyone in any of my groups
                const recipientStep = (
                    <>
                        {everyone.error && <ErrorMessage message={everyone.error} onRetry={everyone.reload} />}
                        {/* The step's heading asks the question - the picker has no legend of its own here */}
                        <p className="muted small step-hint">
                            Välj bland medlemmarna i dina grupper. Mottagaren kommer inte att kunna se listan.
                        </p>
                        <PeoplePicker
                            bare
                            legend="Vem är det vi firar?"
                            people={recipientPool}
                            selected={form.recipientIds}
                            onChange={changeRecipients}
                            disabledIds={othersChildrenAll}
                            disabledHint="Bara barnets föräldrar kan göra listor till barnet"
                            emptyText={everyone.loading ? "Hämtar medlemmar…" : "Det finns inga andra i dina grupper än."}
                            onNotFound={() => setMissingOpen(true)}
                            compact
                        />
                    </>
                );

                // New list, under the recipients: which groups see it (only those the recipient is in).
                // I'm the only admin to begin with - more can be added later when editing the list.
                const recipientNames = joinNames(chosenRecipients.map((p) => p.name));
                const groupStep = chosenRecipients.length > 0 && (
                    <>
                        <fieldset className="fieldset">
                            <legend className="legend-large">
                                Vilka grupper ska se listan?{" "}
                                <InfoTip label="Vem ser listan?">
                                    Alla i{" "}
                                    {chosenGroups.length > 0
                                        ? joinNames(chosenGroups.map((g) => g.name))
                                        : "grupperna du väljer"}{" "}
                                    kommer att kunna se listan när den har publicerats - utom {recipientNames}.
                                </InfoTip>
                            </legend>
                            <p className="muted small">
                                {form.recipientIds.length === 1 && form.recipientIds[0] === user.id
                                    ? "Här visas dina grupper."
                                    : `Här visas de grupper där både du och ${recipientNames} är med.`}
                            </p>
                            <div className="checks">
                                {sharedGroups.map((group) => (
                                    <label key={group.id} className="check">
                                        <input
                                            type="checkbox"
                                            checked={form.groupIds.includes(group.id)}
                                            onChange={() => toggleGroup(group.id)}
                                        />
                                        <span>{group.name}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        {chosenGroups.length > 0 && uncovered.length > 0 && (
                            <p className="muted small">
                                Välj också en grupp där {joinNames(uncovered.map((p) => p.name))} är med.
                            </p>
                        )}
                    </>
                );

                const what = (
                    <>
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
                    </>
                );

                const when = (
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
                );

                const cancel = (
                    <Link to={isEdit ? `/lists/${id}` : "/"} className="btn btn-ghost">
                        Avbryt
                    </Link>
                );

                if (isEdit) {
                    return (
                        <form onSubmit={handleSubmit} className="form">
                            {/* Same headings as the steps of a new list - but all on one page */}
                            {STEPS.map((st, i) => (
                                <section key={st.key} className="edit-section">
                                    <h2 className="step-title">{st.title}</h2>
                                    {[who, what, when][i]}
                                </section>
                            ))}
                            <ErrorMessage message={error} />
                            <div className="form-actions">
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={busy || candidates.loading || everyone.loading || uncovered.length > 0}
                                >
                                    <Save size={16} aria-hidden="true" />
                                    {busy ? "Sparar…" : "Spara ändringar"}
                                </button>
                                {cancel}
                            </div>
                        </form>
                    );
                }

                const isLast = step === STEPS.length - 1;
                return (
                    <form onSubmit={handleSubmit} className="form form-wizard">
                        <ol className="steps" aria-label="Steg">
                            {STEPS.map((s, i) => {
                                // A step can be opened again when every step before it is done
                                const reachable = i < step || stepDone.slice(0, i).every(Boolean);
                                const state = i === step ? " steps-current" : i < step ? " steps-done" : "";
                                return (
                                    <li key={s.key} className={"steps-item" + state}>
                                        <button
                                            type="button"
                                            onClick={() => goTo(i)}
                                            disabled={!reachable || i === step}
                                            aria-current={i === step ? "step" : undefined}
                                        >
                                            <span className="steps-bar" aria-hidden="true" />
                                            <span className="steps-label">
                                                {i < step && <Check size={13} aria-hidden="true" />}
                                                {s.label}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>

                        <section key={STEPS[step].key} className="step-panel">
                            <h2 className="step-title" ref={stepHeading} tabIndex={-1}>
                                <span className="visually-hidden">Steg {step + 1} av {STEPS.length}: </span>
                                {STEPS[step].title}
                            </h2>
                            {step === 0 ? (
                                <>
                                    {recipientStep}
                                    {groupStep}
                                </>
                            ) : (
                                [null, what, when][step]
                            )}
                        </section>

                        <ErrorMessage message={error} />

                        <div className="form-actions">
                            {step > 0 && (
                                <button type="button" className="btn btn-ghost" onClick={() => goTo(step - 1)}>
                                    <ArrowLeft size={16} className="icon-lead" aria-hidden="true" />
                                    Tillbaka
                                </button>
                            )}
                            {isLast ? (
                                <button type="submit" className="btn btn-primary" disabled={busy || !stepDone.every(Boolean)}>
                                    <Plus size={16} className="icon-lead" aria-hidden="true" />
                                    {busy ? "Sparar…" : "Skapa lista"}
                                </button>
                            ) : (
                                <button type="submit" className="btn btn-primary" disabled={!stepDone[step]}>
                                    Nästa
                                    <ArrowRight size={16} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </form>
                );
            })()}

            {/* Outside the form: the modal has forms of its own */}
            {missingOpen && (
                <MissingPersonModal
                    groups={isEdit ? groupOptions.filter((g) => form.groupIds.includes(g.id)) : groupOptions}
                    onAdded={(userId) => {
                        // Chosen right away - the chip shows once the members are fetched again
                        setForm((prev) =>
                            prev.recipientIds.includes(userId) ? prev : { ...prev, recipientIds: [...prev.recipientIds, userId] }
                        );
                        candidates.reload();
                        everyone.reload();
                    }}
                    onClose={() => setMissingOpen(false)}
                />
            )}
        </div>
    );
}

const STEPS = [
    { key: "who", label: "Vem", title: "Vem är det vi firar?" },
    { key: "what", label: "Vad", title: "Vad är det vi firar?" },
    { key: "when", label: "När", title: "När är firandet?" },
];

// "Anna", "Anna och Bo", "Anna, Bo och Cia"
function joinNames(names) {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} och ${names.at(-1)}`;
}
