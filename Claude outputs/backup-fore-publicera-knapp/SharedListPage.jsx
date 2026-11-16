import { ArrowRight, ArrowUpRight, LogIn } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useFetch } from "../hooks/useFetch.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import { formatDate, formatPrice, relativeDays } from "../format.js";
import { APP_NAME } from "../config.js";

// /s/:token - a list someone shared with a link. Open to everyone: the wishes, and whether each is free or
// reserved (never by whom). Reserving happens in the app - logged in, in one of the list's groups.
export default function SharedListPage() {
    const { token } = useParams();
    const location = useLocation();
    const { checking } = useAuth();
    // Wait for the login check, so a logged-in visitor gets "Öppna listan" at once
    const { data, error, loading } = useFetch(checking ? null : `/share/${token}`);

    let content;
    if (checking || (loading && !data)) {
        content = <Loading />;
    } else if (!data) {
        content = (
            <>
                <h1>Länken fungerar inte</h1>
                <ErrorMessage message={error} />
                <p>
                    <Link to="/">Till {APP_NAME}</Link>
                </p>
            </>
        );
    } else {
        const { list, recipients, wishes, me } = data;
        content = (
            <>
                <p className="shared-kicker">Önskelista{recipients.length > 0 && ` till ${recipients.join(", ")}`}</p>
                <h1>{list.title}</h1>
                <p className="list-date">
                    {formatDate(list.endDate)} <span className="muted">· {relativeDays(list.endDate)}</span>
                </p>
                {list.description && <p className="list-description">{list.description}</p>}

                {/* What I can do: log in, open it in the app to reserve - or why not */}
                {list.archived ? (
                    <Notice>Datumet har passerat, så det går inte att reservera längre.</Notice>
                ) : !me.loggedIn ? (
                    <div className="shared-cta">
                        <p>Vill du reservera något? Logga in, så kan du göra det om du är med i någon av listans grupper.</p>
                        <Link to="/login" state={{ from: location }} className="btn btn-primary">
                            <LogIn size={16} aria-hidden="true" /> Logga in för att reservera
                        </Link>
                    </div>
                ) : me.canOpen ? (
                    <div className="shared-cta">
                        <Link to={`/lists/${list.id}`} className="btn btn-primary">
                            Öppna listan och reservera <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                    </div>
                ) : me.isRecipient ? (
                    <Notice>Listan är till dig. Här syns vad som är reserverat - hoppa över det om du vill bli överraskad!</Notice>
                ) : (
                    <Notice>
                        För att reservera behöver du vara med i någon av listans grupper. Be den som delade listan att bjuda in
                        dig.
                    </Notice>
                )}

                {wishes.length === 0 ? (
                    <p className="muted">Listan har inga önskningar än.</p>
                ) : (
                    <ul className="shared-wishes">
                        {wishes.map((wish) => {
                            const full = wish.reserved >= wish.quantity;
                            return (
                                <li key={wish.id} className="shared-wish">
                                    {wish.imageUrl ? (
                                        <img className="shared-wish-image" src={wish.imageUrl} alt="" loading="lazy" />
                                    ) : (
                                        <img className="shared-wish-image wish-image-empty" src="/gift-placeholder.png" alt="" />
                                    )}
                                    <div className="shared-wish-body">
                                        <p className="shared-wish-title">
                                            {wish.url ? (
                                                <a href={wish.url} target="_blank" rel="noopener noreferrer nofollow">
                                                    {wish.title} <ArrowUpRight size={14} aria-hidden="true" />
                                                </a>
                                            ) : (
                                                wish.title
                                            )}
                                        </p>
                                        {wish.description && <p className="muted small">{wish.description}</p>}
                                        <p className="shared-wish-meta">
                                            {wish.price !== null && <span>{formatPrice(wish.price)}</span>}
                                            {wish.quantity > 1 && <span className="muted">{wish.quantity} st</span>}
                                            <span
                                                className={`badge ${full ? "badge-gift" : wish.reserved > 0 ? "badge-partial" : "badge-free"}`}
                                            >
                                                {full
                                                    ? "Reserverad"
                                                    : wish.reserved > 0
                                                      ? `Reserverad ${wish.reserved}/${wish.quantity}`
                                                      : "Ledig"}
                                            </span>
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </>
        );
    }

    return (
        <div className="auth">
            <article className="auth-card shared-list">
                <p className="auth-logo">
                    <Link to="/" className="logo">
                        <img src="/logo.png" alt={APP_NAME} id="logo" />
                    </Link>
                </p>
                {content}
            </article>
        </div>
    );
}
