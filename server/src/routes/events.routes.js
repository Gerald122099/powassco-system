import express from "express";
import EventPost, { EVENT_REACTIONS } from "../models/EventPost.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { pushToAllAsync } from "../utils/push.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "manager"])];
const actor = (req) => req.user?.fullName || req.user?.employeeId || "";

const cleanImages = (arr) =>
  (Array.isArray(arr) ? arr : []).filter((s) => typeof s === "string" && s.startsWith("data:image")).slice(0, 5);

const stats = (p) => {
  const r = p.reactions || {};
  const reactions = {};
  let total = 0;
  for (const k of EVENT_REACTIONS) { const n = Math.max(0, Number(r[k]) || 0); reactions[k] = n; total += n; }
  return {
    _id: p._id, title: p.title, description: p.description,
    imageCount: (p.images || []).length, reactions, totalReactions: total,
    views: Math.max(0, Number(p.views) || 0), published: p.published !== false,
    createdBy: p.createdBy, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
};

// List ALL posts (published + drafts) with view/reaction stats.
router.get("/", guard, async (req, res) => {
  try {
    const items = await EventPost.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json({ items: items.map(stats) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Full post incl. image base64 — for the editor.
router.get("/:id", guard, async (req, res) => {
  try {
    const p = await EventPost.findById(req.params.id).lean();
    if (!p) return res.status(404).json({ message: "Event not found." });
    res.json({ ...stats(p), images: p.images || [] });
  } catch { res.status(404).json({ message: "Event not found." }); }
});

router.post("/", guard, async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "Title is required." });
    const doc = await EventPost.create({
      title,
      description: String(req.body?.description || "").trim(),
      images: cleanImages(req.body?.images),
      published: req.body?.published !== false,
      createdBy: actor(req),
    });
    // Notify subscribed members about a newly-published event (web push + FCM),
    // fire-and-forget so we don't block the response. Drafts don't notify.
    if (doc.published) {
      pushToAllAsync({
        title: `📣 ${doc.title}`.slice(0, 80),
        body: (doc.description || "New event from POWASSCO").slice(0, 140),
        url: `/events/${doc._id}`,
        tag: `event-${doc._id}`,
      });
    }
    res.status(201).json(stats(doc.toObject()));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put("/:id", guard, async (req, res) => {
  try {
    const existing = await EventPost.findById(req.params.id).select("published").lean();
    if (!existing) return res.status(404).json({ message: "Event not found." });
    const patch = {};
    if ("title" in req.body) patch.title = String(req.body.title || "").trim();
    if ("description" in req.body) patch.description = String(req.body.description || "").trim();
    if ("images" in req.body) patch.images = cleanImages(req.body.images);
    if ("published" in req.body) patch.published = !!req.body.published;
    const p = await EventPost.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();
    if (!p) return res.status(404).json({ message: "Event not found." });
    // Notify only when a draft is published for the first time (edits to an
    // already-public post don't re-notify).
    if (patch.published === true && !existing.published) {
      pushToAllAsync({
        title: `📣 ${p.title}`.slice(0, 80),
        body: (p.description || "New event from POWASSCO").slice(0, 140),
        url: `/events/${p._id}`,
        tag: `event-${p._id}`,
      });
    }
    res.json(stats(p));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete("/:id", guard, async (req, res) => {
  try {
    const p = await EventPost.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ message: "Event not found." });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

export default router;
