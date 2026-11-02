import { Baby } from "lucide-react";
import { AVATAR_COLORS, AVATAR_ICONS, DEFAULT_COLOR, DEFAULT_ICON } from "../profileOptions.js";

// Children always have the baby icon, in yellow or orange – picked from their id, so it never
// changes and can't be chosen. (Children can't log in, so they never see the profile modal.)
const CHILD_COLORS = [
    { background: "#f6c945", color: "#632519" }, // yellow – dark icon, white would be hard to see
    { background: "#f08c1a", color: "#ffffff" }, // orange
];

// A round profile icon. Decorative – the surrounding element has the label.
// Adults: their chosen icon and colour. Children: pass isChild and the child's id.
export default function Avatar({ icon, color, isChild = false, id = 0, size = 36 }) {
    let Icon;
    let style;
    if (isChild) {
        Icon = Baby;
        style = CHILD_COLORS[Math.abs(Number(id)) % CHILD_COLORS.length];
    } else {
        Icon = (AVATAR_ICONS[icon] ?? AVATAR_ICONS[DEFAULT_ICON]).Icon;
        style = { background: (AVATAR_COLORS[color] ?? AVATAR_COLORS[DEFAULT_COLOR]).value };
    }

    return (
        <span className="avatar" style={{ width: size, height: size, ...style }} aria-hidden="true">
            <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
        </span>
    );
}
