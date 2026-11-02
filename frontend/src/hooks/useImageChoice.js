import { useEffect, useRef, useState } from "react";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from "../config.js";

// The image in a form: the current one (currentUrl), a new file, or a shop's image from "Hämta uppgifter".
// The server gets: "image" (a file), or "imageFromUrl" (it saves its own copy), or "removeImage".
export function useImageChoice(currentUrl) {
    const [file, setFile] = useState(null);         // a new image, not uploaded yet
    const [preview, setPreview] = useState(null);   // local preview of that image
    const [shopImage, setShopImage] = useState(null);
    const [removed, setRemoved] = useState(false);
    const inputRef = useRef(null);

    // Free the preview's memory when it is replaced or the form closes
    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

    function clearFile() {
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
    }

    // Returns an error message, or null
    function pickFile(picked) {
        if (!picked) {
            clearFile();
            return null;
        }
        if (!ALLOWED_IMAGE_TYPES.includes(picked.type)) {
            clearFile();
            return "Bilden måste vara JPG eller PNG.";
        }
        if (picked.size > MAX_IMAGE_SIZE) {
            clearFile();
            return "Bilden är för stor. Max 4 MB.";
        }
        setFile(picked);
        setPreview(URL.createObjectURL(picked));
        setRemoved(false);
        setShopImage(null);
        return null;
    }

    function takeShopImage(url) {
        clearFile();
        setRemoved(false);
        setShopImage(url);
    }

    // The × on the preview: undo a new choice, or remove the current image
    function removeShown() {
        if (file) return clearFile();
        if (shopImage) return setShopImage(null);
        setRemoved(true);
    }

    function appendTo(formData) {
        if (file) formData.append("image", file);
        else if (shopImage) formData.append("imageFromUrl", shopImage);
        else if (removed && currentUrl) formData.append("removeImage", "true");
    }

    return {
        inputRef,
        file,
        shopImage,
        removed,
        shown: preview ?? shopImage ?? (removed ? null : currentUrl ?? null),
        undoable: Boolean(file || shopImage),
        pickFile,
        takeShopImage,
        removeShown,
        appendTo,
    };
}
