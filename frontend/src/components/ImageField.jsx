import { ImagePlus } from "lucide-react";

// The image part of a form - used with useImageChoice().
// The native file input is hidden; a themed button (a label wrapping it) opens the picker -
// on a phone that's the camera or the photo library.
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
            <div className="file-pick">
                <label className="btn btn-small file-btn">
                    <ImagePlus size={16} aria-hidden="true" /> {image.shown ? "Byt bild" : "Välj bild"}
                    <input
                        ref={image.inputRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        className="visually-hidden"
                        onChange={(e) => onError(image.pickFile(e.target.files?.[0]))}
                    />
                </label>
                {image.file && <span className="file-name">{image.file.name}</span>}
            </div>
            {image.shopImage && !image.file && <small>Bilden från butiken sparas som en kopia när du sparar.</small>}
            {image.removed && !image.undoable && <small>Bilden tas bort när du sparar.</small>}
        </div>
    );
}
