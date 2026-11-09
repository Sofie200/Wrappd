import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    // Whether the cookie (if any) still holds a login is only known after asking the server
    const [checking, setChecking] = useState(true);
    const [error, setError] = useState(null);

    // Forget the user here at once; the server removes the cookie (JavaScript can't – it's httpOnly)
    const logout = useCallback(() => {
        setUser(null);
        api("/auth/logout", { method: "POST" }).catch(() => {});
    }, []);

    useEffect(() => {
        // A 401 anywhere: the login is gone – just forget the user (the server has already cleared the cookie)
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

    async function register(name, username, password) {
        const data = await api("/auth/register", { method: "POST", body: { name, username, password } });
        setUser(data.user);
    }

    // Choose a password via an activation or reset link – logs in directly afterwards
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
            value={{ user, checking, error, login, register, choosePassword, logout, updateProfile, retry: checkLogin }}
        >
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    return useContext(AuthContext);
}
