import express from "express";
import Announcement from "../../models/Announcement.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];
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
  res.status(201).json(a);
});

router.put("/:id", guard, async (req, res) => {
  const allow = ["title", "body", "image", "published"];
  const update = {};
  for (const k of allow) if (k in req.body) update[k] = req.body[k];
  if (update.image && update.image.length > MAX_IMAGE_CHARS) return res.status(413).json({ message: "Image is too large." });
  const a = await Announcement.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!a) return res.status(404).json({ message: "Announcement not found." });
  res.json(a);
});

router.delete("/:id", guard, async (req, res) => {
  const a = await Announcement.findByIdAndDelete(req.params.id);
  if (!a) return res.status(404).json({ message: "Announcement not found." });
  res.json({ ok: true });
});

export default router;
