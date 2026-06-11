// Staff chat — one shared team room for the office roles (admin,
// cashier, loan_officer, water_bill_officer, bookkeeper). Field
// accounts (plumber, meter_reader) are deliberately excluded per
// operator request.
//
//   GET  /api/chat?after=<messageId>  — last 100 messages, or only the
//                                       ones newer than `after` (the
//                                       client polls with its newest id)
//   POST /api/chat { text }           — send a message
//
// Polling, not websockets: the office is a handful of concurrent
// users; a 10-second poll against an indexed createdAt query is far
// simpler than a socket layer on Render and plenty responsive.

import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";

const ChatMessageSchema = new mongoose.Schema(
  {
    fromId: { type: String, default: "" },
    fromName: { type: String, default: "" },
    fromRole: { type: String, default: "" },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
ChatMessageSchema.index({ createdAt: -1 });
// Keep the room bounded: messages expire after 90 days.
ChatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
const ChatMessage = mongoose.model("ChatMessage", ChatMessageSchema);

const router = express.Router();
const CHAT_ROLES = ["admin", "cashier", "loan_officer", "water_bill_officer", "bookkeeper"];
const guard = [requireAuth, requireRole(CHAT_ROLES)];

router.get("/", ...guard, async (req, res) => {
  try {
    const after = String(req.query.after || "").trim();
    let filter = {};
    if (after && mongoose.Types.ObjectId.isValid(after)) {
      filter = { _id: { $gt: new mongoose.Types.ObjectId(after) } };
    }
    // Newest-last so the client can append directly. Without a cursor,
    // return the latest 100 (query newest-first then reverse).
    const items = after
      ? await ChatMessage.find(filter).sort({ _id: 1 }).limit(200).lean()
      : (await ChatMessage.find({}).sort({ _id: -1 }).limit(100).lean()).reverse();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ message: "Failed to load chat." });
  }
});

router.post("/", ...guard, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ message: "Message is empty." });
    if (text.length > 1000) return res.status(400).json({ message: "Message too long (1000 max)." });
    const msg = await ChatMessage.create({
      fromId: String(req.user?.id || req.user?._id || ""),
      fromName: req.user?.fullName || req.user?.employeeId || "Unknown",
      fromRole: req.user?.role || "",
      text,
    });
    res.status(201).json(msg.toObject());
  } catch (e) {
    res.status(500).json({ message: "Failed to send." });
  }
});

export default router;
