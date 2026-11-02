import { APP_NAME } from "../config.js";

// The frame around the login and register forms
export default function AuthLayout({ title, children }) {
    return (
        <div className="auth">
            <div className="auth-card">
                <p className="auth-logo">
                    <span aria-hidden="true">🎁</span> {APP_NAME}
                </p>
                <h1>{title}</h1>
                {children}
            </div>
        </div>
    );
}
