import { Link } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { formatDate } from "../format.js";
import Modal from "./Modal.jsx";

// The lists a child is a recipient on: current ones first (soonest first), then the archive (latest first)
export default function ChildListsModal({ child, onClose }) {
    const lists = child.lists ?? [];
    const current = lists.filter((l) => !l.archived);
    const archived = lists.filter((l) => l.archived).reverse();

    const row = (list) => (
        <li key={list.id} className={list.archived ? "child-list-archived" : undefined}>
            <span className="child-list-main">
                <Link to={`/lists/${list.id}`} className="text-link" onClick={onClose}>
                    {list.title}
                </Link>
                <span className="muted small">{formatDate(list.endDate)}</span>
            </span>
            {list.archived ? (
                <span className="badge">Arkiverad</span>
            ) : (
                !list.isPublic && <span className="badge badge-private">Privat</span>
            )}
        </li>
    );

    return (
        <Modal title={`Listor till ${child.name}`} onClose={onClose}>
            {lists.length === 0 ? (
                <p className="muted">Inga listor än.</p>
            ) : (
                <>
                    {current.length > 0 && <ul className="child-groups">{current.map(row)}</ul>}
                    {archived.length > 0 && (
                        <>
                            <h3 className="subhead">Arkiv</h3>
                            <ul className="child-groups">{archived.map(row)}</ul>
                        </>
                    )}
                </>
            )}
            <div className="form-actions">
                <Link to={`/lists/new?for=${child.id}`} className="btn btn-small btn-primary" onClick={onClose}>
                    <ScrollText size={16} aria-hidden="true" /> Ny lista till {child.name}
                </Link>
            </div>
        </Modal>
    );
}
