import { useEffect, useState } from "react";
import { api } from "../api.js";

// Search users on name or username. excludeGroupId hides people who are already in that group.
export default function UserSearch({ excludeGroupId, onSelect, busy }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);
    const [error, setError] = useState(null);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) {
            setResults([]);
            setError(null);
            return;
        }

        let cancelled = false;
        // Wait until the user has stopped typing for a moment
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const params = new URLSearchParams({ q: term });
                if (excludeGroupId) params.set("excludeGroupId", excludeGroupId);
                const data = await api(`/users/search?${params}`);
                if (!cancelled) {
                    setResults(data.data);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [q, excludeGroupId]);

    async function choose(user) {
        await onSelect(user);
        setQ("");
        setResults([]);
    }

    const term = q.trim();

    return (
        <div className="user-search">
            <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Sök på namn eller användarnamn"
                aria-label="Sök användare"
            />
            {error && <p className="field-error">{error}</p>}
            {term.length >= 2 && !searching && !error && results.length === 0 && (
                <p className="muted small">Ingen träff på "{term}".</p>
            )}
            {results.length > 0 && (
                <ul className="search-results">
                    {results.map((user) => (
                        <li key={user.id}>
                            <span>
                                {user.name} <strong className="username">{user.username}</strong>
                                {user.isActivated === false && <span className="badge badge-private">Ej aktiverad</span>}
                            </span>
                            <button type="button" className="btn btn-small" onClick={() => choose(user)} disabled={busy}>
                                Lägg till
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
