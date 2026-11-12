import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Save, UserPen } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { AVATAR_COLORS, AVATAR_ICONS, DEFAULT_COLOR, DEFAULT_ICON } from "../profileOptions.js";
import Avatar from "../components/Avatar.jsx";
import { ErrorMessage } from "../components/Feedback.jsx";
import GoogleConnect from "../components/GoogleConnect.jsx";
import EmailField from "../components/EmailField.jsx";
import DeleteAccount from "../components/DeleteAccount.jsx";

// /profile - edit my profile: name, icon and colour - with a live preview
export default function ProfilePage() {
    const { user, updateProfile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [name, setName] = useState(user.name);
    const [username, setUsername] = useState(user.username);
    const [icon, setIcon] = useState(user.avatarIcon ?? DEFAULT_ICON);
    const [color, setColor] = useState(user.avatarColor ?? DEFAULT_COLOR);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // Back to where the user came from, or the overview if the page was opened directly
    function close() {
        if (location.key !== "default") navigate(-1);
        else navigate("/");
    }

    async function save(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await updateProfile({ name, username, avatarIcon: icon, avatarColor: color });
            close();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="page">
            <h1 className="title-with-icon">
                <UserPen size={28} aria-hidden="true" /> Min profil
            </h1>

            <div className="profile-layout">
                <form className="form profile-form" onSubmit={save}>
                    <label className="field">
                        <span>Namn</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required disabled={busy} />
                    </label>

                    <label className="field">
                        <span>Användarnamn</span>
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            autoCapitalize="none"
                            pattern="[A-Za-z0-9._\-]{3,30}"
                            title="3-30 tecken: a-z, siffror, punkt, bindestreck eller understreck"
                            required
                            disabled={busy}
                        />
                        <small>Det du loggar in med. 3-30 tecken: a-z, siffror, punkt, bindestreck eller understreck.</small>
                    </label>

                    <EmailField disabled={busy} />

                    <fieldset className="fieldset fieldset-plain">
                        <legend>Ikon</legend>
                        <div className="avatar-choices avatar-choices-icons">
                            {Object.entries(AVATAR_ICONS).map(([key, { label }]) => (
                                <label key={key} className="avatar-choice" title={label}>
                                    <input
                                        type="radio"
                                        name="avatar-icon"
                                        value={key}
                                        checked={icon === key}
                                        onChange={() => setIcon(key)}
                                        disabled={busy}
                                        className="visually-hidden"
                                    />
                                    <Avatar icon={key} color={color} size={44} />
                                    <span className="visually-hidden">{label}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className="fieldset fieldset-plain">
                        <legend>Färg</legend>
                        <div className="avatar-choices">
                            {Object.entries(AVATAR_COLORS).map(([key, { label, value }]) => (
                                <label key={key} className="avatar-choice" title={label}>
                                    <input
                                        type="radio"
                                        name="avatar-color"
                                        value={key}
                                        checked={color === key}
                                        onChange={() => setColor(key)}
                                        disabled={busy}
                                        className="visually-hidden"
                                    />
                                    <span className="color-swatch" style={{ background: value }} aria-hidden="true" />
                                    <span className="visually-hidden">{label}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <ErrorMessage message={error} />

                    <div className="form-actions">
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            <Save size={16} aria-hidden="true" />
                            {busy ? "Sparar…" : "Spara"}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>
                            Avbryt
                        </button>
                    </div>
                </form>

                {/* How the profile looks - updates live as you change the form */}
                <aside className="profile-aside" aria-label="Förhandsgranskning">
                    <p className="profile-aside-label">Förhandsgranskning</p>
                    <div className="profile-card">
                        <Avatar icon={icon} color={color} size={52} />
                        <div className="profile-card-text">
                            <span className="profile-card-name">{name.trim() || "Ditt namn"}</span>
                            <span className="username">@{username.trim().toLowerCase() || user.username}</span>
                        </div>
                    </div>
                </aside>
            </div>

            <GoogleConnect />
            <DeleteAccount />
        </div>
    );
}
