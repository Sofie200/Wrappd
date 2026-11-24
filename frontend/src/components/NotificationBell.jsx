import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
    Bell,
    CheckCheck,
    CircleCheck,
    Gift,
    HatGlasses,
    Pencil,
    ScrollText,
    ShieldCheck,
    Sparkles,
    Trash2,
    UserCheck,
    Users,
    X,
} from "lucide-react";
import { api } from "../api.js";
import { formatShortDate } from "../format.js";
import { ErrorMessage, Loading } from "./Feedback.jsx";
import PersonModal from "./PersonModal.jsx";

// The bell in the top right: the number of unread notifications, and a panel that slides in from the right.
// The number is fetched every minute, when the window gets focus again, and on every new page.
// The panel fetches the notifications when it opens. A notification is read when it's clicked
// (or with "Markera alla som lästa"); "new wishes on a list" is also read by opening the list.
const POLL_MS = 60_000;

export default function NotificationBell() {
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const { pathname } = useLocation();

    const refresh = useCallback(() => {
        api("/notifications/unread")
            .then(({ count }) => setUnread(count))
            .catch(() => {}); // the number can wait until next time
    }, []);

    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, POLL_MS);
        window.addEventListener("focus", refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener("focus", refresh);
        };
    }, [refresh]);
    useEffect(refresh, [pathname, refresh]);

    const label = unread > 0 ? `Notiser, ${unread} olästa` : "Notiser";
    return (
        <>
            <button
                type="button"
                className="btn btn-ghost btn-icon notif-bell"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-label={label}
                title={label}
            >
                <Bell size={20} aria-hidden="true" />
                {unread > 0 && (
                    <span className="notif-badge" aria-hidden="true">
                        {unread > 99 ? "99+" : unread}
                    </span>
                )}
            </button>
            {open &&
                createPortal(
                    <NotificationPanel onUnread={setUnread} onClose={() => (setOpen(false), refresh())} />,
                    document.body
                )}
        </>
    );
}

function NotificationPanel({ onUnread, onClose }) {
    const ref = useRef(null);
    const titleId = useId();
    const navigate = useNavigate();
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);
    const [person, setPerson] = useState(null); // a wish profile opened from a notification

    const load = useCallback(() => {
        setError(null);
        api("/notifications")
            .then(({ data, unread }) => {
                setItems(data);
                onUnread(unread);
            })
            .catch((err) => setError(err.message));
    }, [onUnread]);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog.open) dialog.showModal();
        load();
        return () => {
            if (dialog.open) dialog.close();
        };
    }, [load]);

    async function markRead(ids) {
        setItems((prev) => prev?.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
        try {
            const { count } = await api("/notifications/read", { method: "POST", body: ids ? { ids } : {} });
            onUnread(count);
        } catch {
            // Still unread on the server - it shows again next time
        }
    }

    function openItem(n, target) {
        if (!n.read) markRead([n.id]);
        if (target.person) {
            setPerson(target.person); // over the panel - it closes when the wish profile does
        } else if (target.to) {
            onClose();
            navigate(target.to);
        }
    }

    const hasUnread = items?.some((n) => !n.read);

    return (
        <dialog
            ref={ref}
            className="notif-panel"
            aria-labelledby={titleId}
            onCancel={(e) => {
                e.preventDefault();
                onClose();
            }}
            onClick={(e) => {
                if (e.target === ref.current) onClose(); // the backdrop
            }}
        >
            <div className="notif-panel-inner">
                <header className="notif-panel-head">
                    <h2 id={titleId}>Notiser</h2>
                    {/* Right beside the heading */}
                    {hasUnread && (
                        <button type="button" className="btn btn-xs notif-read-all" onClick={() => markRead(null)}>
                            <CheckCheck size={16} aria-hidden="true" /> Markera alla som lästa
                        </button>
                    )}
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Stäng">
                        <X size={20} aria-hidden="true" />
                    </button>
                </header>

                {!items ? (
                    error ? <ErrorMessage message={error} onRetry={load} /> : <Loading />
                ) : items.length === 0 ? (
                    <p className="muted notif-empty">Inga notiser än. Här hamnar nyheter om dina grupper, listor och gåvor.</p>
                ) : (
                    <ul className="notif-list">
                        {items.map((n) => {
                            const d = describe(n);
                            const Icon = d.icon;
                            const clickable = Boolean(d.to || d.person);
                            const content = (
                                <>
                                    <span className={`notif-icon notif-icon-${d.tone}`} aria-hidden="true">
                                        <Icon size={18} />
                                    </span>
                                    <span className="notif-body">
                                        <span className="notif-text">{d.text}</span>
                                        <span className="notif-time">{timeAgo(n.createdAt)}</span>
                                    </span>
                                    {!n.read && <span className="notif-dot" aria-label="Oläst" />}
                                </>
                            );
                            return (
                                <li key={n.id} className={`notif-item${n.read ? "" : " is-unread"}`}>
                                    {clickable ? (
                                        <button type="button" className="notif-row" onClick={() => openItem(n, d)}>
                                            {content}
                                        </button>
                                    ) : (
                                        <div className="notif-row" onClick={() => !n.read && markRead([n.id])}>
                                            {content}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            {person && <PersonModal personId={person.id} santa={person.santa} onClose={() => setPerson(null)} />}
        </dialog>
    );
}

// What a notification says, its icon, and where a click takes you: { icon, tone, text, to? , person? }
function describe(n) {
    const B = ({ children }) => <strong>{children}</strong>;
    const actor = <B>{n.actor?.name ?? "Någon"}</B>;
    const count = n.data?.count ?? 1;
    const list = n.list && <B>{n.list.title}</B>;
    const listTo = n.list ? `/lists/${n.list.id}` : null;
    const giftTo = n.giftId ? `/gifts/${n.giftId}` : null;

    switch (n.type) {
        case "group_added":
            return {
                icon: Users,
                tone: "lavender",
                text: (
                    <>
                        {actor} lade till dig i gruppen <B>{n.group?.name ?? "…"}</B>
                        {n.data?.admin && " och gjorde dig till admin"}
                    </>
                ),
                to: n.group && `/groups/${n.group.id}`,
            };
        case "group_admin":
            return {
                icon: ShieldCheck,
                tone: "lavender",
                text: (
                    <>
                        {actor} gjorde dig till admin i gruppen <B>{n.group?.name ?? "…"}</B>
                    </>
                ),
                to: n.group && `/groups/${n.group.id}`,
            };
        case "list_new":
            return {
                icon: ScrollText,
                tone: "rose",
                text: (
                    <>
                        {actor} publicerade listan {list}
                        {n.list?.recipients && ` till ${n.list.recipients}`}
                        {n.data?.admin && " och gjorde dig till admin"}
                    </>
                ),
                to: listTo,
            };
        case "list_admin":
            return {
                icon: ShieldCheck,
                tone: "rose",
                text: (
                    <>
                        {actor} gjorde dig till admin för listan {list}
                    </>
                ),
                to: listTo,
            };
        case "list_wishes":
            return {
                icon: Sparkles,
                tone: "rose",
                text:
                    count === 1 ? (
                        <>En ny önskning på listan {list}</>
                    ) : (
                        <>
                            {count} nya önskningar på listan {list}
                        </>
                    ),
                to: listTo,
            };
        case "list_reserved":
            return {
                icon: CircleCheck,
                tone: "green",
                text:
                    count === 1 ? (
                        <>
                            {actor} reserverade något på {list}
                        </>
                    ) : (
                        <>
                            {count} nya reservationer på {list}
                        </>
                    ),
                to: listTo,
            };
        case "santa_new":
            return {
                icon: HatGlasses,
                tone: "orange",
                text: (
                    <>
                        {actor} har lagt till dig i en lottning för <B>{n.santa?.title ?? "…"}</B>
                    </>
                ),
                to: "/",
            };
        case "santa_wish":
            return {
                icon: Sparkles,
                tone: "orange",
                text:
                    count === 1 ? (
                        <>
                            <B>{n.person?.name}</B> har lagt till en ny önskning: <B>{n.data?.wishTitle}</B>
                        </>
                    ) : (
                        <>
                            <B>{n.person?.name}</B> har lagt till {count} nya önskningar i sin önskeprofil
                        </>
                    ),
                // The wish profile - reserving there counts for the Secret Santa
                person: n.person && { id: n.person.id, santa: n.santa && { id: n.santa.id, title: n.santa.title, date: n.santa.date } },
            };
        case "wish_changed":
            return {
                icon: Pencil,
                tone: "yellow",
                text: (
                    <>
                        {actor} har ändrat önskningen <B>{n.data?.wishTitle}</B> som du har reserverat
                    </>
                ),
                to: giftTo,
            };
        case "wish_deleted":
            return {
                icon: Trash2,
                tone: "yellow",
                text: (
                    <>
                        {actor} har tagit bort önskningen <B>{n.data?.wishTitle}</B> som du har reserverat.
                    </>
                ),
                to: giftTo,
            };
        case "gift_shared":
            return {
                icon: Gift,
                tone: "green",
                text: (
                    <>
                        {actor} delar gåvan <B>{n.giftTitle ?? "…"}</B> med dig
                    </>
                ),
                to: giftTo,
            };
        case "invite_accepted":
            return {
                icon: UserCheck,
                tone: "lavender",
                text: (
                    <>
                        <B>{n.person?.name ?? "Någon"}</B> har accepterat din inbjudan
                        {n.group && (
                            <>
                                {" "}
                                till <B>{n.group.name}</B>
                            </>
                        )}
                    </>
                ),
                to: n.group ? `/groups/${n.group.id}` : "/groups",
            };
        default:
            return { icon: Bell, tone: "lavender", text: "Ny notis" };
    }
}

// "nyss", "5 min sedan", "3 tim sedan", "igår", "4 dagar sedan" - then the date
function timeAgo(iso) {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return "nyss";
    if (minutes < 60) return `${minutes} min sedan`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} tim sedan`;
    const days = Math.round(hours / 24);
    if (days === 1) return "igår";
    if (days < 7) return `${days} dagar sedan`;
    return formatShortDate(iso.slice(0, 10));
}
