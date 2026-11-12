import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    // Whether the cookie (if any) still holds a login is only known after asking the server
    const [checking, setChecking] = useState(true);
    const [error, setError] = useState(null);

    // Forget the user here at once; the server removes the cookie (JavaScript can't - it's httpOnly)
    const logout = useCallback(() => {
        setUser(null);
        api("/auth/logout", { method: "POST" }).catch(() => {});
    }, []);

    useEffect(() => {
        // A 401 anywhere: the login is gone - just forget the user (the server has already cleared the cookie)
        setUnauthorizedHandler(() => setUser(null));
    }, []);

    // Ask the server who is logged in. 401 = nobody; a network error keeps trying possible,
    // so the user isn't logged out just because they're offline.
    const checkLogin = useCallback(async () => {
        setChecking(true);
        setError(null);
        try {
            const data = await api("/auth/me", { migrateOldLogin: true });
            setUser(data.user);
        } catch (err) {
            if (err.status !== 401) setError(err.message);
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => {
        checkLogin();
    }, [checkLogin]);

    // The server sets the login cookie on each of these; here we only keep the user
    async function login(username, password) {
        const data = await api("/auth/login", { method: "POST", body: { username, password } });
        setUser(data.user);
    }

    // credential = the ID token from Google's button. Returns nothing when logged in, or - for someone
    // without an account - { name, username, email }: suggestions for the last step (GoogleSignupPage)
    async function loginWithGoogle(credential) {
        const data = await api("/auth/google", { method: "POST", body: { credential } });
        if (data.signup) return data.signup;
        setUser(data.user);
    }

    // The last step: the account is created only now, with the username the user chose
    async function signupWithGoogle(credential, name, username) {
        const data = await api("/auth/google/signup", { method: "POST", body: { credential, name, username } });
        setUser(data.user);
    }

    // Connect / disconnect Google on the profile page - the login cookie stays as it is
    async function connectGoogle(credential) {
        const data = await api("/auth/google/connect", { method: "POST", body: { credential } });
        setUser(data.user);
    }

    // Delete my account for good. The server removes the cookie; here we just forget the user.
    async function deleteAccount(username) {
        await api("/auth/me", { method: "DELETE", body: { username } });
        setUser(null);
    }

    async function updateEmail(email) {
        const data = await api("/auth/me/email", { method: "PUT", body: { email } });
        setUser(data.user);
    }

    async function disconnectGoogle() {
        const data = await api("/auth/google", { method: "DELETE" });
        setUser(data.user);
    }

    async function register(name, username, email, password) {
        const data = await api("/auth/register", { method: "POST", body: { name, username, email, password } });
        setUser(data.user);
    }

    // Choose a password via an activation or reset link - logs in directly afterwards
    async function choosePassword(linkToken, password) {
        const data = await api(`/auth/link/${linkToken}`, { method: "POST", body: { password } });
        setUser(data.user);
    }

    // Name, icon and colour. The server renews the cookie, since the name is in the token.
    async function updateProfile(profile) {
        const data = await api("/auth/me", { method: "PUT", body: profile });
        setUser(data.user);
    }

    return (
        <AuthContext.Provider
            value={{ user, checking, error, login, loginWithGoogle, signupWithGoogle, connectGoogle, disconnectGoogle, updateEmail, deleteAccount, register, choosePassword, logout, updateProfile, retry: checkLogin }}
        >
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    return useContext(AuthContext);
}
