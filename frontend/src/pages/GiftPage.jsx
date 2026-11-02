import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import { amountText, formatDate, formatPrice, parseAmount } from "../format.js";

// /gifts/:id – a gift ("gåva"): what was bought for a wish, and who shares the cost.
// Everyone who shares it can change everything here. After the event: price, comment and split only.
export default function GiftPage() {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { data, error, loading, reload } = useFetch(`/gifts/${id}`);

    const [form, setForm] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);

    // Fill the form from the server – also after saving
    useEffect(() => {
        if (!data) return;
        setForm({
            quantity: String(data.gift.quantity),
            price: amountText(data.gift.price),
            comment: data.gift.comment ?? "",
            split: data.gift.split,
            // userId → amount as text (only used for custom split)
            members: Object.fromEntries(data.members.map((m) => [m.id, amountText(m.amount)])),
        });
    }, [data]);

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;
    if (!form) return <Loading />;

    const { gift, wish, list } = data;
    // Current members first, then the others who may join
    const people = [...data.members, ...data.candidates.filter((c) => !data.members.some((m) => m.id === c.id))];
    const selectedIds = people.map((p) => p.id).filter((pid) => pid in form.members);

    const price = parseAmount(form.price);
    const priceInvalid = form.price.trim() !== "" && price === null;
    const customSum = selectedIds.reduce((sum, pid) => sum + Math.round((parseAmount(form.members[pid]) ?? 0) * 100), 0) / 100;
    const sumMatches = price !== null && Math.round(customSum * 100) === Math.round(price * 100);

    const set = (field) => (e) => {
        setSaved(false);
        setForm({ ...form, [field]: e.target.value });
    };

    function toggle(personId) {
        setSaved(false);
        const members = { ...form.members };
        if (personId in members) delete members[personId];
        else members[personId] = "";
        setForm({ ...form, members });
    }

    function setAmount(personId, value) {
        setSaved(false);
        setForm({ ...form, members: { ...form.members, [personId]: value } });
    }

    async function save(e) {
        e.preventDefault();
        setSaveError(null);

        if (selectedIds.length === 0) return setSaveError("Minst en person måste stå för gåvan.");
        if (!(user.id in form.members) && !window.confirm("Du har tagit bort dig själv. Då försvinner gåvan från dina inköp och du kan inte längre ändra den. Fortsätta?")) {
            return;
        }

        setBusy(true);
        try {
            const result = await api(`/gifts/${id}`, {
                method: "PUT",
                body: {
                    quantity: Number(form.quantity),
                    price: form.price,
                    comment: form.comment,
                    split: form.split,
                    members: selectedIds.map((pid) => ({
                        userId: pid,
                        amount: form.split === "custom" ? form.members[pid] : null,
                    })),
                },
            });
            if (!result.stillMember) return navigate(`/lists/${list.id}`);
            setSaved(true);
            reload();
        } catch (err) {
            setSaveError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!window.confirm(`Ångra reservationen av "${gift.title}"? Gåvan tas bort för alla som delar på den.`)) return;
        setBusy(true);
        setSaveError(null);
        try {
            await api(`/gifts/${id}`, { method: "DELETE" });
            navigate(`/lists/${list.id}`);
        } catch (err) {
            setSaveError(err.message);
            setBusy(false);
        }
    }

    const quantityOptions = Array.from({ length: Math.max(gift.maxQuantity, gift.quantity) }, (_, i) => i + 1);
    const equalShare = price !== null && selectedIds.length > 0 ? price / selectedIds.length : null;

    return (
        <div className="page page-narrow">
            <p>
                <Link to={`/lists/${list.id}`}>← {list.title}</Link>
            </p>
            <h1>{gift.title}</h1>
            <p className="muted">
                Gåva till {list.recipients} · {formatDate(list.endDate)}
            </p>

            {gift.archived && <Notice>Datumet har passerat. Du kan fortfarande ändra pris, kommentar och fördelning.</Notice>}

            {/* The wish, as the recipient wrote it */}
            <section className="section">
                <div className="card">
                    <div className="card-top">
                        <h3>Önskningen: {wish.title}</h3>
                        {wish.price !== null && <span className="price">{formatPrice(wish.price)}/st</span>}
                    </div>
                    {wish.description && <p className="wish-description">{wish.description}</p>}
                    {wish.url && (
                        <a href={wish.url} target="_blank" rel="noopener noreferrer" className="wish-link">
                            Se produkten ↗
                        </a>
                    )}
                    <p className="muted small">Önskat antal: {wish.quantity}</p>
                </div>
            </section>

            <form className="form" onSubmit={save}>
                <div className="field-row">
                    <label className="field">
                        <span>Antal</span>
                        {gift.archived || quantityOptions.length <= 1 ? (
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

                <fieldset className="fieldset">
                    <legend>Vilka delar på gåvan?</legend>
                    <small className="muted">
                        Vuxna i listans grupper som inte är mottagare. Alla som delar ser gåvan bland sina inköp och kan ändra den.
                    </small>
                    <div className="checks">
                        {people.map((person) => (
                            <label key={person.id} className="check">
                                <input
                                    type="checkbox"
                                    checked={person.id in form.members}
                                    onChange={() => toggle(person.id)}
                                    disabled={busy}
                                />
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
                                                onChange={(e) => setAmount(person.id, e.target.value)}
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
                                {price === null
                                    ? " – ange ett pris först."
                                    : sumMatches
                                      ? " ✓ stämmer med priset."
                                      : ` – ska vara ${formatPrice(price)}.`}
                            </p>
                        </>
                    )}
                </fieldset>

                <ErrorMessage message={saveError} />
                {saved && <p className="small reserved-by-me">✓ Sparat</p>}

                <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                        Spara
                    </button>
                    {!gift.archived && (
                        <button type="button" className="btn btn-danger-ghost" onClick={remove} disabled={busy}>
                            Ångra reservation
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
