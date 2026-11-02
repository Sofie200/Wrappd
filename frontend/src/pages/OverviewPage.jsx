import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ListCard from "../components/ListCard.jsx";
import { formatPrice, formatShortDate } from "../format.js";

// Reserved wishes as a table, with the item's price × number of copies
function ReservationTable({ rows }) {
    const total = rows.reduce((sum, r) => sum + (r.price ?? 0) * r.quantity, 0);

    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Önskning</th>
                        <th>Lista</th>
                        <th className="num">Antal</th>
                        <th className="num">Pris</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.wishId}>
                            <td>{r.title}</td>
                            <td>
                                <Link to={`/lists/${r.listId}`}>{r.listTitle}</Link>
                                <span className="muted"> · {formatShortDate(r.endDate)}</span>
                            </td>
                            <td className="num">{r.quantity}</td>
                            <td className="num">{r.price === null ? "–" : formatPrice(r.price * r.quantity)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={3}>Totalt</td>
                        <td className="num">{formatPrice(total)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

export default function OverviewPage() {
    const { user } = useAuth();
    const { data, error, loading, reload } = useFetch("/profile");

    if (!data && loading) return <Loading />;
    if (!data) return <ErrorMessage message={error} onRetry={reload} />;

    const { upcoming, reservations, adminLists } = data;

    return (
        <div className="page">
            <h1>Hej {user.name}!</h1>

            <section className="section">
                <h2>Kommande event</h2>
                {upcoming.length === 0 ? (
                    <Empty>
                        Inga kommande event i dina grupper än. <Link to="/groups">Gå med i eller skapa en grupp</Link>.
                    </Empty>
                ) : (
                    <div className="cards">
                        {upcoming.map((list) => (
                            <ListCard
                                key={list.id}
                                list={list}
                                extra={list.groups && <p className="muted small">Grupper: {list.groups}</p>}
                            />
                        ))}
                    </div>
                )}
            </section>

            <section className="section">
                <h2>Mina reservationer</h2>
                {reservations.current.length === 0 ? (
                    <Empty>Du har inga aktuella reservationer.</Empty>
                ) : (
                    <ReservationTable rows={reservations.current} />
                )}

                {reservations.history.length > 0 && (
                    <details className="history">
                        <summary>Historik ({reservations.history.length})</summary>
                        <ReservationTable rows={reservations.history} />
                    </details>
                )}
            </section>

            <section className="section">
                <div className="section-head">
                    <h2>Listor jag administrerar</h2>
                    <Link to="/lists/new" className="btn btn-small">
                        + Ny lista
                    </Link>
                </div>
                {adminLists.length === 0 ? (
                    <Empty>Du administrerar inga listor än.</Empty>
                ) : (
                    <div className="cards">
                        {adminLists.map((list) => (
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
