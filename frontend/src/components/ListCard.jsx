import { Link } from "react-router-dom";
import { formatDate, relativeDays } from "../format.js";

// One list in an overview. Lists TO me that I don't administer have no link – I can't open them.
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
                {!list.archived && <span className="muted"> · {relativeDays(list.endDate)}</span>}
            </p>
            {list.recipients && <p className="muted">Till: {list.recipients}</p>}
            {extra}
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
