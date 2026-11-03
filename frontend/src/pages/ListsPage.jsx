import { Link } from "react-router-dom";
import { Archive, ListChecks, Plus } from "lucide-react";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ListCard from "../components/ListCard.jsx";

// /lists – every list I can see: the coming public lists in my groups (mine and others'),
// my own lists that aren't published yet, and a way to the archive.
export default function ListsPage() {
    const { data, error, loading, reload } = useFetch("/profile");

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { upcoming, adminLists } = data;
    const privateLists = adminLists.filter((list) => !list.archived && !list.isPublic);
    const archivedCount = adminLists.filter((list) => list.archived).length;

    return (
        <div className="page">
            <div className="page-head">
                <h1 className="title-with-icon">
                    <ListChecks size={28} aria-hidden="true" /> Listor
                </h1>
                <div className="actions">
                    <Link to="/lists/new" className="btn btn-primary">
                        <Plus size={16} aria-hidden="true" /> Ny lista
                    </Link>
                    <Link to="/archive" className="btn btn-ghost">
                        <Archive size={16} aria-hidden="true" /> Arkiv{archivedCount > 0 && ` (${archivedCount})`}
                    </Link>
                </div>
            </div>

            <section className="section">
                <h2>Kommande</h2>
                {upcoming.length === 0 ? (
                    <Empty>Inga publika listor i dina grupper just nu.</Empty>
                ) : (
                    <div className="cards">
                        {upcoming.map((list) => (
                            <ListCard key={list.id} list={list} />
                        ))}
                    </div>
                )}
            </section>

            <section className="section">
                <h2>Mina privata listor</h2>
                {privateLists.length === 0 ? (
                    <Empty>Du har inga opublicerade listor.</Empty>
                ) : (
                    <div className="cards">
                        {privateLists.map((list) => (
                            <ListCard
                                key={list.id}
                                list={{ ...list, isAdmin: true }}
                                extra={
                                    <p className="muted small">
                                        {list.wishCount} {list.wishCount === 1 ? "önskning" : "önskningar"}
                                    </p>
                                }
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
