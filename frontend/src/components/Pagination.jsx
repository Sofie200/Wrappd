import { ChevronLeft, ChevronRight } from "lucide-react";

// "‹ 1 2 3 ›" under a list that's shown a page at a time. `page` counts from 0.
// Renders nothing when everything fits on one page.
export default function Pagination({ page, pageCount, onChange, label = "Sidor" }) {
    if (pageCount <= 1) return null;

    return (
        <nav className="pagination" aria-label={label}>
            <button
                type="button"
                className="pagination-btn"
                onClick={() => onChange(page - 1)}
                disabled={page === 0}
                aria-label="Föregående"
                title="Föregående"
            >
                <ChevronLeft size={16} aria-hidden="true" />
            </button>
            {Array.from({ length: pageCount }, (_, i) => (
                <button
                    key={i}
                    type="button"
                    className={`pagination-btn${i === page ? " is-current" : ""}`}
                    onClick={() => onChange(i)}
                    aria-current={i === page ? "page" : undefined}
                    aria-label={`Sida ${i + 1}`}
                >
                    {i + 1}
                </button>
            ))}
            <button
                type="button"
                className="pagination-btn"
                onClick={() => onChange(page + 1)}
                disabled={page === pageCount - 1}
                aria-label="Nästa"
                title="Nästa"
            >
                <ChevronRight size={16} aria-hidden="true" />
            </button>
        </nav>
    );
}
