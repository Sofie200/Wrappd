import { useState } from "react";
import { useParams } from "react-router-dom";
import { Heart, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { ErrorMessage, Loading } from "../components/Feedback.jsx";
import Avatar from "../components/Avatar.jsx";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import WishCard from "../components/WishCard.jsx";
import WishForm from "../components/WishForm.jsx";
import Modal from "../components/Modal.jsx";
import { WISH_CATEGORIES } from "../wishCategories.js";

// The same limit as MAX_PROFILE_WISHES in api/_routes/people-routes.js
const MAX_WISHES = 3;

// /people/:id/edit – edit a wish profile: my own, or my child's.
// Free text, categories (like / don't like / neither), and wishes without a list.
export default function WishProfilePage() {
    const { id } = useParams();
    const { data, error, loading, reload } = useFetch(`/people/${id}`);

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;
    if (!data.me.canEdit) return <ErrorMessage message="Du kan bara redigera din egen önskeprofil och dina barns." />;

    // A new form when the server's data changes, so it starts from what's saved
    return <WishProfileForm key={JSON.stringify(data.profile)} data={data} reload={reload} />;
}

function WishProfileForm({ data, reload }) {
    const { user } = useAuth();
    const { person, profile, me, wishes } = data;
    const isMe = person.id === user.id;

    const [about, setAbout] = useState(profile.about ?? "");
    // key → "like" | "dislike"; categories not in it are neither
    const [prefs, setPrefs] = useState(() => ({
        ...Object.fromEntries(profile.likes.map((k) => [k, "like"])),
        ...Object.fromEntries(profile.dislikes.map((k) => [k, "dislike"])),
    }));
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);

    // Pressing the same choice again clears it
    function choose(key, value) {
        setSaved(false);
        setPrefs((prev) => {
            const next = { ...prev };
            if (next[key] === value) delete next[key];
            else next[key] = value;
            return next;
        });
    }

    async function save(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api(`/people/${person.id}/profile`, {
                method: "PUT",
                body: {
                    about,
                    likes: Object.keys(prefs).filter((k) => prefs[k] === "like"),
                    dislikes: Object.keys(prefs).filter((k) => prefs[k] === "dislike"),
                },
            });
            setSaved(true);
            reload();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="page page-narrow">
            {/* Your own profile is reached from the menu – just the title. A child's gets a way back and its avatar. */}
            {isMe ? (
                <h1 className="title-with-icon">
                    <Heart size={26} aria-hidden="true" /> Min önskeprofil
                </h1>
            ) : (
                <>
                    <Breadcrumbs items={[{ label: "Mina barn", to: "/children" }, { label: `${person.name}s önskeprofil` }]} />
                    <div className="profile-preview">
                        <Avatar isChild={person.isChild} id={person.id} icon={person.avatarIcon} color={person.avatarColor} size={56} />
                        <div>
                            <h1 className="title-with-icon">
                                <Heart size={26} aria-hidden="true" /> {person.name}s önskeprofil
                            </h1>
                        </div>
                    </div>
                </>
            )}
            <p className="muted">
                Det här ser alla som är med i en grupp med {isMe ? "dig" : person.name} när de klickar på namnet.
                {isMe ? " Du ser aldrig vad andra har reserverat åt dig." : ""}
            </p>

            <form className="form" onSubmit={save}>
                <label className="field">
                    <span>Om {isMe ? "mig" : person.name}</span>
                    <textarea
                        value={about}
                        onChange={(e) => {
                            setAbout(e.target.value);
                            setSaved(false);
                        }}
                        rows={4}
                        maxLength={2000}
                        placeholder="T.ex. Jag älskar mörk choklad och deckare, men har redan alldeles för många ljus."
                        disabled={busy}
                    />
                    <small>
                        Önskar {isMe ? "du dig" : `${person.name} sig`} kläder eller skor, ange gärna storlekar, t.ex. "T-shirt M,
                        byxor 32/32, skor 39".
                    </small>
                </label>

                <fieldset className="fieldset">
                    <legend>Kategorier</legend>
                    <p className="muted small">Tryck på tummen upp eller ner. Tryck igen för att ångra.</p>
                    <ul className="pref-grid">
                        {WISH_CATEGORIES.map(({ key, label, Icon }) => {
                            const value = prefs[key];
                            return (
                                <li key={key} className={`pref${value ? ` pref-${value}` : ""}`}>
                                    <span className="pref-label">
                                        <Icon size={18} aria-hidden="true" /> {label}
                                    </span>
                                    <span className="pref-buttons">
                                        <button
                                            type="button"
                                            className="pref-btn pref-btn-like"
                                            aria-pressed={value === "like"}
                                            aria-label={`Gillar ${label.toLowerCase()}`}
                                            title="Gillar"
                                            onClick={() => choose(key, "like")}
                                            disabled={busy}
                                        >
                                            <ThumbsUp size={16} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            className="pref-btn pref-btn-dislike"
                                            aria-pressed={value === "dislike"}
                                            aria-label={`Gillar inte ${label.toLowerCase()}`}
                                            title="Gillar inte"
                                            onClick={() => choose(key, "dislike")}
                                            disabled={busy}
                                        >
                                            <ThumbsDown size={16} aria-hidden="true" />
                                        </button>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </fieldset>

                <ErrorMessage message={error} />
                <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                        {busy ? "Sparar…" : "Spara"}
                    </button>
                    {saved && <span className="small reserved-by-me">✓ Sparat</span>}
                </div>
            </form>

            <section className="section">
                <div className="section-head">
                    <h2>
                        Önskningar{" "}
                        <span className="muted small">
                            ({wishes.length} av {MAX_WISHES})
                        </span>
                    </h2>
                    {wishes.length < MAX_WISHES && (
                        <button type="button" className="btn btn-small" onClick={() => setAdding(true)} aria-haspopup="dialog">
                            <Sparkles size={16} aria-hidden="true" /> Lägg till önskning
                        </button>
                    )}
                </div>
                <p className="muted small">
                    Upp till {MAX_WISHES} önskningar som inte hör till någon lista. Andra kan reservera dem
                    {isMe ? " – men du ser aldrig vad som är reserverat." : "."}
                    {wishes.length >= MAX_WISHES && " Ta bort en för att kunna lägga till en ny."}
                </p>

                {adding && (
                    <Modal title="Lägg till önskning" onClose={() => setAdding(false)}>
                        <WishForm
                            createPath={`/people/${person.id}/wishes`}
                            onSaved={() => {
                                setAdding(false);
                                reload();
                            }}
                            onCancel={() => setAdding(false)}
                        />
                    </Modal>
                )}

                {wishes.length > 0 && (
                    <div className="wishes">
                        {wishes.map((wish) => (
                            <WishCard key={wish.id} wish={wish} me={me} onChanged={reload} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
