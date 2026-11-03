import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { useImageChoice } from "../hooks/useImageChoice.js";
import { ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import ImageField from "../components/ImageField.jsx";
import ProductLinkField from "../components/ProductLinkField.jsx";
import { amountText, formatDate, formatPrice, formatShortDate, parseAmount } from "../format.js";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

// /gifts/:id – a gift ("gåva"), and /gifts/new – a new gift bought outside the wish list.
//  - A gift on a wish: quantity, price, comment, who shares and how. After the event: price, comment and split.
//  - A gift outside the wish list: also title, description, link, image, and a list OR a Secret Santa I give in
//    OR a recipient and a date. Everything can always be changed. Never shown on the list.
//    Can only be shared when it has a list.
export default function GiftPage() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    return <GiftEditor id={id} presetListId={searchParams.get("list") ?? ""} presetSantaId={searchParams.get("santa") ?? ""} />;
}

// The gift editor itself – used by the page, and in a modal (e.g. from the overview).
// With `onDone` it runs in modal mode: no page chrome, and onDone() is called after
// a save or a delete instead of navigating.
export function GiftEditor({ id, presetListId = "", presetSantaId = "", onDone }) {
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

function GiftForm({ data, lists, santas, presetListId, presetSantaId, justSaved, onSaved, onEdit, onDone }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isNew = !data;
    const gift = data?.gift;
    const isFree = isNew || gift.kind === "free";
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
        recipient: gift?.recipient ?? "",
        giftDate: gift?.giftDate ?? "",
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
                formData.append("giftDate", form.giftDate);
            }
            image.appendTo(formData);
        }

        setBusy(true);
        try {
            if (isNew) {
                const { id } = await api("/gifts", { method: "POST", formData, timeoutMs: 30_000 });
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
                <p className="muted">
                    {list
                        ? `Gåva till ${list.recipients} · ${formatDate(list.endDate)}`
                        : santa
                          ? `Secret Santa: ${santa.title} · ${formatDate(santa.date)}`
                          : person
                            ? `Gåva till ${person.name} · från önskeprofilen`
                            : `Till ${gift.recipient} · ${formatDate(gift.giftDate)}`}
                    {isFree && " · utanför önskelistan"}
                </p>
            )}

            {isFree ? (
                <Notice>En gåva utanför önskelistan syns bara för er som delar på den – aldrig på listan.</Notice>
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
                        <label className="field">
                            <span>Beskrivning</span>
                            <textarea value={form.description} onChange={set("description")} rows={3} maxLength={2000} disabled={busy} />
                        </label>
                        <ImageField image={image} onError={setError} />

                        <label className="field">
                            <span>Kopplad till</span>
                            <select value={link} onChange={changeLink} disabled={busy}>
                                <option value="">Ingen lista</option>
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

                        {form.listId === "" && form.santaId === "" && (
                            <div className="field-row">
                                <label className="field">
                                    <span>Till vem?</span>
                                    <input value={form.recipient} onChange={set("recipient")} maxLength={100} required disabled={busy} placeholder="t.ex. Farmor" />
                                </label>
                                <label className="field">
                                    <span>Datum</span>
                                    <input type="date" value={form.giftDate} onChange={set("giftDate")} required disabled={busy} />
                                    <small>När gåvan ska ges. Efter datumet hamnar den i historiken.</small>
                                </label>
                            </div>
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
                        {priceInvalid ? (
                            <small className="field-error">Skriv ett belopp, t.ex. 299 eller 299,50</small>
                        ) : (
                            <small>Det ni faktiskt betalade, för alla exemplar.</small>
                        )}
                    </label>
                </div>

                <label className="field">
                    <span>Kommentar</span>
                    <textarea value={form.comment} onChange={set("comment")} rows={3} maxLength={1000} disabled={busy} />
                    <small>Syns bara för er som delar på gåvan.</small>
                </label>

                {canShare ? (
                    <>
                        <fieldset className="fieldset">
                            <legend>Vilka delar på gåvan?</legend>
                            <small className="muted">
                                Vuxna i listans grupper som inte är mottagare. Alla som delar ser gåvan bland sina inköp och kan ändra den.
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
                        </fieldset>

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
                    </>
                ) : (
                    <p className="small muted">
                        {form.santaId !== ""
                            ? "En Secret Santa-gåva kan inte delas – bara du vet vem den är till."
                            : form.listId === ""
                            ? "En gåva utan lista kan inte delas med andra. Välj en lista för att kunna dela den."
                            : isNew
                              ? "När gåvan är sparad kan du dela den med andra i listans grupper."
                              : "Spara först – sedan kan du välja vilka i den nya listans grupper som delar på gåvan."}
                    </p>
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
            <h1>{isNew ? "Ny gåva" : gift.title}</h1>
            {content}
        </div>
    );
}
