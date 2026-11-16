// Vercel Edge Middleware for the frontend project: link previews for shared lists.
// Crawlers (Messenger, iMessage, Slack, …) don't run JavaScript, so they only see index.html's general
// og:tags. For /s/<token> we fetch the list's title from the API and put it into the page's <title> and
// og:/twitter: tags before it's sent. Everyone else gets the very same page - the app takes over as usual.
// If anything goes wrong (the API is down, the link doesn't work), the ordinary index.html is served.
// Runs on Vercel only - `npm run dev` (Vite) never sees this file. Vercel only picks it up in the ROOT of
// the project that serves the site - so the same file lies both in the repo's root and in frontend/.

export const config = { matcher: "/s/:token*" };

const APP_NAME = process.env.VITE_APP_NAME || "Wrappd";
// The backend's address + /api, as in the build - or, if that isn't an absolute address (or isn't set
// here), the API on this same site (when the frontend and the API are deployed together)
function apiUrl(origin) {
    const fromEnv = process.env.VITE_API_URL ?? "";
    return /^https?:\/\//.test(fromEnv) ? fromEnv.replace(/\/$/, "") : `${origin}/api`;
}

// Safe inside an HTML attribute or <title>
const escape = (text) =>
    String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// "24 december 2026"
function longDate(iso) {
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
}

// Replaces a tag's content attribute (or <title>), or adds the tag before </head> if it's missing
function setMeta(html, attr, name, value) {
    const pattern = new RegExp(`<meta\\s+${attr}="${name}"[^>]*>`, "i");
    const tag = `<meta ${attr}="${name}" content="${escape(value)}" />`;
    return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `    ${tag}\n    </head>`);
}

export default async function middleware(request) {
    const url = new URL(request.url);
    const token = url.pathname.split("/")[2] ?? "";
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return; // carry on as usual

    try {
        const [shared, page] = await Promise.all([
            fetch(`${apiUrl(url.origin)}/share/${token}`, { headers: { accept: "application/json" } }),
            fetch(new URL("/index.html", url)),
        ]);
        if (!shared.ok || !page.ok) return;

        const { list, recipients } = await shared.json();
        const title = `${list.title} - ${APP_NAME}`;
        const description =
            `Önskelista${recipients.length > 0 ? ` till ${recipients.join(", ")}` : ""} · ${longDate(list.endDate)}` +
            (list.description ? ` · ${list.description}` : "");

        let html = await page.text();
        html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(title)}</title>`);
        html = setMeta(html, "name", "description", description);
        html = setMeta(html, "property", "og:title", list.title);
        html = setMeta(html, "property", "og:description", description);
        html = setMeta(html, "property", "og:url", url.href);
        html = setMeta(html, "name", "twitter:title", list.title);
        html = setMeta(html, "name", "twitter:description", description);

        return new Response(html, {
            headers: {
                "content-type": "text/html; charset=utf-8",
                // Short: a new link or a renamed list should show up in previews soon
                "cache-control": "public, max-age=0, s-maxage=300",
            },
        });
    } catch {
        // Fall back to the ordinary page
    }
}
