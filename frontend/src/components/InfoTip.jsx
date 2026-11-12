import { useId } from "react";
import { Info } from "lucide-react";

// A small (i) beside a heading: the text shows in a bubble on hover, and on focus (tab, or a tap on phones).
// Screen readers get the text as the button's description.
export default function InfoTip({ children, label = "Mer information" }) {
    const id = useId();
    return (
        <span className="info-tip">
            <button type="button" className="info-tip-btn" aria-label={label} aria-describedby={id}>
                <Info size={16} aria-hidden="true" />
            </button>
            <span id={id} role="tooltip" className="info-tip-text">
                {children}
            </span>
        </span>
    );
}
