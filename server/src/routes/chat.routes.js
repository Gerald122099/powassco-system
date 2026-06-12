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
import User from "../models/User.js";

const ChatMessageSchema = new mongoose.Schema(
  {
    fromId: { type: String, default: "" },
    fromName: { type: String, default: "" },
    fromRole: { type: String, default: "" },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    fromAvatar: { type: String, default: "" }, // data-URL snapshot at send time
    // One reaction per user; admin reactions render specially client-side.
    reactions: { type: [{ emoji: String, by: String, byId: String, byRole: String }], default: [] },
    editedAt: { type: Date, default: null },
    // Soft delete: the bubble stays in the thread as "message deleted"
    // so the conversation flow isn't silently rewritten.
    deleted: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
ChatMessageSchema.index({ createdAt: -1 });
// Keep the room bounded: messages expire after 90 days.
ChatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
const ChatMessage = mongoose.model("ChatMessage", ChatMessageSchema);

const router = express.Router();
const CHAT_ROLES = ["admin", "manager", "cashier", "loan_officer", "water_bill_officer", "bookkeeper"];
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
    const sender = await User.findById(req.user?.id || req.user?._id).select("avatar").lean();
    const msg = await ChatMessage.create({
      fromId: String(req.user?.id || req.user?._id || ""),
      fromName: req.user?.fullName || req.user?.employeeId || "Unknown",
      fromRole: req.user?.role || "",
      fromAvatar: sender?.avatar || "",
      text,
    });
    res.status(201).json(msg.toObject());
  } catch (e) {
    res.status(500).json({ message: "Failed to send." });
  }
});

// Edit own message (admin may edit anyone's). Re-edits allowed; the
// bubble shows an "edited" tag from editedAt.
router.patch("/:id", ...guard, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ message: "Message is empty." });
    if (text.length > 1000) return res.status(400).json({ message: "Message too long (1000 max)." });
    const msg = await ChatMessage.findById(req.params.id);
    if (!msg || msg.deleted) return res.status(404).json({ message: "Message not found." });
    const isOwner = msg.fromId === String(req.user?.id || req.user?._id || "");
    if (!isOwner && req.user?.role !== "admin") {
      return res.status(403).json({ message: "You can only edit your own messages." });
    }
    msg.text = text;
    msg.editedAt = new Date();
    await msg.save();
    res.json(msg.toObject());
  } catch (e) {
    res.status(500).json({ message: "Failed to edit." });
  }
});

// Delete (soft) own message; admin may delete anyone's.
router.delete("/:id", ...guard, async (req, res) => {
  try {
    const msg = await ChatMessage.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: "Message not found." });
    const isOwner = msg.fromId === String(req.user?.id || req.user?._id || "");
    if (!isOwner && req.user?.role !== "admin") {
      return res.status(403).json({ message: "You can only delete your own messages." });
    }
    // updateOne sidesteps the required-text validator; the original
    // text is wiped so a deleted message can't be recovered via API.
    await ChatMessage.updateOne({ _id: msg._id }, { $set: { deleted: true, text: "(deleted)" } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Failed to delete." });
  }
});

// Toggle a reaction. One reaction per user per message — reacting again
// with the same emoji removes it; a different emoji replaces it.
router.post("/:id/react", ...guard, async (req, res) => {
  try {
    const emoji = String(req.body?.emoji || "").slice(0, 8);
    if (!emoji) return res.status(400).json({ message: "Emoji required." });
    const msg = await ChatMessage.findById(req.params.id);
    if (!msg || msg.deleted) return res.status(404).json({ message: "Message not found." });
    const myId = String(req.user?.id || req.user?._id || "");
    const existing = msg.reactions.find((r) => r.byId === myId);
    if (existing && existing.emoji === emoji) {
      msg.reactions = msg.reactions.filter((r) => r.byId !== myId);
    } else {
      msg.reactions = msg.reactions.filter((r) => r.byId !== myId);
      msg.reactions.push({ emoji, by: req.user?.fullName || "", byId: myId, byRole: req.user?.role || "" });
    }
    await msg.save();
    res.json(msg.toObject());
  } catch (e) {
    res.status(500).json({ message: "Failed to react." });
  }
});

// Set my profile photo (shown beside my chat messages going forward).
router.post("/avatar", ...guard, async (req, res) => {
  try {
    const avatar = String(req.body?.avatar || "");
    if (avatar.length > 150000) return res.status(400).json({ message: "Photo too large (100KB max)." });
    await User.updateOne({ _id: req.user?.id || req.user?._id }, { $set: { avatar } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Failed to save photo." });
  }
});

export default router;
