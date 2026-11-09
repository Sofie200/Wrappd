import { Link } from "react-router-dom";
import { APP_NAME } from "../config.js";

// The footer at the bottom of every logged-in page: what the app is, the most used pages, and ©
export default function Footer() {
    return (
        <footer className="footer">
            <div className="footer-inner">
                <div className="footer-brand">
                    <img src="/logo.png" alt={APP_NAME} className="footer-logo" />
                    <p>Håll koll på önskelistor, inköp och gåvor – tillsammans.</p>
                </div>

                <nav className="footer-nav" aria-label="Sidfot">
                    <div>
                        <h2 className="footer-heading">Gåvor</h2>
                        <ul>
                            <li><Link to="/">Översikt</Link></li>
                            <li><Link to="/lists">Mina listor</Link></li>
                            <li><Link to="/gifts">Mina gåvor</Link></li>
                            <li><Link to="/santa/new">Secret Santa</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h2 className="footer-heading">Konto</h2>
                        <ul>
                            <li><Link to="/profile">Min profil</Link></li>
                            <li><Link to="/groups">Mina grupper</Link></li>
                            <li><Link to="/children">Mina barn</Link></li>
                        </ul>
                    </div>
                </nav>
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
            </p>
        </footer>
    );
}
