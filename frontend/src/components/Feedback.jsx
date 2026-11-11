// Small shared pieces for loading, errors and empty states
import { Gift, RotateCw } from "lucide-react";

export function Loading({ text = "Laddar…" }) {
    return (
        <div className="loading" role="status">
            <span className="spinner" aria-hidden="true">
                <span className="spinner-ring" />
                <Gift className="spinner-gift" size={26} strokeWidth={2} />
            </span>
            {/* Only for screen readers */}
            <span className="visually-hidden">{text}</span>
        </div>
    );
}

export function ErrorMessage({ message, onRetry }) {
    if (!message) return null;
    return (
        <div className="alert alert-error" role="alert">
            <span>{message}</span>
            {onRetry && (
                <button type="button" className="btn btn-small btn-ghost" onClick={onRetry}>
                    <RotateCw size={16} aria-hidden="true" /> Försök igen
                </button>
            )}
        </div>
    );
}

// The text in one <span>: .alert is a flex row (for a message + a button), and loose text mixed with
// e.g. <strong> would otherwise become separate items, pushed apart
export function Notice({ children }) {
    return (
        <div className="alert alert-info">
            <span>{children}</span>
        </div>
    );
}

export function Empty({ children }) {
    return <p className="empty">{children}</p>;
}
