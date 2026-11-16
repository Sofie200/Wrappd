import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { titleSizeClass } from "../format.js";
import { Gift, GlobeCheck, Lock, ScrollText, Share2, Sparkles } from "lucide-react";
import DateBadge, { EventDate } from "./DateBadge.jsx";
import ShareListModal from "./ShareListModal.jsx";

// A list as a card in the overview's event style - only the coloured panel, no gifts column.
// Used on Mina listor and on a group's page.
//  - Published: the rose panel, "Önskelista", and "Se lista" at the bottom right.
//  - Private: the same panel inverted (white with rose details), "Privat lista", and the pencil opens it.
//  - To me (and not mine to run): the lavender panel and no links - I can't open it.
//  - Archived: toned down, like past events.
// onChanged: reload after publishing - given where the cards are my own lists (the overview, Mina listor)
export default function ListPanelCard({ list, onChanged = null }) {
    const isPrivate = !list.isPublic;
    const toMe = Boolean(list.isRecipient);
    const canOpen = !toMe || list.isAdmin !== false;
    const kind = isPrivate ? " event-light" : toMe ? " event-to-me" : "";
    const variant = kind + (list.archived ? " event-archived" : "");

    // EXPERIMENT: "Publicera" straight on a private card of mine - the same as the button on the list's page
    const canPublish = isPrivate && !list.archived && Boolean(onChanged);
    const [publishing, setPublishing] = useState(false);
    // "Dela" right after the title: a published list of mine, before the date (where the page can reload)
    const canShare = !isPrivate && !list.archived && Boolean(onChanged);
    const [sharing, setSharing] = useState(false);
    async function publish() {
        const empty = list.wishCount === 0 ? "\n\nListan har inga önskningar än." : "";
        if (!window.confirm(`Publicera "${list.title}" för listans grupper?${empty}\n\nEn publik lista kan inte göras privat igen.`)) return;
        setPublishing(true);
        try {
            await api(`/lists/${list.id}/publish`, { method: "POST" });
            onChanged();
        } catch (err) {
            window.alert(err.message);
            setPublishing(false);
        }
    }

    const stats = (
        <p className="event-stats">
            <span>
                <Sparkles size={16} aria-hidden="true" /> {list.wishCount} {list.wishCount === 1 ? "önskning" : "önskningar"}
            </span>
            {/* Never on lists to me (the server sends null there), nor on private lists - nobody can reserve yet */}
            {list.reservedCount != null && !isPrivate && (
                <span>
                    <Gift size={16} aria-hidden="true" /> {list.reservedCount} reserverade
                </span>
            )}
            {/* EXPERIMENT: publish straight from the card - on the counts' row, on the right, on their baseline */}
            {canPublish && (
                <button type="button" className="btn btn-xs btn-primary list-publish-btn" onClick={publish} disabled={publishing}>
                    <GlobeCheck size={14} aria-hidden="true" /> Publicera
                </button>
            )}
        </p>
    );

    return (
        <div className={`event-group${variant}`}>
            {/* The kind of list as a tab on the card's top-left corner */}
            <div className="event-tab-row">
                <p className="event-kicker">
                    {isPrivate ? (
                        <>
                            <Lock size={14} aria-hidden="true" /> Privat lista
                        </>
                    ) : (
                        <>
                            <ScrollText size={14} aria-hidden="true" /> Önskelista
                        </>
                    )}
                </p>
            </div>
            <article className={`event event-solo${variant}`}>
                <div className="event-info">
                    <div className="event-head">
                        <DateBadge iso={list.endDate} />
                        <div className="event-title">
                            {/* A long title gets a smaller font, so it fits beside the badge and the name badges */}
                            <h3 className={titleSizeClass(list.title)}>
                                {/* The title's link covers the whole card (styles.css: .event-solo .event-title-link::after) */}
                                {canOpen ? (
                                    <Link to={`/lists/${list.id}`} className="event-title-link">
                                        {list.title}
                                    </Link>
                                ) : (
                                    list.title
                                )}
                                {canShare && (
                                    <button
                                        type="button"
                                        className="btn btn-icon event-share"
                                        onClick={() => setSharing(true)}
                                        aria-label={list.shareToken ? "Listan delas - visa länken" : "Dela listan"}
                                        title={list.shareToken ? "Delas med länk" : "Dela listan"}
                                        aria-haspopup="dialog"
                                    >
                                        <Share2 size={16} aria-hidden="true" />
                                    </button>
                                )}
                            </h3>
                            {/* Who it's for: one badge per recipient, in the panel's top-right corner ("Till:" only for screen readers) */}
                            {list.recipients && (
                                <p className="recipient-badges">
                                    <span className="visually-hidden">Till: </span>
                                    {list.recipients.split(", ").map((name) => (
                                        <span key={name} className="recipient-badge">
                                            {name}
                                        </span>
                                    ))}
                                </p>
                            )}
                            {list.endDate && <EventDate iso={list.endDate} />}
                        </div>
                    </div>
                    {/* The counts under the title block - outside it, so the title and "Till:" line up
                        with the date badge like on the other cards */}
                    {stats}
                </div>
            </article>
            {sharing && (
                <ShareListModal listId={list.id} shareToken={list.shareToken} onChanged={onChanged} onClose={() => setSharing(false)} />
            )}
        </div>
    );
}
