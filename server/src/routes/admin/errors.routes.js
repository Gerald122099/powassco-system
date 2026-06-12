// System error monitor — admin triage of captured 5xx responses.
import express from "express";
import ErrorLog from "../../models/ErrorLog.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];

router.get("/", ...guard, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const filter = status ? { status } : {};
  const [items, openCount] = await Promise.all([
    ErrorLog.find(filter).sort({ createdAt: -1 }).limit(200).lean(),
    ErrorLog.countDocuments({ status: "open" }),
  ]);
  res.json({ items, openCount });
});

// Record the action taken / root cause and close the error.
router.patch("/:id/resolve", ...guard, async (req, res) => {
  const resolution = String(req.body?.resolution || "").trim();
  if (!resolution) return res.status(400).json({ message: "Describe the action taken / root cause." });
  const doc = await ErrorLog.findByIdAndUpdate(
    req.params.id,
    { $set: { status: "resolved", resolution, resolvedBy: req.user?.fullName || "", resolvedAt: new Date() } },
    { new: true }
  );
  if (!doc) return res.status(404).json({ message: "Not found." });
  res.json(doc);
});

router.patch("/:id/reopen", ...guard, async (req, res) => {
  const doc = await ErrorLog.findByIdAndUpdate(req.params.id, { $set: { status: "open" } }, { new: true });
  if (!doc) return res.status(404).json({ message: "Not found." });
  res.json(doc);
});

export default router;
