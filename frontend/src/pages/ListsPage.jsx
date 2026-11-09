import { useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ScrollText } from "lucide-react";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ListPanelCard from "../components/ListPanelCard.jsx";

// /lists – the lists I administer: the coming published ones and the ones that aren't published yet –
// or, switched with the Arkiv button, the past ones. (Others' lists are on the overview.)
export default function ListsPage() {
    const { data, error, loading, reload } = useFetch("/profile");
    const [showArchive, setShowArchive] = useState(false); // the past lists instead of the current ones

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { adminLists } = data;
    const publishedLists = adminLists.filter((list) => !list.archived && list.isPublic);
    const privateLists = adminLists.filter((list) => !list.archived && !list.isPublic);
    const archivedLists = adminLists.filter((list) => list.archived).reverse(); // most recent first
    const currentCount = publishedLists.length + privateLists.length;

    return (
        <div className="page">
            <div className="page-head">
                <h1 className="title-with-icon">
                    <ScrollText size={28} aria-hidden="true" /> Mina listor
                </h1>
                <div className="actions">
                    <Link to="/lists/new" className="btn btn-primary">
                        <ScrollText size={16} aria-hidden="true" /> Ny lista
                    </Link>
                    {/* The archive is shown here, in place of the current lists */}
                    <button type="button" className="btn btn-ghost" onClick={() => setShowArchive(!showArchive)}>
                        {showArchive ? (
                            <>
                                <ScrollText size={16} aria-hidden="true" /> Aktuella listor{currentCount > 0 && ` (${currentCount})`}
                            </>
                        ) : (
                            <>
                                <Archive size={16} aria-hidden="true" /> Arkiv{archivedLists.length > 0 && ` (${archivedLists.length})`}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {showArchive ? (
                <section className="section">
                    <h2>Arkiv</h2>
                    <p className="muted">Listor vars datum har passerat. De kan inte längre ändras.</p>
                    {archivedLists.length === 0 ? (
                        <Empty>Inga arkiverade listor än.</Empty>
                    ) : (
                        <div className="cards list-cards">
                            {archivedLists.map((list) => (
                                <ListPanelCard key={list.id} list={list} />
                            ))}
                        </div>
                    )}
                </section>
            ) : (
                <>
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
                </>
            )}
        </div>
    );
}
