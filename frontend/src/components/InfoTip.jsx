import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

// A small (i) beside a heading: the text shows in a bubble on hover, and on focus (tab, or a tap on phones).
// Screen readers get the text as the button's description.
// The bubble is position: fixed, placed from the (i) when it opens - so a scrolling parent (a modal)
// can't clip it. It's kept inside the window, and opens upwards when there's no room below.
export default function InfoTip({ children, label = "Mer information" }) {
    const id = useId();
    const button = useRef(null);
    const [pos, setPos] = useState(null); // { top|bottom, left } while open

    function place() {
        const r = button.current?.getBoundingClientRect();
        if (!r) return;
        const half = Math.min(130, window.innerWidth * 0.4); // half the bubble's max width
        const left = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
        const up = window.innerHeight - r.bottom < 140 && r.top > 140;
        setPos(up ? { bottom: window.innerHeight - r.top + 6, left } : { top: r.bottom + 6, left });
    }

    // While open: follow the (i) if something scrolls or the window resizes
    useEffect(() => {
        if (!pos) return;
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
        return () => {
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("resize", place);
        };
    }, [pos !== null]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <span className="info-tip" onMouseEnter={place} onMouseLeave={() => document.activeElement !== button.current && setPos(null)}>
            <button
                ref={button}
                type="button"
                className="info-tip-btn"
                aria-label={label}
                aria-describedby={id}
                onFocus={place}
                onBlur={() => setPos(null)}
            >
                <Info size={16} aria-hidden="true" />
            </button>
            <span id={id} role="tooltip" className="info-tip-text" style={pos ?? undefined}>
                {children}
            </span>
        </span>
    );
}
