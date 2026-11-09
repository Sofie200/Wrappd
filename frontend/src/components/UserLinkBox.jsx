import { useState } from "react";
import { Check, Copy, X } from "lucide-react";

// Shows an activation/reset link for the admin to copy and send to the person
export default function UserLinkBox({ user, link, onClose }) {
    const [copied, setCopied] = useState(false);
    const url = `${window.location.origin}/link/${link.token}`;
    const expires = new Date(link.expiresAt).toLocaleDateString("sv-SE", { day: "numeric", month: "long" });

    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // No clipboard access (e.g. not https) – the text field can still be copied by hand
        }
    }

    return (
        <div className="link-box" id="user-link" role="status">
            <div className="link-box-head">
                <strong>
                    {link.purpose === "activate"
                        ? `Aktiveringslänk till ${user.name}`
                        : `Länk för nytt lösenord till ${user.name}`}
                </strong>
                {/* The same round close button as the modals */}
                <button type="button" className="modal-close" onClick={onClose} aria-label="Stäng" title="Stäng">
                    <X size={20} aria-hidden="true" />
                </button>
            </div>

            <p className="small">
                Skicka länken till {user.name}. Där väljer hen ett lösenord och loggar in som <strong>{user.username}</strong>.
            </p>

            <div className="link-box-row">
                <input value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Länk" />
                <button type="button" className="btn btn-primary" onClick={copy}>
                    {copied ? (
                        <>
                            <Check size={16} aria-hidden="true" /> Kopierad!
                        </>
                    ) : (
                        <>
                            <Copy size={16} aria-hidden="true" /> Kopiera
                        </>
                    )}
                </button>
            </div>

            <p className="muted small">
                Länken fungerar en gång och gäller till {expires}. Länken visas bara nu – går den förlorad kan du ta fram en ny.
            </p>
        </div>
    );
}
