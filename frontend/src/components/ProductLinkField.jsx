import { useState } from "react";
import { fetchProduct } from "../productFetch.js";

// The link field with "Hämta". onFetched(product) gets what the shop's page had.
export default function ProductLinkField({ value, onChange, onFetched, onError, disabled, autoFocus, id = "product-url" }) {
    const [fetching, setFetching] = useState(false);
    const [result, setResult] = useState(null); // { message, warning }

    async function handleFetch() {
        if (!value.trim()) return onError("Klistra in en länk först.");
        setFetching(true);
        setResult(null);
        onError(null);
        try {
            const { product, message, warning } = await fetchProduct(value);
            onFetched(product);
            setResult({ message, warning });
        } catch (err) {
            onError(err.message);
        } finally {
            setFetching(false);
        }
    }

    return (
        <div className="field">
            <label htmlFor={id}>Länk</label>
            <div className="input-with-button">
                <input id={id} name="url" value={value} onChange={onChange} inputMode="url" placeholder="https://…" autoFocus={autoFocus} disabled={disabled} />
                <button type="button" className="btn btn-small" onClick={handleFetch} disabled={fetching || disabled || !value.trim()}>
                    {fetching ? "Hämtar…" : "Hämta"}
                </button>
            </div>
            {result ? (
                <>
                    <small>{result.message}</small>
                    {result.warning && <small className="field-error">{result.warning}</small>}
                </>
            ) : (
                <small>Klistra in en produktlänk och klicka på Hämta om du vill slippa att fylla i alla fält.</small>
            )}
        </div>
    );
}
