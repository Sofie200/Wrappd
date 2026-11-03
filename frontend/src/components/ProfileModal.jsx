import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { AVATAR_COLORS, AVATAR_ICONS, DEFAULT_COLOR, DEFAULT_ICON } from "../profileOptions.js";
import Avatar from "./Avatar.jsx";
import { ErrorMessage } from "./Feedback.jsx";
import Modal from "./Modal.jsx";

// Edit my profile: name, icon and colour – with a live preview
export default function ProfileModal({ onClose }) {
    const { user, updateProfile } = useAuth();
    const [name, setName] = useState(user.name);
    const [icon, setIcon] = useState(user.avatarIcon ?? DEFAULT_ICON);
    const [color, setColor] = useState(user.avatarColor ?? DEFAULT_COLOR);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function save(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await updateProfile({ name, avatarIcon: icon, avatarColor: color });
            onClose();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <Modal title="Min profil" onClose={onClose}>
            <form className="form" onSubmit={save}>
                <div className="profile-preview">
                    <Avatar icon={icon} color={color} size={72} />
                    <div>
                        <strong>{name.trim() || "Ditt namn"}</strong>
                        <div className="small">
                            <strong className="username">{user.username}</strong>
                        </div>
                    </div>
                </div>

                <label className="field">
                    <span>Namn</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required disabled={busy} />
                </label>

                <fieldset className="fieldset">
                    <legend>Ikon</legend>
                    <div className="avatar-choices">
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

                <fieldset className="fieldset">
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
                        {busy ? "Sparar…" : "Spara"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                        Avbryt
                    </button>
                </div>
            </form>
        </Modal>
    );
}
