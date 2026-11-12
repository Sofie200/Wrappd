import { useState } from "react";
import { Save } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { GOOGLE_CLIENT_ID } from "../config.js";
import Modal from "./Modal.jsx";
import GoogleButton from "./GoogleButton.jsx";
import { ErrorMessage } from "./Feedback.jsx";

// After logging in: a user with neither an email nor Google gets asked to add one of them.
// "Inte nu" hides it until the browser tab is closed - next visit it asks again.
const DISMISS_KEY = "emailPromptDismissed";

function isDismissed(userId) {
    try {
        return sessionStorage.getItem(DISMISS_KEY) === String(userId);
    } catch {
        return false;
    }
}

export default function EmailPrompt() {
    const { user, updateEmail, connectGoogle } = useAuth();
    const [dismissed, setDismissed] = useState(() => isDismissed(user.id));
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    if (user.email || user.googleConnected || dismissed) return null;

    function dismiss() {
        try {
            sessionStorage.setItem(DISMISS_KEY, String(user.id));
        } catch {
            // Private mode etc. - then it's only hidden until the page is reloaded
        }
        setDismissed(true);
    }

    async function run(action) {
        setBusy(true);
        setError(null);
        try {
            await action();
            // Success: user.email or user.googleConnected is now set, so the prompt disappears
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    function save(e) {
        e.preventDefault();
        run(() => updateEmail(email));
    }

    return (
        <Modal title="Lägg till din e-post" onClose={dismiss}>
            <p className="muted">
                Ditt konto saknar e-postadress. Lägg till en
                {GOOGLE_CLIENT_ID ? " eller koppla ditt Google-konto" : ""}, så blir det lättare att hålla koll på
                ditt konto.
            </p>
            <p className="muted small">Din e-postadress kommer inte att användas i marknadsföringssyfte.</p>

            <ErrorMessage message={error} />

            <form className="form" onSubmit={save}>
                <label className="field">
                    <span>E-post</span>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        autoCapitalize="none"
                        maxLength={254}
                        required
                        disabled={busy}
                    />
                </label>
                <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                        <Save size={16} aria-hidden="true" />
                        {busy ? "Sparar…" : "Spara"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={dismiss} disabled={busy}>
                        Inte nu
                    </button>
                </div>
            </form>

            {!busy && <GoogleButton text="continue_with" onCredential={(c) => run(() => connectGoogle(c))} />}
        </Modal>
    );
}
