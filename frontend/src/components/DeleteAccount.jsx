import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import Modal from "./Modal.jsx";
import { ErrorMessage, Loading } from "./Feedback.jsx";

// On the profile page: "Radera mitt konto". The dialog first shows what will go and what's kept
// (GET /auth/me/deletion), then asks for the username as confirmation.
export default function DeleteAccount() {
    const [open, setOpen] = useState(false);

    return (
        <section className="danger-zone" aria-labelledby="delete-account-title">
            <h2 id="delete-account-title">Radera konto</h2>
            <p className="muted small">
                Ditt konto och det som bara är ditt raderas för alltid. Det går inte att ångra.
            </p>
            <button type="button" className="btn btn-ghost btn-ghost-danger" onClick={() => setOpen(true)} aria-haspopup="dialog">
                <Trash2 size={16} aria-hidden="true" /> Radera mitt konto
            </button>
            {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
        </section>
    );
}

function DeleteAccountDialog({ onClose }) {
    const { user, deleteAccount } = useAuth();
    const navigate = useNavigate();
    const plan = useFetch("/auth/me/deletion");
    const [username, setUsername] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const matches = username.trim().replace(/^@/, "").toLowerCase() === user.username;

    async function confirm(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await deleteAccount(username);
            navigate("/login", { replace: true, state: { accountDeleted: true } });
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <Modal title="Radera mitt konto" onClose={busy ? () => {} : onClose}>
            {plan.loading && <Loading />}
            <ErrorMessage message={plan.error} onRetry={plan.reload} />

            {plan.data && (
                <>
                    <p>Det här raderas för alltid:</p>
                    <ul className="delete-plan">
                        <li>Ditt konto, din önskeprofil och gåvor som bara du är med i.</li>
                        {plan.data.children.length > 0 && (
                            <li>
                                {plan.data.children.length === 1 ? "Ditt barn" : "Dina barn"}{" "}
                                <strong>{plan.data.children.join(", ")}</strong>, eftersom du är enda förälder.
                            </li>
                        )}
                        {plan.data.lists.length > 0 && (
                            <li>
                                {plan.data.lists.length === 1 ? "Listan" : `${plan.data.lists.length} listor:`}{" "}
                                <strong>{plan.data.lists.join(", ")}</strong> - med önskningar. De som köpt något därifrån
                                behåller sina gåvor.
                            </li>
                        )}
                        {plan.data.emptyGroups.length > 0 && (
                            <li>
                                {plan.data.emptyGroups.length === 1 ? "Gruppen" : "Grupperna"}{" "}
                                <strong>{plan.data.emptyGroups.join(", ")}</strong>, där ingen annan är med.
                            </li>
                        )}
                    </ul>

                    {(plan.data.keptGroups > 0 || plan.data.sharedGifts > 0) && (
                        <p className="muted small">
                            Det andra delar med dig finns kvar för dem:
                            {plan.data.keptGroups > 0 &&
                                ` ${plan.data.keptGroups === 1 ? "en grupp" : `${plan.data.keptGroups} grupper`} (någon annan blir admin om det behövs)`}
                            {plan.data.keptGroups > 0 && plan.data.sharedGifts > 0 && " och"}
                            {plan.data.sharedGifts > 0 &&
                                ` ${plan.data.sharedGifts === 1 ? "en gåva" : `${plan.data.sharedGifts} gåvor`} som ni delar på`}
                            . Listor som du skapat och som har en annan admin lämnas över till den.
                        </p>
                    )}

                    <form className="form" onSubmit={confirm}>
                        <ErrorMessage message={error} />
                        <label className="field">
                            <span>
                                Skriv ditt användarnamn <strong>{user.username}</strong> för att bekräfta
                            </span>
                            <input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                disabled={busy}
                            />
                        </label>
                        <div className="form-actions">
                            <button type="submit" className="btn btn-danger" disabled={!matches || busy}>
                                <Trash2 size={16} aria-hidden="true" />
                                {busy ? "Raderar…" : "Radera kontot för alltid"}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                                Avbryt
                            </button>
                        </div>
                    </form>
                </>
            )}
        </Modal>
    );
}
