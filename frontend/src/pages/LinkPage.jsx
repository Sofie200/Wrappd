import { Save, UserCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import AuthLayout from "../components/AuthLayout.jsx";
import { ErrorMessage, Loading } from "../components/Feedback.jsx";
import InfoTip from "../components/InfoTip.jsx";

// /link/:token - the page a new user (or someone who forgot their password) opens to choose a password.
// A new user also sees the username made from their name - and can change it here.
export default function LinkPage() {
    const { token } = useParams();
    const { choosePassword } = useAuth();
    const navigate = useNavigate();
    const { data, error, loading } = useFetch(`/auth/link/${token}`);
    const [username, setUsername] = useState(null); // null = untouched: the suggested one
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
    const chosenUsername = username ?? data.username;

    async function handleSubmit(e) {
        e.preventDefault();
        if (password !== confirm) {
            setSubmitError("Lösenorden är inte likadana");
            return;
        }
        setBusy(true);
        setSubmitError(null);
        try {
            // Only sent when it was changed
            const changed = activating && chosenUsername.trim().toLowerCase() !== data.username;
            await choosePassword(token, password, changed ? chosenUsername.trim() : undefined);
            navigate("/", { replace: true });
        } catch (err) {
            setSubmitError(err.message);
            setBusy(false);
        }
    }

    return (
        <AuthLayout title={activating ? `Välkommen, ${data.name}!` : "Välj ett nytt lösenord"}>
            {activating ? (
                <p className="muted link-intro">Välj ett användarnamn och ett lösenord för ditt konto. Användarnamnet loggar du in med.</p>
            ) : (
                <>
                    <p className="muted link-intro">Välj ett nytt lösenord för kontot:</p>
                    <p className="link-username">{data.username}</p>
                </>
            )}

            <form onSubmit={handleSubmit} className="form">
                <ErrorMessage message={submitError} />

                {activating ? (
                    // A suggestion made from the name - keep it, or pick another
                    <label className="field">
                        <span>
                            Användarnamn{" "}
                            <InfoTip label="Om användarnamnet">Du kan behålla det förvalda användarnamnet - eller välja ett annat.</InfoTip>
                        </span>
                        <input
                            name="username"
                            value={chosenUsername}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            autoCapitalize="none"
                            pattern="[A-Za-z0-9._\-]{3,30}"
                            title="3-30 tecken: a-z, siffror, punkt, bindestreck eller understreck"
                            required
                        />
                    </label>
                ) : (
                    // Hidden username field, so the browser's password manager saves the right account
                    <input type="text" name="username" value={data.username} autoComplete="username" readOnly hidden />
                )}

                <label className="field">
                    <span>
                        Lösenord <InfoTip label="Om lösenordet">Minst 8 tecken.</InfoTip>
                    </span>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                        autoFocus={!activating}
                    />
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
                    {activating ? <UserCheck size={16} className="icon-lead" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                    {busy ? "Sparar…" : activating ? "Aktivera användare och logga in" : "Spara och logga in"}
                </button>
            </form>
        </AuthLayout>
    );
}
