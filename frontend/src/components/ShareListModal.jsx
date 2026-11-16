import { useState } from "react";
import { Copy, Link2, Link2Off, RefreshCw } from "lucide-react";
import { api } from "../api.js";
import Modal from "./Modal.jsx";
import { ErrorMessage } from "./Feedback.jsx";

// "Dela" on a published list (admins): a secret link (wrappd.se/s/<token>) that shows the list's wishes
// and whether they're free or reserved to anyone who has it. Reserving still needs logging in, in one of
// the list's groups. A new link replaces the old one; "Sluta dela" turns the link off.
export default function ShareListModal({ listId, shareToken, onChanged, onClose }) {
    const [token, setToken] = useState(shareToken);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const url = token ? `${window.location.origin}/s/${token}` : "";

    async function run(action) {
        setBusy(true);
        setError(null);
        setCopied(false);
        try {
            const { shareToken: next } = await action();
            setToken(next);
            onChanged();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const create = () => run(() => api(`/lists/${listId}/share`, { method: "POST" }));

    function renew() {
        if (!window.confirm("Skapa en ny länk? Den gamla slutar fungera för alla som har den.")) return;
        create();
    }

    function stop() {
        if (!window.confirm("Sluta dela listan? Länken slutar fungera för alla som har den.")) return;
        run(() => api(`/lists/${listId}/share`, { method: "DELETE" }));
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            setError("Det gick inte att kopiera - markera länken och kopiera den själv.");
        }
    }

    return (
        <Modal title="Dela listan" onClose={onClose}>
            <p>Alla som har länken kan se önskningar och reservationer - det gäller även mottagaren, om hen får tag på länken.</p>
            <p className="muted small">För att reservera behöver man logga in och vara med i någon av listans grupper.</p>

            <ErrorMessage message={error} />

            {token ? (
                <>
                    <div className="share-link-row">
                        <input
                            className="share-link-input"
                            value={url}
                            readOnly
                            aria-label="Länk till listan"
                            onFocus={(e) => e.target.select()}
                        />
                        <button type="button" className="btn btn-primary" onClick={copy} disabled={busy}>
                            <Copy size={16} aria-hidden="true" /> {copied ? "Kopierad!" : "Kopiera"}
                        </button>
                    </div>
                    <div className="actions share-link-actions">
                        <button type="button" className="btn btn-small btn-ghost" onClick={renew} disabled={busy}>
                            <RefreshCw size={16} aria-hidden="true" /> Ny länk
                        </button>
                        <button type="button" className="btn btn-small btn-danger-ghost" onClick={stop} disabled={busy}>
                            <Link2Off size={16} aria-hidden="true" /> Sluta dela
                        </button>
                    </div>
                </>
            ) : (
                <div className="actions">
                    <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
                        <Link2 size={16} aria-hidden="true" /> Skapa länk
                    </button>
                </div>
            )}
        </Modal>
    );
}
