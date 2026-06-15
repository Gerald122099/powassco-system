// Admin controls + external trigger for the water-bill reminder job.
//
//   GET  /api/admin/reminders/preview   (admin)  — dry-run: what WOULD go out now
//   POST /api/admin/reminders/run       (admin)  — run a real pass now (body: { dry })
//   POST /api/admin/reminders/cron      (secret) — for Render Cron / uptime pings;
//                                                   honours the once-per-day gate.
//
// The in-process hourly tick (jobs/billReminders.js) covers always-on
// instances. The /cron endpoint exists because a host that sleeps (free
// tier) won't fire the timer — an external scheduler hitting this with the
// CRON_SECRET header wakes it and runs the daily pass reliably.

import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { runBillReminders, runBillRemindersIfDue } from "../../jobs/billReminders.js";

const router = express.Router();
const adminGuard = [requireAuth, requireRole(["admin"])];

router.get("/preview", ...adminGuard, async (req, res) => {
  try {
    const summary = await runBillReminders(new Date(), { dry: true });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/run", ...adminGuard, async (req, res) => {
  try {
    const dry = req.body?.dry === true;
    const summary = await runBillReminders(new Date(), { dry });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unauthenticated but secret-gated: for an external scheduler.
router.post("/cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "CRON_SECRET not configured." });
  const provided = req.get("x-cron-secret") || req.query.secret || "";
  if (provided !== secret) return res.status(401).json({ error: "Bad cron secret." });
  try {
    const result = await runBillRemindersIfDue(new Date());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
