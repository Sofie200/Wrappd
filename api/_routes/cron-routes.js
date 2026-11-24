// Scheduled jobs, called by Vercel Cron (the "crons" in vercel.json) - not by users.
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; without the right secret nothing happens.
// CRON_SECRET is set in the Vercel project's environment variables (and in .env to try it locally).
import { Router } from "express";
import { pool } from "../_db/pool.js";
import { HttpError } from "../_lib/http.js";
import { cleanupNotifications } from "../_lib/notify.js";

const router = Router();

function requireCronSecret(req) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, "Inte behörig");
}

/* --- GET /api/cron/cleanup → { notificationsDeleted } - every night (see vercel.json) --- */
router.get("/cleanup", async (req, res) => {
    requireCronSecret(req);
    const notificationsDeleted = await cleanupNotifications(pool);
    console.log(`[CRON] cleanup: ${notificationsDeleted} notifications deleted`);
    res.json({ notificationsDeleted });
});

export default router;
