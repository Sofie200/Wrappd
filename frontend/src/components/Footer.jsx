import { Link } from "react-router-dom";
import { APP_NAME } from "../config.js";

// The footer at the bottom of every logged-in page: what the app is, contact, privacy and © - all centred
export default function Footer() {
    return (
        <footer className="footer">
            <div className="footer-inner">
                <div className="footer-brand">
                    <img src="/logo.png" alt={APP_NAME} className="footer-logo" />
                    <p>Håll koll på önskelistor, inköp och gåvor - tillsammans.</p>
                </div>
            </div>

            <p className="footer-bottom">
                <span>© {new Date().getFullYear()} {APP_NAME}</span>
                <span>
                    Powered by{" "}
                    <a href="https://kirakira.se" target="_blank" rel="noopener noreferrer">
                        Kirakira.se
                    </a>
                </span>
                <span>
                    Kontakt: <a href="mailto:hej@wrappd.se">hej@wrappd.se</a>
                </span>
                <span>
                    <Link to="/integritet">Integritet och cookies</Link>
                </span>
            </p>
        </footer>
    );
}
