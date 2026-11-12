import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { api } from "../api.js";

// Find someone to add to a group. Two kinds of search, to protect people's privacy:
//  - As you type: only people you already share a group with, on part of their name or username.
//  - The "Sök" button (or Enter): anyone - but only on their exact username.
// excludeGroupId hides people who are already in that group.
export default function UserSearch({ excludeGroupId, onSelect, busy }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]); // from my groups, as I type
    const [exactResults, setExactResults] = useState(null); // from the button; null = not searched for this text
    const [error, setError] = useState(null);
    const [searching, setSearching] = useState(false);

    const term = q.trim();

    async function search(exact) {
        const params = new URLSearchParams({ q: term });
        if (excludeGroupId) params.set("excludeGroupId", excludeGroupId);
        if (exact) params.set("exact", "true");
        return (await api(`/users/search?${params}`)).data;
    }

    // As you type: my groups' members
    useEffect(() => {
        setExactResults(null); // a new text needs a new exact search
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
                const data = await search(false);
                if (!cancelled) {
                    setResults(data);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [term, excludeGroupId]);

    // The button: the exact username, among everyone
    async function searchExact(e) {
        e.preventDefault();
        if (term.length < 2) return;
        setSearching(true);
        setError(null);
        try {
            setExactResults(await search(true));
        } catch (err) {
            setError(err.message);
        } finally {
            setSearching(false);
        }
    }

    async function choose(user) {
        await onSelect(user);
        setQ("");
        setResults([]);
        setExactResults(null);
    }

    // Both lists together, each person once (someone in my groups can also match exactly)
    const shown = [...results, ...(exactResults ?? []).filter((u) => !results.some((r) => r.id === u.id))];

    return (
        <div className="user-search">
            <form className="input-with-button" onSubmit={searchExact} role="search">
                <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Namn eller användarnamn"
                    aria-label="Sök användare"
                    autoCapitalize="none"
                />
                <button type="submit" className="btn" disabled={term.length < 2 || searching}>
                    <Search size={16} aria-hidden="true" /> Sök
                </button>
            </form>

            {error && <p className="field-error">{error}</p>}

            {exactResults !== null && shown.length === 0 && (
                <p className="muted small">Det finns ingen med användarnamnet "{term}".</p>
            )}

            {shown.length > 0 && (
                <ul className="search-results">
                    {shown.map((user) => (
                        <li key={user.id}>
                            <span>
                                {user.name} <strong className="username">{user.username}</strong>
                                {user.isActivated === false && <span className="badge badge-private">Ej aktiverad</span>}
                            </span>
                            <button type="button" className="btn btn-small" onClick={() => choose(user)} disabled={busy}>
                                <Plus size={16} className="icon-lead" aria-hidden="true" /> Lägg till
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
