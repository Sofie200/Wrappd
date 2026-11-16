import { ArrowRight, ArrowUpRight, CirclePlus, LogIn } from "lucide-react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { useFetch } from "../hooks/useFetch.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ErrorMessage, Loading, Notice } from "../components/Feedback.jsx";
import InfoTip from "../components/InfoTip.jsx";
import { formatDate, formatPrice, relativeDays } from "../format.js";
import { groupByPrice } from "../wishGroups.js";
import { APP_NAME } from "../config.js";

// /s/:token - a list someone shared with a link. Open to everyone, and looks like the list page in the app:
// the same header, "Önskningar" and the wishes in price groups - each with whether it's free or reserved
// (never by whom). Reserving happens in the app - logged in, in one of the list's groups.
export default function SharedListPage() {
    const { token } = useParams();
    const location = useLocation();
    const { user, checking } = useAuth();
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
            </>
        );
    } else if (data.me.canOpen) {
        // Logged in and allowed to see the list in the app (in one of its groups, or an admin):
        // straight to the app's version - reserving works there
        return <Navigate to={`/lists/${data.list.id}`} replace />;
    } else {
        content = <SharedList data={data} location={location} />;
    }

    // A page of its own, distinct from the app: the narrower card on the backdrop with the logo centred
    // (like logging in) - the list inside it looks like the list page: "Önskningar", price groups, wish rows
    return (
        <div className="auth">
            <article className="auth-card shared-list">
                <p className="auth-logo">
                    <Link to="/" className="logo">
                        <img src="/logo.png" alt={APP_NAME} id="logo" />
                    </Link>
                </p>
                {content}
                {!checking && user && (
                    <p className="auth-switch">
                        <Link to="/">Till {APP_NAME}</Link>
                    </p>
                )}
            </article>
        </div>
    );
}

function SharedList({ data, location }) {
    const { list, recipients, wishes, me } = data;

    // What I can do: log in, open it in the app to reserve - or why not
    const action = list.archived ? null : !me.loggedIn ? (
        <Link to="/login" state={{ from: location }} className="btn btn-primary">
            <LogIn size={16} aria-hidden="true" /> Logga in för att reservera
        </Link>
    ) : me.canOpen ? (
        <Link to={`/lists/${list.id}`} className="btn btn-primary">
            Öppna och reservera <ArrowRight size={16} aria-hidden="true" />
        </Link>
    ) : null;

    return (
        <>
            {/* Who it's for, the title, the date - like the list page's header */}
            <header className="shared-head">
                {recipients.length > 0 && (
                    <dl className="list-meta">
                        <div>
                            <dt>Till</dt>
                            <dd>{recipients.join(", ")}</dd>
                        </div>
                    </dl>
                )}
                <h1>{list.title}</h1>
                <p className="list-date">
                    {formatDate(list.endDate)} <span className="muted">· {relativeDays(list.endDate)}</span>
                </p>
                {list.description && <p className="list-description">{list.description}</p>}
                {action && <div className="actions shared-action">{action}</div>}
            </header>

            {list.archived && <Notice>Datumet har passerat, så det går inte att reservera längre.</Notice>}
            {!list.archived && me.loggedIn && !me.canOpen && me.isRecipient && (
                <Notice>Listan är till dig. Här syns vad som är reserverat - hoppa över det om du vill bli överraskad!</Notice>
            )}
            {!list.archived && me.loggedIn && !me.canOpen && !me.isRecipient && (
                <Notice>
                    För att reservera behöver du vara med i någon av listans grupper. Be den som delade listan att bjuda in dig.
                </Notice>
            )}

            <section className="section">
                <div className="section-head">
                    <h2>
                        Önskningar ({wishes.length}){" "}
                        {!list.archived && !me.isRecipient && (
                            <InfoTip label="Vem kan reservera?">
                                Bara den som är inloggad och med i någon av listans grupper kan reservera. Logga in, så
                                kommer du till listan i {APP_NAME} och kan reservera där.
                            </InfoTip>
                        )}
                    </h2>
                </div>

                {wishes.length === 0 ? (
                    <p className="muted">Listan har inga önskningar än. Titta in igen lite senare!</p>
                ) : (
                    groupByPrice(wishes).map((group) => (
                        <section key={group.key} className="price-group" aria-labelledby={`price-${group.key}`}>
                            <h3 id={`price-${group.key}`} className="subhead">
                                {group.title} <span className="muted small">({group.wishes.length})</span>
                            </h3>
                            <div className="wishes">
                                {group.wishes.map((wish) => (
                                    <SharedWish
                                        key={wish.id}
                                        wish={wish}
                                        // "Reservera" on what's left - not after the date, and not for the recipient
                                        reserve={list.archived || me.isRecipient ? null : me.loggedIn ? "denied" : "login"}
                                        location={location}
                                    />
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </section>
        </>
    );
}

// One wish, in the same row look as in the app - but nothing to open: a wish with a link goes to the shop.
// reserve: "login" - "Reservera" leads to logging in (then on to the list in the app, if I'm in its groups);
// "denied" - logged in but not in the list's groups: greyed out; null - no button.
function SharedWish({ wish, reserve, location }) {
    const full = wish.reserved >= wish.quantity;
    const quick = Boolean(reserve) && !full;
    // Like in the app: a badge only when something is reserved (none for "free"), and a fully reserved
    // wish toned down (.wish-full)
    const status = full ? "Reserverad" : `Reserverad ${wish.reserved}/${wish.quantity}`;
    const badgeClass = full ? "badge-gift" : "badge-partial";

    const inner = (
        <>
            {wish.imageUrl ? (
                <img className="wish-image" src={wish.imageUrl} alt="" loading="lazy" />
            ) : (
                <img className="wish-image wish-image-empty" src="/gift-placeholder.png" alt="" />
            )}
            <span className="wish-summary">
                <span className="wish-title">
                    {wish.title}
                    {wish.url && <ArrowUpRight size={14} aria-hidden="true" className="shared-wish-link-icon" />}
                </span>
                {(wish.price !== null || wish.quantity > 1) && (
                    <span className="wish-meta">
                        {wish.price !== null && <span className="price">{formatPrice(wish.price)}</span>}
                        {wish.quantity > 1 && <span className="muted">{wish.quantity} st</span>}
                    </span>
                )}
            </span>
            {wish.reserved > 0 && (
                <span className="wish-reserved">
                    <span className={`badge ${badgeClass}`}>{status}</span>
                </span>
            )}
        </>
    );

    return (
        <div className={`wish-row${quick ? " has-quick" : ""}`}>
            {wish.url ? (
                <a
                    className={`wish wish-static${full ? " wish-full" : ""}`}
                    href={wish.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title="Öppna i butiken"
                >
                    {inner}
                </a>
            ) : (
                <div className={`wish wish-static${full ? " wish-full" : ""}`}>{inner}</div>
            )}
            {/* The same "Reservera" as in the app - out on the right of the row */}
            {quick === true && reserve === "login" && (
                <Link
                    to="/login"
                    state={{ from: location }}
                    className="btn btn-small btn-primary wish-quick-reserve"
                    aria-label={`Logga in för att reservera ${wish.title}`}
                    title="Logga in för att reservera"
                >
                    <CirclePlus size={16} aria-hidden="true" /> Reservera
                </Link>
            )}
            {quick === true && reserve === "denied" && (
                <button
                    type="button"
                    className="btn btn-small btn-primary wish-quick-reserve"
                    disabled
                    title="Bara den som är med i någon av listans grupper kan reservera"
                >
                    <CirclePlus size={16} aria-hidden="true" /> Reservera
                </button>
            )}
        </div>
    );
}
