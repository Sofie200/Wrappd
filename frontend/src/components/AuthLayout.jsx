import { APP_NAME } from "../config.js";
import { Link } from "react-router-dom";

// The frame around the login and register forms
export default function AuthLayout({ title, children }) {
    return (
        <div className="auth">
            <div className="auth-card">
                <p className="auth-logo">
                    <Link to="/" className="logo">
                        <img src="/logo.png" alt="{APP_NAME}" id="logo" />
                    </Link>
                </p>
                <h1>{title}</h1>
                {children}
            </div>
        </div>
    );
}
