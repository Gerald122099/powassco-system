import express from "express";
import Announcement from "../../models/Announcement.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { pushToAllAsync } from "../../utils/push.js";

// Build the broadcast push payload for a (published) announcement.
function announcementPush(a) {
  const body = String(a.body || "").replace(/\s+/g, " ").trim();
  return {
    title: `📢 ${a.title}`,
    body: body ? body.slice(0, 140) : "Tap to read the latest announcement.",
    url: "/",
    tag: `announcement-${a._id}`,
  };
}

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "manager"])];
const MAX_IMAGE_CHARS = 900000; // ~650KB image after base64

router.get("/", guard, async (req, res) => {
  res.json(await Announcement.find().sort({ createdAt: -1 }).limit(100).lean());
});

router.post("/", guard, async (req, res) => {
  const { title, body, image, published } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ message: "Title is required." });
  if (image && image.length > MAX_IMAGE_CHARS) return res.status(413).json({ message: "Image is too large — please use a smaller photo." });
  const a = await Announcement.create({
    title: String(title).trim(),
    body: body || "",
    image: image || "",
    published: published !== false,
    createdBy: req.user?.fullName || req.user?.employeeId || "",
  });
  // Notify every consumer device the moment a published announcement goes up.
  if (a.published) pushToAllAsync(announcementPush(a));
  res.status(201).json(a);
});

router.put("/:id", guard, async (req, res) => {
  const allow = ["title", "body", "image", "published"];
  const update = {};
  for (const k of allow) if (k in req.body) update[k] = req.body[k];
  if (update.image && update.image.length > MAX_IMAGE_CHARS) return res.status(413).json({ message: "Image is too large." });
  // Detect a draft → published transition so we notify only when it first
  // goes live (not on every subsequent edit).
  const before = await Announcement.findById(req.params.id).select("published").lean();
  const a = await Announcement.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!a) return res.status(404).json({ message: "Announcement not found." });
  if (before && before.published === false && a.published === true) {
    pushToAllAsync(announcementPush(a));
  }
  res.json(a);
});

router.delete("/:id", guard, async (req, res) => {
  const a = await Announcement.findByIdAndDelete(req.params.id);
  if (!a) return res.status(404).json({ message: "Announcement not found." });
  res.json({ ok: true });
});

export default router;
