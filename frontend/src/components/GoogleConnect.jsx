import { useState } from "react";
import { CircleCheck, Unlink } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { GOOGLE_CLIENT_ID } from "../config.js";
import GoogleButton from "./GoogleButton.jsx";
import { ErrorMessage } from "./Feedback.jsx";

// On the profile page: connect a Google account, so I can log in with Google too - or disconnect it
export default function GoogleConnect() {
    const { user, connectGoogle, disconnectGoogle } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    if (!GOOGLE_CLIENT_ID) return null;

    async function run(action) {
        setBusy(true);
        setError(null);
        try {
            await action();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="google-connect" aria-labelledby="google-connect-title">
            <h2 id="google-connect-title">Logga in med Google</h2>
            <ErrorMessage message={error} />

            {user.googleConnected ? (
                <>
                    <p className="google-connect-status">
                        <CircleCheck size={18} aria-hidden="true" /> Ditt konto är kopplat till Google.
                    </p>
                    {user.hasPassword ? (
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => run(disconnectGoogle)}
                            disabled={busy}
                        >
                            <Unlink size={16} aria-hidden="true" />
                            {busy ? "Tar bort…" : "Ta bort kopplingen"}
                        </button>
                    ) : (
                        <p className="muted small">
                            Du har inget lösenord, så Google är ditt sätt att logga in. Kopplingen kan därför inte tas
                            bort.
                        </p>
                    )}
                </>
            ) : (
                <>
                    <p className="muted small">
                        Koppla ditt Google-konto, så kan du logga in med Google i stället för användarnamn och lösenord.
                    </p>
                    {busy ? (
                        <p className="muted small">Kopplar…</p>
                    ) : (
                        <GoogleButton
                            text="continue_with"
                            divider={false}
                            onCredential={(credential) => run(() => connectGoogle(credential))}
                        />
                    )}
                </>
            )}
        </section>
    );
}
