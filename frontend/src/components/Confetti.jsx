import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

const COLORS = ["#ec5b78", "#fda72d", "#73ba72", "#c49be2", "#74aee0", "#ffd166"];
const PIECES = 36;
const DURATION = 1400;

// A small burst of confetti from the middle of an element (`anchor` is a ref to it).
// Mount it with a new key for each burst; it removes itself when done.
// Skipped for anyone who has asked for reduced motion.
export default function Confetti({ anchor }) {
    const [origin, setOrigin] = useState(null);
    const [done, setDone] = useState(false);

    useLayoutEffect(() => {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        const rect = anchor.current?.getBoundingClientRect();
        if (!rect) return;
        setOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        const timer = setTimeout(() => setDone(true), DURATION);
        return () => clearTimeout(timer);
    }, [anchor]);

    if (!origin || done) return null;

    const pieces = Array.from({ length: PIECES }, (_, i) => {
        // Mostly upwards and out to the sides, then falling
        const angle = (-90 + (Math.random() - 0.5) * 160) * (Math.PI / 180);
        const distance = 60 + Math.random() * 90;
        return {
            key: i,
            style: {
                "--dx": `${Math.cos(angle) * distance}px`,
                "--dy": `${Math.sin(angle) * distance}px`,
                "--spin": `${(Math.random() - 0.5) * 720}deg`,
                background: COLORS[i % COLORS.length],
                width: `${5 + Math.random() * 4}px`,
                height: `${8 + Math.random() * 6}px`,
                borderRadius: Math.random() < 0.3 ? "50%" : "2px",
                animationDelay: `${Math.random() * 80}ms`,
            },
        };
    });

    return createPortal(
        <div className="confetti" style={{ left: origin.x, top: origin.y }} aria-hidden="true">
            {pieces.map((p) => (
                <span key={p.key} className="confetti-piece" style={p.style} />
            ))}
        </div>,
        document.body
    );
}
