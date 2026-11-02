import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    // Only "checking" if there is a saved token to check
    const [checking, setChecking] = useState(() => Boolean(getToken()));
    const [error, setError] = useState(null);

    const logout = useCallback(() => {
        clearToken();
        setUser(null);
    }, []);

    useEffect(() => {
        setUnauthorizedHandler(logout);
    }, [logout]);

    // A saved token: ask the server who it belongs to. 401 logs out (via api.js);
    // a network error keeps the token, so the user isn't logged out just because they're offline.
    const checkToken = useCallback(async () => {
        if (!getToken()) return;
        setChecking(true);
        setError(null);
        try {
            const data = await api("/auth/me");
            setUser(data.user);
        } catch (err) {
            if (err.status !== 401) setError(err.message);
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => {
        checkToken();
    }, [checkToken]);

    async function login(username, password) {
        const data = await api("/auth/login", { method: "POST", body: { username, password } });
        setToken(data.token);
        setUser(data.user);
    }

    async function register(name, username, password) {
        const data = await api("/auth/register", { method: "POST", body: { name, username, password } });
        setToken(data.token);
        setUser(data.user);
    }

    return (
        <AuthContext.Provider value={{ user, checking, error, login, register, logout, retry: checkToken }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    return useContext(AuthContext);
}
