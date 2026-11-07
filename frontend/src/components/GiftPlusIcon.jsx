import { Gift, Plus } from "lucide-react";

// "Add a gift": lucide's Gift with a small round plus badge in its bottom-right corner
// (lucide has no combined icon). Decorative – the button's text says what it does.
export default function GiftPlusIcon({ size = 16 }) {
    return (
        <span className="icon-gift-plus" style={{ width: size, height: size }} aria-hidden="true">
            <Gift size={size} />
            <span className="icon-gift-plus-badge">
                <Plus size={Math.round(size * 0.5)} strokeWidth={3.5} />
            </span>
        </span>
    );
}
