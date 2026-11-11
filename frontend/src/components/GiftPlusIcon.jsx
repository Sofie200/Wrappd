import { Gift, Plus } from "lucide-react";

// "Add a gift": lucide's Gift with a small round plus badge in its bottom-right corner
// (lucide has no combined icon). Decorative – the button's text says what it does.
// The badge and its plus grow with the icon, so the plus stays centred at any size
// (at 16px: a 10px badge with an 8px plus, as before).
export default function GiftPlusIcon({ size = 16 }) {
    const badge = Math.max(10, Math.round(size * 0.6));
    const plus = Math.round(badge * 0.75);
    return (
        <span className="icon-gift-plus" style={{ width: size, height: size }} aria-hidden="true">
            <Gift size={size} />
            <span
                className="icon-gift-plus-badge"
                style={size === 16 ? undefined : { width: badge, height: badge, right: -badge * 0.4, bottom: -badge * 0.3 }}
            >
                <Plus size={plus} strokeWidth={3.5} />
            </span>
        </span>
    );
}
