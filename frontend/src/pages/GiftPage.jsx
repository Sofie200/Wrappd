import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { useImageChoice } from "../hooks/useImageChoice.js";
import { ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import ImageField from "../components/ImageField.jsx";
import ProductLinkField from "../components/ProductLinkField.jsx";
import PeoplePicker from "../components/PeoplePicker.jsx";
import { amountText, formatDate, formatPrice, formatShortDate, parseAmount } from "../format.js";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

// /gifts/:id – a gift ("gåva"), and /gifts/new – a new gift bought outside the wish list.
//  - A gift on a wish: quantity, price, comment, who shares and how. After the event: price, comment and split.
//  - A gift outside the wish list: also title, description, link, image, and a list OR a Secret Santa I give in
//    OR an event (a name, a date and optionally a linked person). Everything can always be changed. Never shown on the list.
//    Can only be shared when it has a list.
export default function GiftPage() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    return <GiftEditor id={id} presetListId={searchParams.get("list") ?? ""} presetSantaId={searchParams.get("santa") ?? ""} />;
}

// The gift editor itself – used by the page, and in a modal (e.g. from the overview).
// With `onDone` it runs in modal mode: no page chrome, and onDone() is called after
// a save or a delete instead of navigating.
export function GiftEditor({ id, presetListId = "", presetSantaId = "", presetEvent = null, onDone }) {
    const isNew = id === "new";
    const gift = useFetch(isNew ? null : `/gifts/${id}`);
    const isFree = isNew || gift.data?.gift.kind === "free";
    const lists = useFetch(isFree ? "/gifts/lists" : null);
    const [justSaved, setJustSaved] = useState(false);

    if (!isNew && !gift.data) return gift.loading ? <Loading /> : <ErrorMessage message={gift.error} onRetry={gift.reload} />;
    if (isFree && !lists.data) return lists.loading ? <Loading /> : <ErrorMessage message={lists.error} onRetry={lists.reload} />;

    return (
        <GiftForm
            // A new form after every save – it starts from what the server has
            key={isNew ? "new" : JSON.stringify(gift.data)}
            data={isNew ? null : gift.data}
            lists={lists.data?.data ?? []}
            santas={lists.data?.santas ?? []}
            presetListId={presetListId}
            presetSantaId={presetSantaId}
            presetEvent={presetEvent}
            onDone={onDone}
            justSaved={justSaved}
            onSaved={() => {
                setJustSaved(true);
                gift.reload();
            }}
            onEdit={() => setJustSaved(false)}
        />
    );
}

function GiftForm({ data, lists, santas, presetListId, presetSantaId, presetEvent, justSaved, onSaved, onEdit, onDone }) {
    // "Till vem?" for an own event: a link to someone in my groups
    const myGroups = useFetch("/groups");
    const groupIds = (myGroups.data?.data ?? []).map((g) => g.id).join(",");
    const groupMembers = useFetch(groupIds ? `/groups/members?ids=${groupIds}` : null);
    const { user } = useAuth();
    const navigate = useNavigate();
    const isNew = !data;
    const gift = data?.gift;
    // The people to choose from – plus the saved one, if they're no longer in my groups
    const groupPeople = (groupMembers.data?.data ?? []).filter((p) => p.id !== user.id);
    if (gift?.recipientId && !groupPeople.some((p) => p.id === gift.recipientId)) {
        groupPeople.unshift({ id: gift.recipientId, name: gift.recipientName });
    }
    const isFree = isNew || gift.kind === "free";
    // Logging another gift on an own event that already exists: no surprise text, no event fields to fill in
    const forEvent = isNew && Boolean(presetEvent);
    // Opened from a list or a Secret Santa: already linked to it – no choosing another one
    const presetList = isNew ? lists.find((l) => String(l.id) === presetListId) : null;
    const presetSanta = isNew ? santas.find((x) => String(x.id) === presetSantaId) : null;
    const lockedLink = Boolean(presetList || presetSanta);
    const savedListId = String(gift?.listId ?? "");

    const [form, setForm] = useState({
        quantity: String(gift?.quantity ?? 1),
        price: amountText(gift?.price),
        comment: gift?.comment ?? "",
        split: gift?.split ?? "equal",
        // userId → amount as text (only used for custom split)
        members: data ? Object.fromEntries(data.members.map((m) => [m.id, amountText(m.amount)])) : { [user.id]: "" },
        // Only for gifts outside the wish list
        title: gift?.title ?? "",
        description: gift?.description ?? "",
        url: gift?.url ?? "",
        listId: isNew ? (lists.some((l) => String(l.id) === presetListId) ? presetListId : "") : savedListId,
        santaId: isNew ? (santas.some((x) => String(x.id) === presetSantaId) ? presetSantaId : "") : String(gift?.santaId ?? ""),
        // An own event: its name, linked person and date – from the gift, or from the event it's added to
        recipient: gift?.recipient ?? presetEvent?.name ?? "",
        recipientId: String(gift?.recipientId ?? presetEvent?.recipientId ?? ""),
        giftDate: gift?.giftDate ?? presetEvent?.date ?? "",
    });
    const image = useImageChoice(gift?.imageUrl);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const change = (values) => {
        onEdit();
        setForm((prev) => ({ ...prev, ...values }));
    };
    const set = (field) => (e) => change({ [field]: e.target.value });

    function applyProduct(product) {
        change({
            ...(product.title && { title: product.title }),
            ...(product.description && { description: product.description }),
            ...(product.price && { price: product.price }),
        });
        if (product.imageUrl) image.takeShopImage(product.imageUrl);
    }

    // Sharing: on a gift on a wish, or a gift outside the list that is saved with a list.
    // Who can share depends on the list – so after changing the list, it must be saved first.
    const listChanged = isFree && !isNew && form.listId !== savedListId;
    const canShare = !isNew && (!isFree || (form.listId !== "" && !listChanged));
    const people = data ? [...data.members, ...data.candidates.filter((c) => !data.members.some((m) => m.id === c.id))] : [];
    const selectedIds = canShare ? people.map((p) => p.id).filter((pid) => pid in form.members) : [];

    const price = parseAmount(form.price);
    const priceInvalid = form.price.trim() !== "" && price === null;
    const customSum = selectedIds.reduce((sum, pid) => sum + Math.round((parseAmount(form.members[pid]) ?? 0) * 100), 0) / 100;
    const sumMatches = price !== null && Math.round(customSum * 100) === Math.round(price * 100);
    const equalShare = price !== null && selectedIds.length > 0 ? price / selectedIds.length : null;

    // "Vem är gåvan från?": "Bara mig" (just me), or – unchecked – the list of people to share with.
    // Starts unchecked when someone else already shares it.
    const [sharing, setSharing] = useState(() => selectedIds.some((pid) => pid !== user.id));
    function toggleOnlyMe() {
        if (sharing) {
            // Back to just me: everyone else out (keeping my own amount, if any)
            change({ members: { [user.id]: form.members[user.id] ?? "" }, split: "equal" });
            setSharing(false);
        } else {
            setSharing(true);
        }
    }

    function toggle(personId) {
        const members = { ...form.members };
        if (personId in members) delete members[personId];
        else members[personId] = "";
        change({ members });
    }

    // What is sent as members. Without a list, only I remain. After a list change, the same people (checked by the server).
    function membersToSend() {
        if (isFree && form.listId === "") return [{ userId: user.id, amount: null }];
        const ids = canShare ? selectedIds : Object.keys(form.members).map(Number);
        const custom = form.split === "custom";
        return ids.map((pid) => ({ userId: pid, amount: custom ? form.members[pid] : null }));
    }

    async function save(e) {
        e.preventDefault();
        setError(null);

        const members = membersToSend();
        const leaving = data ? data.members.filter((m) => !members.some((x) => x.userId === m.id)) : [];
        if (members.length === 0) return setError("Minst en person måste stå för gåvan.");
        if (leaving.some((m) => m.id === user.id) &&
            !window.confirm("Du har tagit bort dig själv. Då försvinner gåvan från dina inköp och du kan inte längre ändra den. Fortsätta?")) {
            return;
        }
        const others = leaving.filter((m) => m.id !== user.id);
        const freeText = form.listId === "" && form.santaId === ""; // recipient and date only without a list or a Secret Santa
        if (isFree && form.listId === "" && others.length > 0 &&
            !window.confirm(`En gåva utan lista kan inte delas. ${others.map((m) => m.name).join(", ")} tas bort från gåvan. Fortsätta?`)) {
            return;
        }

        const formData = new FormData();
        formData.append("quantity", form.quantity);
        formData.append("price", form.price);
        formData.append("comment", form.comment);
        formData.append("split", members.length > 1 || form.split === "equal" ? form.split : "equal");
        formData.append("members", JSON.stringify(members.length > 1 ? members : members.map((m) => ({ ...m, amount: null }))));
        if (isFree) {
            for (const key of ["title", "description", "url", "listId", "santaId"]) formData.append(key, form[key]);
            if (freeText) {
                formData.append("recipient", form.recipient);
                formData.append("recipientId", form.recipientId);
                formData.append("giftDate", form.giftDate);
            }
            image.appendTo(formData);
        }

        setBusy(true);
        try {
            if (isNew) {
                const { id } = await api("/gifts", { method: "POST", formData, timeoutMs: 30_000 });
                if (onDone) return onDone(); // in a modal: just close it
                return navigate(`/gifts/${id}`, { replace: true });
            }
            const result = await api(`/gifts/${gift.id}`, { method: "PUT", formData, timeoutMs: 30_000 });
            if (onDone) return onDone();
            if (!result.stillMember) return navigate(data.list ? `/lists/${data.list.id}` : "/");
            onSaved();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    async function remove() {
        const question = isFree
            ? `Ta bort "${gift.title}"? Gåvan tas bort för alla som delar på den.`
            : `Ångra reservationen av "${gift.title}"? Gåvan tas bort för alla som delar på den.`;
        if (!window.confirm(question)) return;
        setBusy(true);
        setError(null);
        try {
            await api(`/gifts/${gift.id}`, { method: "DELETE" });
            if (onDone) return onDone();
            navigate(!isFree && data.list ? `/lists/${data.list.id}` : "/");
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    const { wish, list, person, santa } = data ?? {};
    // What the gift is linked to, as one value for the select: "list:5", "santa:3" or "" (neither)
    const link = form.santaId ? `santa:${form.santaId}` : form.listId ? `list:${form.listId}` : "";
    function changeLink(e) {
        const [kind, linkId = ""] = e.target.value.split(":");
        change({ listId: kind === "list" ? linkId : "", santaId: kind === "santa" ? linkId : "" });
    }
    // If the gift's list is no longer among the ones I can pick (e.g. I left the group), keep it as an option
    const listOptions = list && isFree && !lists.some((l) => l.id === list.id) ? [{ ...list, archived: false }, ...lists] : lists;
    const quantityOptions = gift && !isFree ? Array.from({ length: Math.max(gift.maxQuantity, gift.quantity) }, (_, i) => i + 1) : [];

    const content = (
        <>
            {!isNew && (
                <p className="muted gift-subtitle">
                    {list
                        ? `Gåva till ${list.recipients} · ${formatDate(list.endDate)}`
                        : santa
                          ? `Secret Santa: ${santa.title} · ${formatDate(santa.date)}`
                          : person
                            ? `Gåva till ${person.name} · från önskeprofilen`
                            : `${gift.recipient}${gift.recipientName ? ` · till ${gift.recipientName}` : ""} · ${formatDate(gift.giftDate)}`}
                </p>
            )}

            {forEvent ? (
                <p className="muted small gift-for-event">
                    Loggas på <strong>{presetEvent.name}</strong>
                    {presetEvent.recipientName && ` · till ${presetEvent.recipientName}`} · {formatDate(presetEvent.date)}
                </p>
            ) : lockedLink ? (
                <>
                    <p className="muted small gift-for-event">
                        {presetList ? (
                            <>
                                På listan <strong>{presetList.title}</strong> · till {presetList.recipients} · {formatDate(presetList.endDate)}
                            </>
                        ) : (
                            <>
                                Till din Secret Santa i <strong>{presetSanta.title}</strong> · {formatDate(presetSanta.date)}
                            </>
                        )}
                    </p>
                    {/* The same banner as when picking a list in the form */}
                    {presetList && <Notice>En överraskningsgåva syns bara för dem som delar på den.</Notice>}
                </>
            ) : isFree ? (
                // Only about lists – an own event or a Secret Santa gift isn't a surprise on anyone's list
                form.listId !== "" && <Notice>En överraskningsgåva syns bara för dem som delar på den.</Notice>
            ) : (
                gift.archived && <Notice>Datumet har passerat. Du kan fortfarande ändra pris, kommentar och fördelning.</Notice>
            )}

            {/* A gift on a wish: the wish, as the recipient wrote it */}
            {wish && (
                <section className="section">
                    <div className="card">
                        <div className="card-top">
                            <h3>Önskningen: {wish.title}</h3>
                            {wish.price !== null && <span className="price">{formatPrice(wish.price)}/st</span>}
                        </div>
                        {wish.description && <p className="wish-description">{wish.description}</p>}
                        {wish.url && (
                            <a href={wish.url} target="_blank" rel="noopener noreferrer" className="wish-link">
                                Se produkten <ArrowUpRight size={16} aria-hidden="true" />
                            </a>
                        )}
                        <p className="muted small">Önskat antal: {wish.quantity}</p>
                    </div>
                </section>
            )}

            <form className="form" onSubmit={save}>
                {isFree && (
                    <>
                        <ProductLinkField
                            id="gift-url"
                            value={form.url}
                            onChange={set("url")}
                            onFetched={applyProduct}
                            onError={setError}
                            disabled={busy}
                            autoFocus={isNew}
                        />
                        <label className="field">
                            <span>Titel</span>
                            <input value={form.title} onChange={set("title")} maxLength={200} required disabled={busy} />
                        </label>
                        <ImageField image={image} onError={setError} />

                        {/* Only when creating from scratch – once saved, what it's linked to can't change */}
                        {isNew && !forEvent && !lockedLink && (
                        <label className="field">
                            <span>Kopplad till</span>
                            <select value={link} onChange={changeLink} disabled={busy}>
                                <option value="">Egen händelse (ingen lista)</option>
                                {listOptions.length > 0 && (
                                    <optgroup label="Önskelistor">
                                        {listOptions.map((l) => (
                                            <option key={l.id} value={`list:${l.id}`}>
                                                {l.title} – till {l.recipients} ({formatShortDate(l.endDate)}){l.archived ? " · arkiverad" : ""}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                {santas.length > 0 && (
                                    <optgroup label="Secret Santa">
                                        {santas.map((x) => (
                                            <option key={x.id} value={`santa:${x.id}`}>
                                                {x.title} ({formatShortDate(x.date)}){x.archived ? " · passerad" : ""}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            <small>
                                {form.santaId
                                    ? "Gåvan hamnar på Secret Santa-kortet. Bara du ser den. Tas lottningen bort tas gåvan också bort."
                                    : "Gåvan kopplas till listan men syns inte där. Raderas listan raderas gåvan också."}
                            </small>
                        </label>
                        )}

                        {!forEvent && form.listId === "" && form.santaId === "" && (
                            <>
                                <div className="field-row">
                                    <label className="field">
                                        <span>Händelse</span>
                                        <input
                                            value={form.recipient}
                                            onChange={set("recipient")}
                                            maxLength={100}
                                            required
                                            disabled={busy}
                                            placeholder="t.ex. Farmors 80-årsdag"
                                        />
                                    </label>
                                    <label className="field">
                                        <span>Datum</span>
                                        <input type="date" value={form.giftDate} onChange={set("giftDate")} required disabled={busy} />
                                    </label>
                                </div>
                                {/* A link to a real person in my groups – not free text. Search, pick one. */}
                                <PeoplePicker
                                    legend="Till vem? (valfritt)"
                                    hint="Sök bland personerna i dina grupper. Hen ser aldrig gåvan."
                                    people={groupPeople}
                                    selected={form.recipientId ? [Number(form.recipientId)] : []}
                                    onChange={(ids) => change({ recipientId: ids.length ? String(ids[0]) : "" })}
                                    emptyText="Det finns inga andra i dina grupper än."
                                    single
                                />
                            </>
                        )}
                    </>
                )}

                <div className="field-row">
                    <label className="field">
                        <span>Antal</span>
                        {isFree ? (
                            <input type="number" min="1" max="99" value={form.quantity} onChange={set("quantity")} required disabled={busy} />
                        ) : gift.archived || quantityOptions.length <= 1 ? (
                            <span>{gift.quantity} st</span>
                        ) : (
                            <select value={form.quantity} onChange={set("quantity")} disabled={busy}>
                                {quantityOptions.map((n) => (
                                    <option key={n} value={n}>
                                        {n} st
                                    </option>
                                ))}
                            </select>
                        )}
                    </label>
                    <label className="field">
                        <span>Pris totalt (kr)</span>
                        <input value={form.price} onChange={set("price")} inputMode="decimal" placeholder="t.ex. 299,50" disabled={busy} />
                        {priceInvalid && <small className="field-error">Skriv ett belopp, t.ex. 299 eller 299,50</small>}
                    </label>
                </div>

                <label className="field">
                    <span>Kommentar</span>
                    <textarea value={form.comment} onChange={set("comment")} rows={3} maxLength={1000} disabled={busy} />
                    <small>Syns bara för den/de som köpt gåvan.</small>
                </label>

                {canShare ? (
                    <>
                        <fieldset className="fieldset">
                            <legend>Vem är gåvan från?</legend>
                            {/* "Bara mig" by default – uncheck it to pick others to share with */}
                            <label className="check">
                                <input type="checkbox" checked={!sharing} onChange={toggleOnlyMe} disabled={busy} />
                                Bara mig
                            </label>
                            {sharing && (
                                <>
                                    <small className="muted">
                                        Alla valda användare kan se gåvan bland sina inköp och ändra den.
                                    </small>
                                    <div className="checks">
                                        {people.map((person) => (
                                            <label key={person.id} className="check">
                                                <input type="checkbox" checked={person.id in form.members} onChange={() => toggle(person.id)} disabled={busy} />
                                                {person.name}
                                                {person.id === user.id && <span className="muted"> (du)</span>}
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}
                        </fieldset>

                        {/* Only when someone else shares it – alone, I pay it all */}
                        {selectedIds.length > 1 && (
                            <fieldset className="fieldset">
                                <legend>Hur delas kostnaden?</legend>
                                <div className="checks">
                                    <label className="check">
                                        <input type="radio" name="split" value="equal" checked={form.split === "equal"} onChange={set("split")} disabled={busy} />
                                        Lika
                                    </label>
                                    <label className="check">
                                        <input type="radio" name="split" value="custom" checked={form.split === "custom"} onChange={set("split")} disabled={busy} />
                                        Egna belopp
                                    </label>
                                </div>

                                {form.split === "equal" ? (
                                    <p className="small">
                                        {equalShare === null
                                            ? "Ange ett pris för att se vad var och en betalar."
                                            : `${formatPrice(Math.round(equalShare * 100) / 100)} per person (${selectedIds.length} st).`}
                                    </p>
                                ) : (
                                    <>
                                        <div className="split-rows">
                                            {people
                                                .filter((p) => p.id in form.members)
                                                .map((person) => (
                                                    <label key={person.id} className="split-row">
                                                        <span>{person.name}</span>
                                                        <input
                                                            value={form.members[person.id]}
                                                            onChange={(e) => change({ members: { ...form.members, [person.id]: e.target.value } })}
                                                            inputMode="decimal"
                                                            placeholder="kr"
                                                            aria-label={`Belopp för ${person.name}`}
                                                            disabled={busy}
                                                        />
                                                    </label>
                                                ))}
                                        </div>
                                        <p className={`small${price !== null && !sumMatches ? " field-error" : ""}`}>
                                            Summa: {formatPrice(customSum)}
                                            {price === null ? " – ange ett pris först." : sumMatches ? " ✓ stämmer med priset." : ` – ska vara ${formatPrice(price)}.`}
                                        </p>
                                    </>
                                )}
                            </fieldset>
                        )}
                    </>
                ) : (
                    !forEvent &&
                    (isNew && form.listId !== "" && form.santaId === "" ? (
                        // A new gift on a list: sharing comes after saving – as a banner
                        <Notice>När gåvan är sparad kan du dela den med andra.</Notice>
                    ) : (
                        <p className="small muted">
                            {form.santaId !== ""
                                ? "En Secret Santa-gåva kan inte delas – bara du vet vem den är till."
                                : form.listId === ""
                                  ? "En gåva utan lista kan inte delas med andra. Välj en lista för att kunna dela den."
                                  : "Spara först – sedan kan du välja vilka i den nya listans grupper som delar på gåvan."}
                        </p>
                    ))
                )}

                <ErrorMessage message={error} />
                {justSaved && <p className="small reserved-by-me">✓ Sparat</p>}

                <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                        {busy ? "Sparar…" : isNew ? "Spara gåva" : "Spara"}
                    </button>
                    {!isNew && (isFree || !gift.archived) && (
                        <button type="button" className="btn btn-danger-ghost" onClick={remove} disabled={busy}>
                            {isFree ? "Ta bort gåva" : "Ångra reservation"}
                        </button>
                    )}
                </div>
            </form>
        </>
    );

    // In a modal the modal has the title and the close button
    if (onDone) return <div className="gift-editor">{content}</div>;

    return (
        <div className="page page-narrow">
            <p>
                {list ? (
                    <Link to={`/lists/${list.id}`} className="back-link">
                        <ArrowLeft size={16} aria-hidden="true" /> {list.title}
                    </Link>
                ) : (
                    <Link to="/" className="back-link">
                        <ArrowLeft size={16} aria-hidden="true" /> Översikten
                    </Link>
                )}
            </p>
            <h1>{isNew ? "Ny överraskningsgåva" : gift.title}</h1>
            {content}
        </div>
    );
}
