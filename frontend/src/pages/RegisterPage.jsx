import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import { ErrorMessage } from "../components/Feedback.jsx";

export default function RegisterPage() {
    const { user, register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: "", username: "", password: "", confirm: "" });
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
            await register(form.name, form.username, form.password);
            navigate("/", { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout title="Skapa konto">
            <form onSubmit={handleSubmit} className="form">
                <ErrorMessage message={error} />

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
                    {busy ? "Skapar konto…" : "Skapa konto"}
                </button>
            </form>

            <p className="auth-switch">
                Har du redan ett konto? <Link to="/login">Logga in</Link>
            </p>
        </AuthLayout>
    );
}
