import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatPrice, formatShortDate, joinNames } from "../format.js";
import { useAuth } from "../context/AuthContext.jsx";
import Avatar from "./Avatar.jsx";
import { ErrorMessage } from "./Feedback.jsx";
import Modal from "./Modal.jsx";
import WishForm from "./WishForm.jsx";
import { GiftEditor } from "../pages/GiftPage.jsx";
import { ArrowUpRight, CircleMinus, CirclePlus, Ellipsis, Pencil, Trash2 } from "lucide-react";
import SettingsMenu from "./SettingsMenu.jsx";
import Select from "./Select.jsx";

// One wish: a compact row (image, title, price, reserved badge) that opens the full wish in a modal.
// What the modal shows depends on `me` from the server:
//  - seesReservations: who has reserved it, per gift (never for recipients)
//  - canReserve: reserve (creates a gift), or go to my gift
//  - canEdit: edit and delete (list admins, not archived) - also when reserved (the buyers keep their gifts).
//    Those who see the reservations are warned first; recipients never learn there is one.
// santa: { id } - on a wish profile opened from a Secret Santa: the reservation counts for it (no date to choose)
// person: { id, name } - whose wish profile it is (a reservation there goes on an event of mine for them)
export default function WishCard({ wish, me, listId, santa = null, person = null, onChanged }) {
    const { user } = useAuth();
    // "dig och Ted" - me first, as "dig"
    const whoNames = (people) =>
        joinNames([
            ...people.filter((p) => p.id === user.id).map(() => "dig"),
            ...people.filter((p) => p.id !== user.id).map((p) => p.name),
        ]);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [qty, setQty] = useState(1);
    // A wish on a wish profile (no list): the gift goes on an event of my own for the person ("Loggade
    // gåvor") - one I already have for them, or a new one with a name and a date - unless it's reserved
    // for a Secret Santa (then it's the draw's)
    const onProfile = !listId && !santa;
    const [myEvents, setMyEvents] = useState(null); // my coming events for this person, once the modal opens
    const [eventChoice, setEventChoice] = useState("new"); // an event's id - or "new" for a new one
    const [eventName, setEventName] = useState("");
    const [giftDate, setGiftDate] = useState("");
    const [editingGift, setEditingGift] = useState(false); // my reservation, in a modal on top

    // My events for this person - fetched when the wish is opened (only on a wish profile, when I can reserve)
    useEffect(() => {
        if (!open || !onProfile || !me.canReserve || wish.myGiftId || myEvents !== null) return;
        let cancelled = false;
        api("/gifts/events")
            .then(({ data }) => {
                if (cancelled) return;
                const forPerson = data.filter((e) => !e.archived && e.complete && person && e.recipientId === person.id);
                setMyEvents(forPerson);
                setEventChoice(forPerson.length > 0 ? String(forPerson[0].id) : "new"); // the soonest one
            })
            .catch(() => !cancelled && setMyEvents([])); // then only "a new event" - the server checks the rest
        return () => {
            cancelled = true;
        };
    }, [open, onProfile, me.canReserve, wish.myGiftId, myEvents, person]);

    async function run(action) {
        setBusy(true);
        setError(null);
        try {
            await action();
            onChanged();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    // Reserving creates a gift - and stays here; the gift can be edited later (Gåvor / the overview)
    // quantity: from the row it's always 1, from the modal what's chosen there
    async function reserve(quantity = qty) {
        // On a wish profile the event is chosen in the modal - from the row, open the modal for it
        if (onProfile && !open) {
            setOpen(true);
            return;
        }
        if (onProfile && eventChoice === "new" && (!eventName.trim() || !giftDate)) {
            setError(!eventName.trim() ? "Ange vad händelsen heter" : "Ange när gåvan ska ges");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            // The gift is created as a straight copy of the wish - price, comment and sharing can be changed later
            await api(`/wishes/${wish.id}/gifts`, {
                method: "POST",
                body: {
                    quantity: Number(quantity),
                    ...(onProfile &&
                        (eventChoice !== "new" ? { eventId: Number(eventChoice) } : { eventName: eventName.trim(), giftDate })),
                    ...(santa && { santaId: santa.id }),
                },
            });
            setBusy(false);
            onChanged();
        } catch (err) {
            setError(err.message);
            setBusy(false);
            setOpen(true); // show the error in the wish (also when reserving straight from the row)
            onChanged();
        }
    }

    // Undo my reservation - the whole gift goes, also for the others who share it
    function unreserve() {
        if (!window.confirm(`Släpp din reservation av "${wish.title}"? Gåvan tas bort för alla som delar på den.`)) return;
        run(() => api(`/gifts/${wish.myGiftId}`, { method: "DELETE" }));
    }

    function remove() {
        // (Only someone who sees reservations - a parent on their child's profile - is told; the person never is)
        const note = me.seesReservations && reserved > 0 ? "\n\nÖnskningen är reserverad. Den som reserverat behåller sin gåva." : "";
        if (!window.confirm(`Ta bort "${wish.title}"?${note}`)) return;
        run(() => api(`/wishes/${wish.id}`, { method: "DELETE" }));
    }

    function close() {
        setOpen(false);
        setEditing(false);
        setError(null);
        setMyEvents(null); // fetched again next time - an event may have been added or removed
    }

    const reserved = wish.reserved ?? 0;
    const available = wish.quantity - reserved;
    const full = me.seesReservations && available <= 0;
    const options = Array.from({ length: Math.max(available, 0) }, (_, i) => i + 1);
    // Reserved - and I may know it (not a recipient): then editing and deleting warn first
    const warnReserved = me.seesReservations && reserved > 0;
    function edit() {
        if (
            warnReserved &&
            !window.confirm(`"${wish.title}" är reserverad. Ändrar du önskningen behåller den som reserverat sin gåva, men ser dina ändringar.\n\nVill du redigera ändå?`)
        )
            return;
        setEditing(true);
    }

    const image = (className) =>
        wish.imageUrl ? (
            <img className={className} src={wish.imageUrl} alt="" loading="lazy" />
        ) : (
            // No picture: the app's own illustration of presents
            <img className={`${className} wish-image-empty`} src="/gift-placeholder.png" alt="" />
        );

    // Everyone who has reserved it (in any of its gifts), once each
    const reservers = [];
    for (const gift of wish.gifts ?? []) {
        for (const person of gift.people ?? []) {
            if (!reservers.some((p) => p.id === person.id)) reservers.push(person);
        }
    }

    // Only those who may see reservations get the badge and the icons - recipients never do
    const reservedBadge =
        me.seesReservations && reserved > 0 ? (
            <span className="reserved-by">
                <span className={`badge ${full ? "badge-gift" : "badge-partial"}`}>
                    {/* "av dig" when I'm one of those who share a gift for it */}
                    {(wish.myGiftId ? "Reserverad av dig" : "Reserverad") + (full ? "" : ` ${reserved}/${wish.quantity}`)}
                </span>
                {reservers.length > 0 && (
                    <span className="avatar-stack" title={`Reserverad av ${whoNames(reservers)}`}>
                        {reservers.map((p) => (
                            <Avatar key={p.id} icon={p.avatarIcon} color={p.avatarColor} size={22} />
                        ))}
                        <span className="visually-hidden">av {whoNames(reservers)}</span>
                    </span>
                )}
            </span>
        ) : null;

    // "Reservera" straight on the row: when I can reserve, haven't already, and there's some left (1 st -
    // the quantity can be changed on the gift afterwards)
    const quickReserve = me.canReserve && !wish.myGiftId && available > 0;
    // A "…" menu on the row for my own reservation
    const myMenu = me.canReserve && Boolean(wish.myGiftId);

    return (
        <>
            <div className={`wish-row${quickReserve ? " has-quick" : ""}${myMenu ? " has-menu" : ""}`}>
                <button
                    type="button"
                    className={`wish${full ? " wish-full" : ""}`}
                    onClick={() => setOpen(true)}
                    aria-haspopup="dialog"
                >
                    {image("wish-image")}
                    <span className="wish-summary">
                        <span className="wish-title">{wish.title}</span>
                        {wish.price !== null && (
                            <span className="wish-meta">
                                <span className="price">{formatPrice(wish.price)}</span>
                            </span>
                        )}
                    </span>
                    {/* Reserved and by whom - out on the right */}
                    {reservedBadge && <span className="wish-reserved">{reservedBadge}</span>}
                </button>
                {quickReserve && (
                    <button
                        type="button"
                        className="btn btn-small btn-primary wish-quick-reserve"
                        onClick={() => reserve(1)}
                        disabled={busy}
                        aria-label={`Reservera ${wish.title}`}
                    >
                        <CirclePlus size={16} aria-hidden="true" /> {busy ? "Reserverar…" : "Reservera"}
                    </button>
                )}
                {/* My reservation: "…" right after the badge, to edit or release it */}
                {myMenu && (
                    <div className="wish-row-menu">
                        <SettingsMenu label={`Min reservation av ${wish.title}`} icon={Ellipsis}>
                            <button type="button" className="menu-item" role="menuitem" onClick={() => setEditingGift(true)}>
                                <Pencil size={16} aria-hidden="true" /> Redigera reservation
                            </button>
                            <button type="button" className="menu-item menu-item-danger" role="menuitem" onClick={unreserve} disabled={busy}>
                                <CircleMinus size={16} aria-hidden="true" /> Släpp reservation
                            </button>
                        </SettingsMenu>
                    </div>
                )}
            </div>

            {open && (
                <Modal title={wish.title} hideTitle={!editing} onClose={close}>
                    {/* Viewing: the title sits under the image instead of in the modal's head */}
                    {editing ? (
                        <WishForm
                            listId={listId}
                            wish={wish}
                            onSaved={() => {
                                setEditing(false);
                                onChanged();
                            }}
                            onCancel={() => setEditing(false)}
                        />
                    ) : (
                        <div className={`wish-detail${full ? " is-reserved" : ""}`}>
                            {image("wish-detail-image")}

                            {/* A small bar under the image: the reservation, and "Släpp reservation" when I'm in it */}
                            {(reservedBadge || (me.canReserve && wish.myGiftId)) && (
                                <div className="wish-status-bar">
                                    {reservedBadge}
                                    {me.canReserve && wish.myGiftId && (
                                        <>
                                            <button
                                                type="button"
                                                className="btn btn-small btn-ghost"
                                                onClick={() => setEditingGift(true)}
                                                aria-haspopup="dialog"
                                            >
                                                <Pencil size={16} aria-hidden="true" /> Redigera reservation
                                            </button>
                                            <button type="button" className="btn btn-small btn-danger-ghost" onClick={unreserve} disabled={busy}>
                                                <CircleMinus size={16} aria-hidden="true" /> Släpp reservation
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* The product info, as one block with air above and below */}
                            <div className="wish-detail-info">
                                <h3 className="wish-detail-title" aria-hidden="true">
                                    {wish.title}
                                </h3>

                                {wish.price !== null && (
                                    <div className="wish-detail-top">
                                        <span className="price">{formatPrice(wish.price)}</span>
                                    </div>
                                )}

                                {wish.description && <p className="wish-description">{wish.description}</p>}

                                {wish.url && (
                                    <a href={wish.url} target="_blank" rel="noopener noreferrer" className="wish-link">
                                        Se produkten <ArrowUpRight size={16} aria-hidden="true" />
                                    </a>
                                )}
                            </div>

                            {/* Not needed once everything is reserved - the badge already says so */}
                            {!full && (
                                <p className="muted small">
                                    Önskat antal: {wish.quantity}
                                    {me.seesReservations && ` · Reserverat: ${reserved} av ${wish.quantity}`}
                                </p>
                            )}

                            <ErrorMessage message={error} />

                            {/* Only while there's something left to reserve */}
                            {/* A form, so reserving counts as "saved" in the modal: closing it afterwards doesn't
                                ask about unsaved changes (the date and quantity are what was saved) */}
                            {me.canReserve && !wish.myGiftId && available > 0 && (
                                <form
                                    className="wish-actions"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        reserve();
                                    }}
                                >
                                    {/* A wish on a wish profile: the reservation goes on an event of mine for the
                                        person ("Loggade gåvor") - one I have, or a new one with a name and a date.
                                        Labels on rows of their own; the fields, the quantity and "Reservera" below. */}
                                    {onProfile && (
                                        <>
                                            {myEvents?.length > 0 && (
                                                <>
                                                    <span className="wish-gift-date-label" aria-hidden="true">
                                                        Vilken händelse?
                                                    </span>
                                                    {/* The app's own drop-down, like the other ones */}
                                                    <Select
                                                        label="Vilken händelse?"
                                                        value={eventChoice}
                                                        onChange={(v) => setEventChoice(String(v))}
                                                        options={[
                                                            ...myEvents.map((e) => ({
                                                                value: String(e.id),
                                                                label: `${e.name} · ${formatShortDate(e.date)}`,
                                                            })),
                                                            { value: "new", label: "Ny händelse …" },
                                                        ]}
                                                        disabled={busy}
                                                    />
                                                </>
                                            )}
                                            {eventChoice === "new" && (
                                                <>
                                                    <label htmlFor={`gift-event-name-${wish.id}`} className="wish-gift-date-label">
                                                        {myEvents?.length > 0 ? "Den nya händelsen" : "Vilken händelse?"}
                                                    </label>
                                                    <input
                                                        id={`gift-event-name-${wish.id}`}
                                                        className="wish-gift-event-name"
                                                        value={eventName}
                                                        onChange={(e) => setEventName(e.target.value)}
                                                        placeholder="T.ex. Julklapp"
                                                        aria-label="Händelsens namn"
                                                        maxLength={100}
                                                        required
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        id={`gift-date-${wish.id}`}
                                                        type="date"
                                                        className="wish-gift-date"
                                                        value={giftDate}
                                                        onChange={(e) => setGiftDate(e.target.value)}
                                                        aria-label="När ska gåvan ges?"
                                                        required
                                                        disabled={busy}
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}
                                    {available > 1 && (
                                        <select value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Antal" disabled={busy}>
                                            {options.map((n) => (
                                                <option key={n} value={n}>
                                                    {n} st
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <button
                                        type="submit"
                                        className="btn btn-small btn-primary"
                                        // Not greyed out without a date: the browser points at the empty date field
                                        // ("required") when it's pressed, which says what's missing
                                        disabled={busy}
                                    >
                                        <CirclePlus size={16} aria-hidden="true" /> Reservera
                                    </button>
                                </form>
                            )}

                            {me.canEdit && (
                                <div className="wish-admin">
                                    <span className="wish-admin-label">Hantera önskning:</span>
                                    <button
                                        type="button"
                                        className="btn btn-small btn-ghost"
                                        onClick={edit}
                                        disabled={busy}
                                    >
                                        <Pencil size={16} aria-hidden="true" /> Redigera
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-small btn-danger-ghost"
                                        onClick={remove}
                                        disabled={busy}
                                    >
                                        <Trash2 size={16} aria-hidden="true" /> Ta bort
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </Modal>
            )}

            {/* My reservation (the gift): price, comment, who shares - on top of the wish */}
            {editingGift && wish.myGiftId && (
                <Modal title="Redigera reservation" onClose={() => setEditingGift(false)}>
                    <GiftEditor
                        id={wish.myGiftId}
                        onDone={() => {
                            setEditingGift(false);
                            onChanged();
                        }}
                    />
                </Modal>
            )}
        </>
    );
}
