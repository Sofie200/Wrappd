import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy } from "lucide-react";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import Modal from "./Modal.jsx";
import Select from "./Select.jsx";
import { ErrorMessage, Loading, Notice } from "./Feedback.jsx";
import { formatShortDate } from "../format.js";
import { MAX_WISHES_PER_LIST } from "../config.js";

// "Kopiera" on a list (admins): copy its wishes to another list I'm admin of (not archived).
//  - all wishes - reserved ones too, but without the reservations
//  - only what's not reserved (a wish with 3, of which 1 is reserved, is copied with 2)
// A recipient never sees what's reserved, so then only "all" is offered.
// To copy to a new list: create it first, then copy from here.
export default function CopyWishesModal({ listId, seesReservations, onClose }) {
    const targets = useFetch(`/lists/${listId}/copy-targets`);
    // Starts on the first choice: only what's not reserved (a recipient only gets "all")
    const [onlyUnreserved, setOnlyUnreserved] = useState(seesReservations);
    const [targetId, setTargetId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null); // { copied, target }
    const navigate = useNavigate();

    const lists = targets.data?.data ?? [];
    const target = lists.find((l) => String(l.id) === targetId);

    async function copy(e) {
        e.preventDefault();
        if (!target) return setError("Välj vilken lista önskningarna ska kopieras till.");
        setBusy(true);
        setError(null);
        try {
            const { copied } = await api(`/lists/${listId}/copy`, {
                method: "POST",
                body: { targetListId: target.id, onlyUnreserved },
            });
            setDone({ copied, target });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal title="Kopiera önskningar" onClose={onClose}>
            {done ? (
                <>
                    <p>
                        {done.copied === 1 ? "1 önskning" : `${done.copied} önskningar`} kopierades till{" "}
                        <strong>{done.target.title}</strong>.
                    </p>
                    <div className="form-actions">
                        {/* Close first: the list page stays mounted when only its id changes, so the modal would stay open */}
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                                onClose();
                                navigate(`/lists/${done.target.id}`);
                            }}
                        >
                            Gå till listan
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>
                            Stäng
                        </button>
                    </div>
                </>
            ) : !targets.data ? (
                targets.loading ? <Loading /> : <ErrorMessage message={targets.error} onRetry={targets.reload} />
            ) : lists.length === 0 ? (
                <>
                    <Notice>
                        Du har ingen annan aktiv lista att kopiera till. Skapa en ny lista först - sen kan du kopiera hit
                        från den här listan.
                    </Notice>
                    <div className="form-actions">
                        <Link to="/lists/new" className="btn btn-primary">
                            Skapa ny lista
                        </Link>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>
                            Avbryt
                        </button>
                    </div>
                </>
            ) : (
                <form className="form" onSubmit={copy}>
                    <fieldset className="fieldset">
                        <legend>Vilka önskningar?</legend>
                        <div className="checks checks-stacked">
                            {seesReservations && (
                                <label className="check">
                                    <input
                                        type="radio"
                                        name="copy-which"
                                        checked={onlyUnreserved}
                                        onChange={() => setOnlyUnreserved(true)}
                                        disabled={busy}
                                    />
                                    Oreserverade önskningar
                                </label>
                            )}
                            <label className="check">
                                <input
                                    type="radio"
                                    name="copy-which"
                                    checked={!onlyUnreserved}
                                    onChange={() => setOnlyUnreserved(false)}
                                    disabled={busy}
                                />
                                Alla önskningar (reservationerna följer inte med)
                            </label>
                        </div>
                    </fieldset>

                    <label className="field">
                        <span>Till vilken lista?</span>
                        <Select
                            label="Till vilken lista?"
                            placeholder="Välj lista…"
                            value={targetId}
                            onChange={(v) => setTargetId(String(v))}
                            options={lists.map((l) => ({
                                value: String(l.id),
                                label: [
                                    l.title,
                                    l.recipients && `Till: ${l.recipients}`,
                                    formatShortDate(l.endDate),
                                    !l.isPublic && "Privat",
                                ]
                                    .filter(Boolean)
                                    .join(" · "),
                            }))}
                            disabled={busy}
                        />
                        {target && (
                            <small>
                                Listan har {target.wishCount} av max {MAX_WISHES_PER_LIST} önskningar.
                            </small>
                        )}
                    </label>
                    <p className="small muted">
                        Vill du kopiera till en ny lista? <Link to="/lists/new">Skapa listan först</Link>.
                    </p>

                    <ErrorMessage message={error} />
                    <div className="form-actions">
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            <Copy size={16} aria-hidden="true" /> {busy ? "Kopierar…" : "Kopiera"}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                            Avbryt
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
}
