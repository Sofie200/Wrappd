import { useState } from "react";
import { api } from "../api.js";
import { useImageChoice } from "../hooks/useImageChoice.js";
import { ErrorMessage } from "./Feedback.jsx";
import ImageField from "./ImageField.jsx";
import ProductLinkField from "./ProductLinkField.jsx";

// Create a wish (no `wish`) on a list, or on a wish profile (createPath = "/people/:id/wishes"),
// or edit one (`wish` given)
export default function WishForm({ listId, createPath, wish, onSaved, onCancel }) {
    const [fields, setFields] = useState({
        title: wish?.title ?? "",
        description: wish?.description ?? "",
        price: wish?.price != null ? String(wish.price).replace(".", ",") : "",
        url: wish?.url ?? "",
        quantity: String(wish?.quantity ?? 1),
    });
    const image = useImageChoice(wish?.imageUrl);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const update = (e) => setFields({ ...fields, [e.target.name]: e.target.value });

    // "Hämta uppgifter" overwrites the fields it found. Fields it didn't find are left as they are.
    function applyProduct(product) {
        setFields((prev) => ({
            ...prev,
            title: product.title ?? prev.title,
            description: product.description ?? prev.description,
            price: product.price ?? prev.price,
        }));
        if (product.imageUrl) image.takeShopImage(product.imageUrl);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);

        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) formData.append(key, value);
        image.appendTo(formData);

        try {
            await api(wish ? `/wishes/${wish.id}` : (createPath ?? `/lists/${listId}/wishes`), {
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

    return (
        <form onSubmit={handleSubmit} className="form wish-form">
            <ProductLinkField
                id={wish ? `wish-url-${wish.id}` : "wish-url-new"}
                value={fields.url}
                onChange={update}
                onFetched={applyProduct}
                onError={setError}
                disabled={busy}
                autoFocus={!wish}
            />

            <label className="field">
                <span>Titel</span>
                <input name="title" value={fields.title} onChange={update} maxLength={200} required />
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

            <ImageField image={image} onError={setError} />

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
