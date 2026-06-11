// Developer feedback — public form on the homepage ("message the
// developer") that lands in the admin dashboard's Dev Feedback inbox.
//
//   POST /api/public/dev-feedback          — anyone (rate-limited 40/min/IP
//                                            by the public limiter; plus a
//                                            tight per-route limiter below)
//   GET  /api/public/dev-feedback/admin    — admin list
//   PATCH /api/public/dev-feedback/admin/:id — admin mark read/unread
//   DELETE /api/public/dev-feedback/admin/:id — admin delete
//
// Admin sub-paths live here (not a separate file) because the model is
// tiny and the public POST + admin read belong to one feature.

import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const DeveloperFeedbackSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", trim: true, maxlength: 80 },
    contact: { type: String, default: "", trim: true, maxlength: 120 }, // email / phone, optional
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    page: { type: String, default: "", maxlength: 200 }, // where it was sent from
    status: { type: String, enum: ["unread", "read"], default: "unread", index: true },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
);
DeveloperFeedbackSchema.index({ createdAt: -1 });
const DeveloperFeedback = mongoose.model("DeveloperFeedback", DeveloperFeedbackSchema);

const router = express.Router();
const adminGuard = [requireAuth, requireRole(["admin"])];

// Tighter than the global public limiter: 5 submissions / 10 min / IP.
// Feedback is a classic spam target.
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many messages — please try again later." },
});

router.post("/", submitLimiter, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (message.length < 5) return res.status(400).json({ message: "Please write a message (at least 5 characters)." });
    if (message.length > 2000) return res.status(400).json({ message: "Message is too long (2000 characters max)." });
    const fb = await DeveloperFeedback.create({
      name: String(req.body?.name || "").trim().slice(0, 80),
      contact: String(req.body?.contact || "").trim().slice(0, 120),
      message,
      page: String(req.body?.page || "").slice(0, 200),
      ip: (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim(),
    });
    res.status(201).json({ ok: true, id: fb._id });
  } catch (e) {
    res.status(500).json({ message: "Failed to send feedback." });
  }
});

router.get("/admin", adminGuard, async (req, res) => {
  try {
    const status = String(req.query.status || "").trim();
    const filter = status ? { status } : {};
    const [items, unread] = await Promise.all([
      DeveloperFeedback.find(filter).sort({ createdAt: -1 }).limit(200).lean(),
      DeveloperFeedback.countDocuments({ status: "unread" }),
    ]);
    res.json({ items, unread });
  } catch (e) {
    res.status(500).json({ message: "Failed to load feedback." });
  }
});

router.patch("/admin/:id", adminGuard, async (req, res) => {
  try {
    const status = req.body?.status === "read" ? "read" : "unread";
    const fb = await DeveloperFeedback.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!fb) return res.status(404).json({ message: "Not found." });
    res.json(fb);
  } catch (e) {
    res.status(500).json({ message: "Failed to update." });
  }
});

router.delete("/admin/:id", adminGuard, async (req, res) => {
  try {
    const fb = await DeveloperFeedback.findByIdAndDelete(req.params.id);
    if (!fb) return res.status(404).json({ message: "Not found." });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Failed to delete." });
  }
});

export default router;
