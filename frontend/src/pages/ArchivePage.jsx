import { Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ListCard from "../components/ListCard.jsx";

// /archive – the lists I administer whose date has passed
export default function ArchivePage() {
    const { data, error, loading, reload } = useFetch("/profile");

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    // The server sorts by date, oldest first – here the most recent is the most interesting
    const archived = data.adminLists.filter((list) => list.archived).reverse();

    return (
        <div className="page">
            <p>
                <Link to="/">← Översikten</Link>
            </p>
            <h1>Arkiv</h1>
            <p className="muted">Önskelistor du administrerar vars datum har passerat. De kan inte längre ändras.</p>

            <section className="section">
                {archived.length === 0 ? (
                    <Empty>Inga arkiverade listor än.</Empty>
                ) : (
                    <div className="cards">
                        {archived.map((list) => (
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
