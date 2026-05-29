import express from "express";
import Meeting from "../models/Meeting.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const adminGuard = [requireAuth, requireRole(["admin"])];

// Upcoming meetings for the signed-in user's dashboard (any role).
router.get("/upcoming", requireAuth, async (req, res) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const meetings = await Meeting.find({
    datetime: { $gte: since },
    $or: [{ audience: "all" }, { audience: req.user.role }],
  })
    .sort({ datetime: 1 })
    .limit(5)
    .lean();
  res.json(meetings);
});

// Admin management
router.get("/", adminGuard, async (req, res) => {
  const meetings = await Meeting.find().sort({ datetime: -1 }).limit(100).lean();
  res.json(meetings);
});

router.post("/", adminGuard, async (req, res) => {
  const { title, type, datetime, location, notes, audience } = req.body || {};
  if (!title || !datetime) return res.status(400).json({ message: "Title and date/time are required." });
  const m = await Meeting.create({
    title: String(title).trim(),
    type: type || "meeting",
    datetime: new Date(datetime),
    location: location || "",
    notes: notes || "",
    audience: audience || "all",
    createdBy: req.user?.fullName || req.user?.employeeId || "",
  });
  res.status(201).json(m);
});

router.put("/:id", adminGuard, async (req, res) => {
  const allow = ["title", "type", "datetime", "location", "notes", "audience"];
  const update = {};
  for (const k of allow) if (k in req.body) update[k] = k === "datetime" ? new Date(req.body[k]) : req.body[k];
  const m = await Meeting.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!m) return res.status(404).json({ message: "Meeting not found." });
  res.json(m);
});

router.delete("/:id", adminGuard, async (req, res) => {
  const m = await Meeting.findByIdAndDelete(req.params.id);
  if (!m) return res.status(404).json({ message: "Meeting not found." });
  res.json({ ok: true });
});

export default router;
