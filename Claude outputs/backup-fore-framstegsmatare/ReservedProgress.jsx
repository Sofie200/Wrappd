// EXPERIMENT (framstegsmätare): a thin bar under the counts on an event card, showing how much of the
// list has been reserved - "8 of 12". Remove this file, its import and its one use in EventRow.jsx,
// and the "Framstegsmätare" block at the end of styles.css to roll it back.
export default function ReservedProgress({ reserved, total }) {
    if (!total || reserved === null || reserved === undefined) return null;
    const percent = Math.min(100, Math.round((reserved / total) * 100));
    const done = reserved >= total;
    return (
        <span
            className={`event-progress${done ? " is-done" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(reserved, total)}
            aria-label={`${reserved} av ${total} önskningar reserverade`}
            title={done ? "Allt är reserverat! 🎉" : `${percent} % reserverat`}
        >
            <span className="event-progress-fill" style={{ width: `${percent}%` }} />
        </span>
    );
}
