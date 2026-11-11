import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID } from "../config.js";

// Google's own "Sign in with Google" button (Google Identity Services).
// Google gives us an ID token ("credential"), which the server checks and turns into our login cookie.
// Without VITE_GOOGLE_CLIENT_ID nothing is shown.
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptPromise = null;

function loadGoogleScript() {
    scriptPromise ??= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => {
            scriptPromise = null; // try again next time
            reject(new Error("Kunde inte ladda Google-inloggningen."));
        };
        document.head.appendChild(script);
    });
    return scriptPromise;
}

/**
 * @param {{ onCredential: (credential: string) => void, text?: "signin_with" | "signup_with" | "continue_with", onError?: (message: string) => void, divider?: boolean }} props
 */
export default function GoogleButton({ onCredential, text = "continue_with", onError, divider = true }) {
    const container = useRef(null);
    // The latest callback, without loading the button again on each render
    const callback = useRef(onCredential);
    callback.current = onCredential;
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!GOOGLE_CLIENT_ID) return;
        let cancelled = false;

        loadGoogleScript()
            .then(() => {
                if (cancelled || !container.current) return;
                window.google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: (response) => callback.current(response.credential),
                    ux_mode: "popup",
                });
                window.google.accounts.id.renderButton(container.current, {
                    type: "standard",
                    theme: "outline",
                    size: "large",
                    shape: "pill",
                    text,
                    locale: "sv",
                    width: Math.min(container.current.offsetWidth || 320, 400),
                });
            })
            .catch((err) => {
                if (cancelled) return;
                setFailed(true);
                onError?.(err.message);
            });

        return () => {
            cancelled = true;
        };
    }, [text, onError]);

    if (!GOOGLE_CLIENT_ID || failed) return null;

    return (
        <>
            {divider && (
                <div className="auth-divider">
                    <span>eller</span>
                </div>
            )}
            <div ref={container} className="google-button" />
        </>
    );
}
