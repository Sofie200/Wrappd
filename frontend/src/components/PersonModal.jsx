import { Link } from "react-router-dom";
import { Pencil, ThumbsDown, ThumbsUp } from "lucide-react";
import { useFetch } from "../hooks/useFetch.js";
import { categoryByKey } from "../wishCategories.js";
import Avatar from "./Avatar.jsx";
import { ErrorMessage, Loading } from "./Feedback.jsx";
import Modal from "./Modal.jsx";
import WishCard from "./WishCard.jsx";

// Someone's wish profile: what they like and don't like, and their own wishes (which can be reserved).
// The person themselves never sees what is reserved – the server doesn't send it to them.
export default function PersonModal({ personId, onClose }) {
    const { data, error, loading, reload } = useFetch(`/people/${personId}`);

    let content;
    if (!data) {
        content = loading ? <Loading /> : <ErrorMessage message={error} onRetry={reload} />;
    } else {
        const { person, profile, me, wishes } = data;
        const empty = !profile.about && profile.likes.length === 0 && profile.dislikes.length === 0 && wishes.length === 0;

        content = (
            <div className="person">
                <div className="person-head">
                    <Avatar isChild={person.isChild} id={person.id} icon={person.avatarIcon} color={person.avatarColor} size={64} />
                    <div>
                        <p className="person-name">{person.name}</p>
                        {person.username && (
                            <p className="small">
                                <strong className="username">{person.username}</strong>
                            </p>
                        )}
                    </div>
                    {me.canEdit && (
                        <Link to={`/people/${person.id}/edit`} className="btn btn-small btn-ghost person-edit" onClick={onClose}>
                            <Pencil size={16} aria-hidden="true" /> Redigera
                        </Link>
                    )}
                </div>

                {empty && (
                    <p className="empty">
                        {me.isOwner ? "Du har inte fyllt i din önskeprofil än." : `${person.name} har inte fyllt i något än.`}
                    </p>
                )}

                {profile.about && <p className="person-about">{profile.about}</p>}

                {(profile.likes.length > 0 || profile.dislikes.length > 0) && (
                    <div className="person-prefs">
                        {profile.likes.length > 0 && (
                            <div>
                                <h3 className="person-subhead">
                                    <ThumbsUp size={16} aria-hidden="true" /> Gillar
                                </h3>
                                <CategoryChips keys={profile.likes} variant="like" />
                            </div>
                        )}
                        {profile.dislikes.length > 0 && (
                            <div>
                                <h3 className="person-subhead">
                                    <ThumbsDown size={16} aria-hidden="true" /> Gillar inte
                                </h3>
                                <CategoryChips keys={profile.dislikes} variant="dislike" />
                            </div>
                        )}
                    </div>
                )}

                {wishes.length > 0 && (
                    <>
                        <h3 className="person-subhead">Önskningar ({wishes.length})</h3>
                        <div className="wishes">
                            {wishes.map((wish) => (
                                <WishCard key={wish.id} wish={wish} me={me} onChanged={reload} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <Modal title="Önskeprofil" onClose={onClose}>
            {content}
        </Modal>
    );
}

function CategoryChips({ keys, variant }) {
    return (
        <ul className="chips">
            {keys
                .filter((key) => categoryByKey[key])
                .map((key) => {
                    const { label, Icon } = categoryByKey[key];
                    return (
                        <li key={key} className={`chip chip-${variant}`}>
                            <Icon size={14} aria-hidden="true" /> {label}
                        </li>
                    );
                })}
        </ul>
    );
}
