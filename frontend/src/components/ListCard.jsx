import { Link } from "react-router-dom";
import { daysUntil, formatDate } from "../format.js";

// "27 dagar kvar" with the number in a round badge. On the day itself: "Idag!"
function DaysLeft({ iso }) {
    const days = daysUntil(iso);
    if (days < 0) return null;
    return (
        <p className="days-left">
            {days === 0 ? (
                <span className="days-left-today">Idag!</span>
            ) : (
                <>
                    <span className="days-badge">{days}</span> {days === 1 ? "dag" : "dagar"} kvar
                </>
            )}
        </p>
    );
}

// One list in an overview. Lists TO me that I don't administer have no link - I can't open them.
export default function ListCard({ list, extra }) {
    const canOpen = !list.isRecipient || list.isAdmin;

    const content = (
        <>
            <div className="card-top">
                <h3>{list.title}</h3>
                <div className="badges">
                    {list.isRecipient && <span className="badge badge-gift">Till dig</span>}
                    {list.archived && <span className="badge">Arkiverad</span>}
                    {list.isPublic === false && <span className="badge badge-private">Privat</span>}
                </div>
            </div>
            <p className="card-date">
                {formatDate(list.endDate)}
            </p>
            {!list.archived && <DaysLeft iso={list.endDate} />}
            {list.recipients && <p className="card-recipient">Till: {list.recipients}</p>}
        </>
    );

    return canOpen ? (
        <Link to={`/lists/${list.id}`} className="card card-link">
            {content}
        </Link>
    ) : (
        <div className="card" title="Listan är till dig, så du kan inte öppna den">
            {content}
        </div>
    );
}
