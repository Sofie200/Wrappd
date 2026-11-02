import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

// Fetches `path` from our API. reload() fetches again; the old data stays visible meanwhile.
// path = null fetches nothing.
export function useFetch(path) {
    const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
    const [version, setVersion] = useState(0);

    useEffect(() => {
        if (!path) {
            setState({ data: null, error: null, loading: false });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        api(path)
            .then((data) => {
                if (!cancelled) setState({ data, error: null, loading: false });
            })
            .catch((err) => {
                if (!cancelled) setState((prev) => ({ ...prev, error: err.message, loading: false }));
            });

        return () => {
            cancelled = true;
        };
    }, [path, version]);

    const reload = useCallback(() => setVersion((v) => v + 1), []);

    return { ...state, reload };
}
