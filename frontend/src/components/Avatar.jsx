import { AVATAR_COLORS, AVATAR_ICONS, DEFAULT_COLOR, DEFAULT_ICON } from "../profileOptions.js";

// A round profile icon in the user's chosen colour. Decorative – the surrounding element has the label.
export default function Avatar({ icon, color, size = 36 }) {
    const { Icon } = AVATAR_ICONS[icon] ?? AVATAR_ICONS[DEFAULT_ICON];
    const background = (AVATAR_COLORS[color] ?? AVATAR_COLORS[DEFAULT_COLOR]).value;

    return (
        <span className="avatar" style={{ width: size, height: size, background }} aria-hidden="true">
            <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
        </span>
    );
}
