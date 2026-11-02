import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from "../config.js";
import { ErrorMessage } from "./Feedback.jsx";

// Create a wish on a list (no `wish`), or edit one (`wish` given)
export default function WishForm({ listId, wish, onSaved, onCancel }) {
    const [fields, setFields] = useState({
        title: wish?.title ?? "",
        description: wish?.description ?? "",
        price: wish?.price != null ? String(wish.price).replace(".", ",") : "",
        url: wish?.url ?? "",
        quantity: String(wish?.quantity ?? 1),
    });
    const [file, setFile] = useState(null);           // a new image, not uploaded yet
    const [preview, setPreview] = useState(null);     // local preview of that image
    const [removeImage, setRemoveImage] = useState(false);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const fileInput = useRef(null);

    // Free the preview's memory when it is replaced or the form closes
    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

    const update = (e) => setFields({ ...fields, [e.target.name]: e.target.value });

    function clearFile() {
        setFile(null);
        setPreview(null);
        if (fileInput.current) fileInput.current.value = "";
    }

    function handleFile(e) {
        const picked = e.target.files?.[0];
        setError(null);
        if (!picked) return clearFile();

        if (!ALLOWED_IMAGE_TYPES.includes(picked.type)) {
            clearFile();
            return setError("Bilden måste vara JPG eller PNG.");
        }
        if (picked.size > MAX_IMAGE_SIZE) {
            clearFile();
            return setError("Bilden är för stor. Max 4 MB.");
        }
        setFile(picked);
        setPreview(URL.createObjectURL(picked));
        setRemoveImage(false);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);

        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) formData.append(key, value);
        if (file) formData.append("image", file);
        if (wish && removeImage) formData.append("removeImage", "true");

        try {
            await api(wish ? `/wishes/${wish.id}` : `/lists/${listId}/wishes`, {
                method: wish ? "PATCH" : "POST",
                formData,
                timeoutMs: 30_000, // images take a while
            });
            onSaved();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    const shownImage = preview ?? (removeImage ? null : wish?.imageUrl);

    return (
        <form onSubmit={handleSubmit} className="form wish-form">
            <label className="field">
                <span>Titel</span>
                <input name="title" value={fields.title} onChange={update} maxLength={200} required autoFocus />
            </label>

            <label className="field">
                <span>Beskrivning</span>
                <textarea name="description" value={fields.description} onChange={update} rows={3} maxLength={2000} />
            </label>

            <div className="field-row">
                <label className="field">
                    <span>Pris (kr)</span>
                    <input name="price" value={fields.price} onChange={update} inputMode="decimal" placeholder="299" />
                </label>
                <label className="field">
                    <span>Antal</span>
                    <input name="quantity" type="number" min="1" max="99" value={fields.quantity} onChange={update} required />
                </label>
            </div>

            <label className="field">
                <span>Länk</span>
                <input name="url" value={fields.url} onChange={update} inputMode="url" placeholder="https://…" />
            </label>

            <div className="field">
                <span>Bild (JPG eller PNG, max 4 MB)</span>
                {shownImage && (
                    <div className="image-preview">
                        <img src={shownImage} alt="" />
                        <button
                            type="button"
                            className="image-preview-remove"
                            onClick={() => (file ? clearFile() : setRemoveImage(true))}
                            aria-label={file ? "Ångra vald bild" : "Ta bort bilden"}
                            title={file ? "Ångra vald bild" : "Ta bort bilden"}
                        >
                            ×
                        </button>
                    </div>
                )}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png" onChange={handleFile} />
                {removeImage && !file && <small>Bilden tas bort när du sparar.</small>}
            </div>

            <ErrorMessage message={error} />

            <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? "Sparar…" : wish ? "Spara" : "Lägg till"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
                    Avbryt
                </button>
            </div>
        </form>
    );
}
