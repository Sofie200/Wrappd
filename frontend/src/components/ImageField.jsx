// The image part of a form – used with useImageChoice()
export default function ImageField({ image, onError, label = "Bild (JPG eller PNG, max 4 MB)" }) {
    return (
        <div className="field">
            <span>{label}</span>
            {image.shown && (
                <div className="image-preview">
                    <img src={image.shown} alt="" referrerPolicy="no-referrer" />
                    <button
                        type="button"
                        className="image-preview-remove"
                        onClick={image.removeShown}
                        aria-label={image.undoable ? "Ångra vald bild" : "Ta bort bilden"}
                        title={image.undoable ? "Ångra vald bild" : "Ta bort bilden"}
                    >
                        ×
                    </button>
                </div>
            )}
            <input
                ref={image.inputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => onError(image.pickFile(e.target.files?.[0]))}
            />
            {image.shopImage && !image.file && <small>Bilden från butiken sparas som en kopia när du sparar.</small>}
            {image.removed && !image.undoable && <small>Bilden tas bort när du sparar.</small>}
        </div>
    );
}
