import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import Modal from "./Modal.jsx";
import InfoTip from "./InfoTip.jsx";

// Which groups a child is in. The parents' groups that don't include children are shown greyed out,
// so it's clear why the child isn't there.
export default function ChildGroupsModal({ child, onClose }) {
    const groups = child.parentGroups ?? [];
    const without = groups.filter((g) => !g.includeChildren).length;

    return (
        <Modal
            title={
                <>
                    {child.name}s grupper
                    {/* Why some are greyed out - only when there are such groups */}
                    {without > 0 && (
                        <>
                            {" "}
                            <InfoTip label="Varför är vissa grupper utgråade?">
                                Utgråade grupper är föräldrarnas grupper där barn inte inkluderas. En gruppadmin kan slå
                                på "Inkludera barn" i gruppens inställningar.
                            </InfoTip>
                        </>
                    )}
                </>
            }
            onClose={onClose}
        >
            {groups.length === 0 ? (
                <p className="muted">Föräldrarna är inte med i någon grupp än.</p>
            ) : (
                <ul className="child-groups">
                    {groups.map((g) => (
                        <li key={g.id} className={g.includeChildren ? undefined : "child-group-off"}>
                            <Users size={16} aria-hidden="true" />
                            {/* A link to the group - only if I'm in it myself (not a co-parent's group I can't open) */}
                            {g.isMember ? (
                                <Link to={`/groups/${g.id}`} className="text-link" onClick={onClose}>
                                    {g.name}
                                </Link>
                            ) : (
                                <span>{g.name}</span>
                            )}
                            {!g.includeChildren && <span className="small">· tillåter inte barn</span>}
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
}
