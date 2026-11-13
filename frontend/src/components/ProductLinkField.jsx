import { ArrowDownToLine } from "lucide-react";
import { useState } from "react";
import { fetchProduct } from "../productFetch.js";
import InfoTip from "./InfoTip.jsx";
import { ErrorMessage } from "./Feedback.jsx";

// The link field with "Hämta". onFetched(product) gets what the shop's page had.
// A failed fetch (e.g. "Butiken släpper inte in oss") is shown right under the field, not by the form.
export default function ProductLinkField({ value, onChange, onFetched, onError, disabled, autoFocus, id = "product-url" }) {
    const [fetching, setFetching] = useState(false);
    const [result, setResult] = useState(null); // { message, warning }
    const [fetchError, setFetchError] = useState(null);

    async function handleFetch() {
        setResult(null);
        if (!value.trim()) return setFetchError("Klistra in en länk först.");
        setFetching(true);
        setFetchError(null);
        onError?.(null); // a form error from an earlier fetch is no longer true
        try {
            const { product, message, warning } = await fetchProduct(value);
            onFetched(product);
            setResult({ message, warning });
        } catch (err) {
            setFetchError(err.message);
        } finally {
            setFetching(false);
        }
    }

    return (
        <div className="field">
            {/* The (i) beside the label, not inside it - a button in a label would take over as its control */}
            <span className="field-label-row">
                <label htmlFor={id}>Länk</label>
                <InfoTip label="Om länken">
                    Klistra in en produktlänk och klicka på Hämta om du vill slippa att fylla i alla fält.
                </InfoTip>
            </span>
            <div className="input-with-button">
                <input id={id} name="url" value={value} onChange={onChange} inputMode="url" placeholder="https://…" autoFocus={autoFocus} disabled={disabled} />
                <button type="button" className="btn btn-small" onClick={handleFetch} disabled={fetching || disabled || !value.trim()}>
                    <ArrowDownToLine size={16} aria-hidden="true" /> {fetching ? "Hämtar…" : "Hämta"}
                </button>
            </div>
            {/* The same red box as the form's errors - but right here under the field */}
            <ErrorMessage message={fetchError} />
            {result && (
                <>
                    <small>{result.message}</small>
                    {result.warning && <small className="field-error">{result.warning}</small>}
                </>
            )}
        </div>
    );
}
