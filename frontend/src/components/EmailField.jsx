import { useState } from "react";
import { BadgeCheck, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { ErrorMessage } from "./Feedback.jsx";

// On the profile page, inside its form: my email - shown but not changeable.
// Without an email it can be added here (its own button, not the profile form's "Spara").
export default function EmailField({ disabled }) {
    const { user, updateEmail } = useAuth();
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    if (user.email) {
        return (
            <div className="field">
                <span id="profile-email-label">E-post</span>
                <input type="email" value={user.email} readOnly disabled aria-labelledby="profile-email-label" />
                <small className={user.emailVerified ? "email-verified" : undefined}>
                    {user.emailVerified && <BadgeCheck size={14} aria-hidden="true" />}
                    {user.emailVerified ? "Bekräftad via Google. " : ""}
                    E-postadressen kan inte ändras.
                </small>
            </div>
        );
    }

    async function add() {
        setBusy(true);
        setError(null);
        try {
            await updateEmail(email);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="field">
            <span id="profile-email-label">E-post</span>
            <ErrorMessage message={error} />
            <div className="email-add">
                <input
                    aria-labelledby="profile-email-label"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    // Enter adds the email instead of submitting the whole profile form
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            if (email.trim()) add();
                        }
                    }}
                    autoComplete="email"
                    autoCapitalize="none"
                    maxLength={254}
                    disabled={disabled || busy}
                />
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={add}
                    disabled={disabled || busy || !email.trim()}
                >
                    <Plus size={16} aria-hidden="true" />
                    {busy ? "Lägger till…" : "Lägg till"}
                </button>
            </div>
            <small>Du har ingen e-postadress än. Den kan inte ändras när den väl är tillagd.</small>
        </div>
    );
}
