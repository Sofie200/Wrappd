import { Link } from "react-router-dom";
import { ArrowRight, Gift, Lock, Pencil, ScrollText, Sparkles } from "lucide-react";
import DateBadge, { EventDate } from "./DateBadge.jsx";

// One of my lists as a card in the overview's event style – only the coloured panel, no gifts column.
//  - Published: the rose panel, "Önskelista", and "Se lista" at the bottom right.
//  - Private: the same panel inverted (white with rose details), "Privat lista", and the pencil opens it.
export default function ListPanelCard({ list }) {
    const isPrivate = !list.isPublic;
    const stats = (
        <p className="event-stats">
            <span>
                <Sparkles size={14} aria-hidden="true" /> {list.wishCount} {list.wishCount === 1 ? "önskning" : "önskningar"}
            </span>
            {/* Never on lists to me (the server sends null there), nor on private lists – nobody can reserve yet */}
            {list.reservedCount != null && !isPrivate && (
                <span>
                    <Gift size={14} aria-hidden="true" /> {list.reservedCount} reserverade
                </span>
            )}
        </p>
    );

    return (
        <div className={`event-group${isPrivate ? " event-light" : ""}`}>
            {/* The kind of list as a tab on the card's top-left corner, who it's for beside it */}
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
                {list.recipients && (
                    <p className="event-to">
                        Till: <span className="event-for">{list.recipients}</span>
                    </p>
                )}
            </div>
            <article className={`event event-solo${isPrivate ? " event-light" : ""}`}>
                <div className="event-info">
                    {isPrivate && (
                        <Link to={`/lists/${list.id}`} className="event-edit" aria-label={`Öppna ${list.title}`} title="Öppna listan">
                            <Pencil size={16} aria-hidden="true" />
                        </Link>
                    )}
                    <div className="event-head">
                        <DateBadge iso={list.endDate} />
                        <div className="event-title">
                            <h3>{list.title}</h3>
                            {list.endDate && <EventDate iso={list.endDate} />}
                            {/* A private list has only the count – right under the title */}
                            {isPrivate && stats}
                        </div>
                    </div>
                    {!isPrivate && stats}
                    {!isPrivate && (
                        <div className="event-foot">
                            <Link to={`/lists/${list.id}`} className="btn btn-small event-link">
                                Se lista <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        </div>
                    )}
                </div>
            </article>
        </div>
    );
}
