import { Link } from "react-router-dom";
import { Archive, ScrollText, Plus } from "lucide-react";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ListPanelCard from "../components/ListPanelCard.jsx";

// /lists – the lists I administer: the coming published ones, the ones that aren't published yet,
// and a way to the archive. (Others' lists are on the overview.)
export default function ListsPage() {
    const { data, error, loading, reload } = useFetch("/profile");

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { adminLists } = data;
    const publishedLists = adminLists.filter((list) => !list.archived && list.isPublic);
    const privateLists = adminLists.filter((list) => !list.archived && !list.isPublic);
    const archivedCount = adminLists.filter((list) => list.archived).length;

    return (
        <div className="page">
            <div className="page-head">
                <h1 className="title-with-icon">
                    <ScrollText size={28} aria-hidden="true" /> Mina listor
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
                <h2>Publicerade</h2>
                {publishedLists.length === 0 ? (
                    <Empty>Du har inga publicerade listor just nu.</Empty>
                ) : (
                    <div className="cards list-cards">
                        {publishedLists.map((list) => (
                            <ListPanelCard key={list.id} list={list} />
                        ))}
                    </div>
                )}
            </section>

            <section className="section">
                <h2>Privata</h2>
                {privateLists.length === 0 ? (
                    <Empty>Du har inga opublicerade listor.</Empty>
                ) : (
                    <div className="cards list-cards">
                        {privateLists.map((list) => (
                            <ListPanelCard key={list.id} list={list} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
