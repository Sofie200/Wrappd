import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

// "Mina grupper › Familjen". items: [{ label, to }] - the last one is the current page (no link).
export default function Breadcrumbs({ items }) {
    return (
        <nav className="breadcrumbs" aria-label="Brödsmulor">
            <ol>
                {items.map((item, i) => {
                    const last = i === items.length - 1;
                    return (
                        <Fragment key={i}>
                            <li>
                                {last || !item.to ? (
                                    <span aria-current={last ? "page" : undefined}>{item.label}</span>
                                ) : (
                                    <Link to={item.to}>{item.label}</Link>
                                )}
                            </li>
                            {!last && (
                                <li aria-hidden="true" className="breadcrumbs-sep">
                                    <ChevronRight size={14} />
                                </li>
                            )}
                        </Fragment>
                    );
                })}
            </ol>
        </nav>
    );
}
