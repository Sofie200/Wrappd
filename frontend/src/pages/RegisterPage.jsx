import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import { ErrorMessage } from "../components/Feedback.jsx";
import GoogleButton from "../components/GoogleButton.jsx";
import { GOOGLE_CLIENT_ID } from "../config.js";

export default function RegisterPage() {
    const { user, register, loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: "", username: "", email: "", password: "", confirm: "" });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    if (user) return <Navigate to="/" replace />;

    const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    async function handleSubmit(e) {
        e.preventDefault();
        if (form.password !== form.confirm) {
            setError("Lösenorden är inte likadana");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await register(form.name, form.username, form.email, form.password);
            navigate("/", { replace: true });
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
            // No account yet (the usual case here): choose a username first
            if (signup) navigate("/register/google", { state: { credential, signup } });
            else navigate("/", { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout title="Skapa konto">
            <ErrorMessage message={error} />

            {/* Quickest: an account straight from Google – name and email come from there */}
            <GoogleButton text="signup_with" divider={false} onCredential={handleGoogle} />
            {GOOGLE_CLIENT_ID && (
                <div className="auth-divider">
                    <span>eller fyll i själv</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="form">

                <label className="field">
                    <span>Namn</span>
                    <input name="name" value={form.name} onChange={update} autoComplete="name" required maxLength={80} />
                    <small>Så här ser andra dig, t.ex. "Anna Andersson".</small>
                </label>

                <label className="field">
                    <span>Användarnamn</span>
                    <input
                        name="username"
                        value={form.username}
                        onChange={update}
                        autoComplete="username"
                        autoCapitalize="none"
                        pattern="[A-Za-z0-9._\-]{3,30}"
                        title="3–30 tecken: a–z, siffror, punkt, bindestreck eller understreck"
                        required
                    />
                    <small>3–30 tecken: a–z, siffror, punkt, bindestreck eller understreck.</small>
                </label>

                <label className="field">
                    <span>E-post</span>
                    <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={update}
                        autoComplete="email"
                        autoCapitalize="none"
                        maxLength={254}
                        required
                    />
                </label>

                <label className="field">
                    <span>Lösenord</span>
                    <input
                        type="password"
                        name="password"
                        value={form.password}
                        onChange={update}
                        autoComplete="new-password"
                        minLength={8}
                        required
                    />
                    <small>Minst 8 tecken.</small>
                </label>

                <label className="field">
                    <span>Upprepa lösenord</span>
                    <input
                        type="password"
                        name="confirm"
                        value={form.confirm}
                        onChange={update}
                        autoComplete="new-password"
                        minLength={8}
                        required
                    />
                </label>

                <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                    <Plus size={16} className="icon-lead" aria-hidden="true" />
                    {busy ? "Skapar konto…" : "Skapa konto"}
                </button>
            </form>

            <p className="muted small auth-hint">
                När du skapar ett konto sparar vi uppgifterna ovan. Läs hur vi hanterar dem i vår{" "}
                <Link to="/integritet">integritetspolicy</Link>.
            </p>

            <p className="auth-switch">
                Har du redan ett konto? <Link to="/login">Logga in</Link>
            </p>
        </AuthLayout>
    );
}
