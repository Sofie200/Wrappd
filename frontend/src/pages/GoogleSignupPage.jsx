import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import { ErrorMessage } from "../components/Feedback.jsx";

// /register/google – the last step of signing up with Google. Nothing is created until "Skapa konto":
// the name comes pre-filled from Google, the username is the user's own choice.
// location.state = { credential, signup: { name, username, email }, from? } – set by the login/register page.
export default function GoogleSignupPage() {
    const { user, signupWithGoogle } = useAuth();
    const navigate = useNavigate();
    const { state } = useLocation();
    const [name, setName] = useState(state?.signup?.name ?? "");
    const [username, setUsername] = useState(state?.signup?.username ?? "");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    if (user) return <Navigate to={state?.from ?? "/"} replace />;
    // Opened directly (or the page was reloaded in a new tab): start over
    if (!state?.credential) return <Navigate to="/register" replace />;

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await signupWithGoogle(state.credential, name, username);
            navigate(state.from ?? "/", { replace: true });
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <AuthLayout title="Välj användarnamn">
            <form onSubmit={handleSubmit} className="form">
                <ErrorMessage message={error} />

                {state.signup.email && (
                    <p className="muted">
                        Du skapar ett konto med <strong>{state.signup.email}</strong>.
                    </p>
                )}

                <label className="field">
                    <span>Namn</span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        maxLength={80}
                        required
                        disabled={busy}
                    />
                    <small>Så här ser andra dig, t.ex. "Anna Andersson".</small>
                </label>

                <label className="field">
                    <span>Användarnamn</span>
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        autoCapitalize="none"
                        pattern="[A-Za-z0-9._\-]{3,30}"
                        title="3–30 tecken: a–z, siffror, punkt, bindestreck eller understreck"
                        required
                        disabled={busy}
                    />
                    <small>
                        Andra kan hitta dig och bjuda in dig med ditt användarnamn. 3–30 tecken: a–z, siffror, punkt,
                        bindestreck eller understreck.
                    </small>
                </label>

                <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                    <Plus size={16} className="icon-lead" aria-hidden="true" />
                    {busy ? "Skapar konto…" : "Skapa konto"}
                </button>
            </form>

            <p className="auth-switch">
                Ångrat dig? <Link to="/register">Tillbaka</Link>
            </p>
        </AuthLayout>
    );
}
