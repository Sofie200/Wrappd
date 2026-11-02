import "dotenv/config";
import { pathToFileURL } from "node:url";
import express from "express";
import cors from "cors";
import { HttpError } from "./_lib/http.js";
import { requireAuth } from "./_middleware/auth.js";
import authRoutes from "./_routes/auth-routes.js";
import userRoutes from "./_routes/user-routes.js";
import groupRoutes from "./_routes/group-routes.js";
import listRoutes from "./_routes/list-routes.js";
import wishRoutes from "./_routes/wish-routes.js";
import profileRoutes from "./_routes/profile-routes.js";
import childrenRoutes from "./_routes/children-routes.js";

const app = express();

// Only our own frontend may call the API from a browser
const allowedOrigins = ["http://localhost:5173", process.env.CLIENT_URL].filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Express 5 sends errors from async routes on to the error handler below – no try/catch needed in the routes
app.use("/api/auth", authRoutes);
app.use("/api/users", requireAuth, userRoutes);
app.use("/api/groups", requireAuth, groupRoutes);
app.use("/api/lists", requireAuth, listRoutes);
app.use("/api/wishes", requireAuth, wishRoutes);
app.use("/api/profile", requireAuth, profileRoutes);
app.use("/api/children", requireAuth, childrenRoutes);

app.use((req, res) => {
    res.status(404).json({ error: "Adressen finns inte" });
});

// Every error ends here. Known errors (HttpError) are sent as they are; anything else is logged
// and the user gets a general message – never a stack trace or an SQL error.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
    }
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Ogiltig JSON i förfrågan" });
    }

    console.error("[ERROR]", req.method, req.originalUrl, err);

    const databaseDown = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57014"].includes(err.code) ||
        /timeout|terminated/i.test(err.message ?? "");
    if (databaseDown) {
        return res.status(503).json({ error: "Databasen svarar inte just nu. Försök igen om en stund." });
    }
    res.status(500).json({ error: "Något gick fel på servern. Försök igen." });
});

// Locally (npm run dev): start a server. On Vercel the file is imported as a function instead.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`API running on http://localhost:${port}/api`));
}

export default app;
