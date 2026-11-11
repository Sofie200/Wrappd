import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import { ErrorMessage, Notice } from "../components/Feedback.jsx";
import GoogleButton from "../components/GoogleButton.jsx";

export default function LoginPage() {
    const { user, login, loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    // Back to the page the user tried to open, or the overview
    const from = location.state?.from?.pathname ?? "/";

    if (user) return <Navigate to={from} replace />;

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await login(username, password);
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleGoogle(credential) {
        setBusy(true);
        setError(null);
        try {
            const signup = await loginWithGoogle(credential);
            // No account yet: choose a username first
            if (signup) navigate("/register/google", { state: { credential, signup, from } });
            else navigate(from, { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout title="Logga in">
            {location.state?.accountDeleted && <Notice>Ditt konto är raderat. Tack för att du använde Wrappd!</Notice>}
            <form onSubmit={handleSubmit} className="form">
                <ErrorMessage message={error} />

                <label className="field">
                    <span>Användarnamn</span>
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        autoCapitalize="none"
                        required
                    />
                </label>

                <label className="field">
                    <span>Lösenord</span>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                    />
                </label>

                <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? "Loggar in…" : "Logga in"}
                </button>
            </form>

            <GoogleButton text="signin_with" onCredential={handleGoogle} />

            <p className="auth-switch">
                Inget konto? <Link to="/register">Skapa ett</Link>
            </p>
            <p className="muted small auth-hint">
                Glömt lösenordet? Be en admin i någon av dina grupper om en länk där du kan välja ett nytt.
            </p>
        </AuthLayout>
    );
}
