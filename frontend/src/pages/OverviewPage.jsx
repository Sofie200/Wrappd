import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { Empty, ErrorMessage, Loading } from "../components/Feedback.jsx";
import ListCard from "../components/ListCard.jsx";
import { formatPrice, formatShortDate } from "../format.js";

// My gifts as a table: the gift's total price, and my share of it. The sum is what I pay.
function GiftTable({ rows }) {
    const myTotal = rows.reduce((sum, g) => sum + Math.round((g.myShare ?? 0) * 100), 0) / 100;

    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Gåva</th>
                        <th>Lista</th>
                        <th className="num">Antal</th>
                        <th className="num">Pris</th>
                        <th className="num">Min del</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((g) => (
                        <tr key={g.id}>
                            <td>
                                <Link to={`/gifts/${g.id}`}>{g.title}</Link>
                                {g.sharedWith && <div className="muted small">Delas med {g.sharedWith}</div>}
                            </td>
                            <td>
                                <Link to={`/lists/${g.listId}`}>{g.listTitle}</Link>
                                <span className="muted"> · {formatShortDate(g.endDate)}</span>
                            </td>
                            <td className="num">{g.quantity}</td>
                            <td className="num">{g.price === null ? "–" : formatPrice(g.price)}</td>
                            <td className="num share">{g.myShare === null ? "–" : formatPrice(g.myShare)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={4}>Totalt för mig</td>
                        <td className="num share">{formatPrice(myTotal)}</td>
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

    const { upcoming, gifts, adminLists } = data;
    const activeAdminLists = adminLists.filter((list) => !list.archived);
    const archivedCount = adminLists.length - activeAdminLists.length;

    return (
        <div className="page">
            <h1>Hej {user.name}!</h1>

            <section className="section">
                <h2>Kommande händelser</h2>
                {upcoming.length === 0 ? (
                    <Empty>
                        Inget planerat än, men allt kan firas 🎉 <Link to="/lists/new">Klicka här</Link> för att skapa en ny önskelista!
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
                <h2>Mina inköp</h2>
                {gifts.current.length === 0 ? (
                    <Empty>Du har inga aktuella gåvor.</Empty>
                ) : (
                    <GiftTable rows={gifts.current} />
                )}

                {gifts.history.length > 0 && (
                    <details className="history">
                        <summary>Historik ({gifts.history.length})</summary>
                        <GiftTable rows={gifts.history} />
                    </details>
                )}
            </section>

            <section className="section">
                <div className="section-head">
                    <h2>Mina önskelistor</h2>
                    <div className="actions">
                        <Link to="/lists/new" className="btn btn-small">
                            + Ny lista
                        </Link>
                        <Link to="/archive" className="btn btn-small btn-ghost">
                            Arkiv{archivedCount > 0 && ` (${archivedCount})`}
                        </Link>
                    </div>
                </div>
                {/* Lists whose date has passed are in the archive */}
                {activeAdminLists.length === 0 ? (
                    <Empty>Du har inga aktuella önskelistor.</Empty>
                ) : (
                    <div className="cards">
                        {activeAdminLists.map((list) => (
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
