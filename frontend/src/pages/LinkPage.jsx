import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import AuthLayout from "../components/AuthLayout.jsx";
import { ErrorMessage, Loading } from "../components/Feedback.jsx";

// /link/:token – the page a new user (or someone who forgot their password) opens to choose a password
export default function LinkPage() {
    const { token } = useParams();
    const { choosePassword } = useAuth();
    const navigate = useNavigate();
    const { data, error, loading } = useFetch(`/auth/link/${token}`);
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [submitError, setSubmitError] = useState(null);
    const [busy, setBusy] = useState(false);

    if (loading) {
        return (
            <AuthLayout title="Välj lösenord">
                <Loading />
            </AuthLayout>
        );
    }

    if (!data) {
        return (
            <AuthLayout title="Länken fungerar inte">
                <ErrorMessage message={error} />
                <p className="auth-switch">
                    <Link to="/login">Till inloggningen</Link>
                </p>
            </AuthLayout>
        );
    }

    const activating = data.purpose === "activate";

    async function handleSubmit(e) {
        e.preventDefault();
        if (password !== confirm) {
            setSubmitError("Lösenorden är inte likadana");
            return;
        }
        setBusy(true);
        setSubmitError(null);
        try {
            await choosePassword(token, password);
            navigate("/", { replace: true });
        } catch (err) {
            setSubmitError(err.message);
            setBusy(false);
        }
    }

    return (
        <AuthLayout title={activating ? `Välkommen, ${data.name}!` : "Välj ett nytt lösenord"}>
            <p className="muted">
                {activating
                    ? "Välj ett lösenord för ditt konto. Sedan loggar du in med:"
                    : "Välj ett nytt lösenord för kontot:"}
            </p>
            <p className="link-username">@{data.username}</p>

            <form onSubmit={handleSubmit} className="form">
                <ErrorMessage message={submitError} />

                {/* Hidden username field, so the browser's password manager saves the right account */}
                <input type="text" name="username" value={data.username} autoComplete="username" readOnly hidden />

                <label className="field">
                    <span>Lösenord</span>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                        autoFocus
                    />
                    <small>Minst 8 tecken.</small>
                </label>

                <label className="field">
                    <span>Upprepa lösenord</span>
                    <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                    />
                </label>

                <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? "Sparar…" : activating ? "Skapa lösenord och logga in" : "Spara och logga in"}
                </button>
            </form>
        </AuthLayout>
    );
}
