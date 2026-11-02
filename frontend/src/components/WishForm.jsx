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
    const [shopImage, setShopImage] = useState(null);  // an image from the shop's page – the server copies it when saving
    const [fetching, setFetching] = useState(false);
    const [fetchResult, setFetchResult] = useState(null); // { message, warning } after "Hämta uppgifter"
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
        setShopImage(null);
    }

    // Reads the product page and overwrites the fields it found. Fields it didn't find are left as they are.
    async function fetchDetails() {
        if (!fields.url.trim()) return setError("Klistra in en länk först.");
        setFetching(true);
        setError(null);
        setFetchResult(null);
        try {
            const product = await api("/scrape", { method: "POST", body: { url: fields.url }, timeoutMs: 30_000 });

            setFields((prev) => ({
                ...prev,
                title: product.title ?? prev.title,
                description: product.description ?? prev.description,
                price: product.price ?? prev.price,
            }));
            if (product.imageUrl) {
                clearFile();
                setRemoveImage(false);
                setShopImage(product.imageUrl);
            }

            const names = { title: "titel", description: "beskrivning", price: "pris", imageUrl: "bild" };
            const found = Object.keys(names).filter((key) => product[key]);
            const missing = Object.keys(names).filter((key) => !product[key]);
            const warnings = [];
            if (product.price && product.currency && product.currency !== "SEK") {
                warnings.push(`Priset är i ${product.currency}, inte kronor – kontrollera det.`);
            }
            if (product.imageUnsupported) warnings.push("Butikens bild är inte JPG eller PNG, så den kunde inte användas.");

            setFetchResult({
                message:
                    found.length === 0
                        ? "Hittade inga produktuppgifter på sidan. Fyll i dem själv."
                        : `Hämtade ${found.map((k) => names[k]).join(", ")}.` +
                          (missing.length > 0 ? ` Hittade inte ${missing.map((k) => names[k]).join(", ")}.` : ""),
                warning: warnings.join(" "),
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setFetching(false);
        }
    }

    function removeShownImage() {
        if (file) return clearFile();
        if (shopImage) return setShopImage(null); // back to the image the wish had
        setRemoveImage(true);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);

        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) formData.append(key, value);
        if (file) formData.append("image", file);
        else if (shopImage) formData.append("imageFromUrl", shopImage);
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

    const shownImage = preview ?? shopImage ?? (removeImage ? null : wish?.imageUrl);
    const undoable = Boolean(file || shopImage);

    return (
        <form onSubmit={handleSubmit} className="form wish-form">
            <div className="field">
                <label htmlFor="wish-url">Länk</label>
                <div className="input-with-button">
                    <input id="wish-url" name="url" value={fields.url} onChange={update} inputMode="url" placeholder="https://…" autoFocus={!wish} />
                    <button type="button" className="btn btn-small" onClick={fetchDetails} disabled={fetching || busy || !fields.url.trim()}>
                        {fetching ? "Hämtar…" : "Hämta uppgifter"}
                    </button>
                </div>
                {fetchResult ? (
                    <>
                        <small>{fetchResult.message}</small>
                        {fetchResult.warning && <small className="field-error">{fetchResult.warning}</small>}
                    </>
                ) : (
                    <small>Klistra in en produktlänk och klicka på Hämta uppgifter – det skriver över titel, beskrivning, pris och bild.</small>
                )}
            </div>

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

            <div className="field">
                <span>Bild (JPG eller PNG, max 4 MB)</span>
                {shownImage && (
                    <div className="image-preview">
                        <img src={shownImage} alt="" referrerPolicy="no-referrer" />
                        <button
                            type="button"
                            className="image-preview-remove"
                            onClick={removeShownImage}
                            aria-label={undoable ? "Ångra vald bild" : "Ta bort bilden"}
                            title={undoable ? "Ångra vald bild" : "Ta bort bilden"}
                        >
                            ×
                        </button>
                    </div>
                )}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png" onChange={handleFile} />
                {shopImage && !file && <small>Bilden från butiken sparas som en kopia när du sparar.</small>}
                {removeImage && !file && !shopImage && <small>Bilden tas bort när du sparar.</small>}
            </div>

            <ErrorMessage message={error} />

            <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy || fetching}>
                    {busy ? "Sparar…" : wish ? "Spara" : "Lägg till"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
                    Avbryt
                </button>
            </div>
        </form>
    );
}
