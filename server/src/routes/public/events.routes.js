import express from "express";
import EventPost, { EVENT_REACTIONS } from "../../models/EventPost.js";

const router = express.Router();

// Shape a post for the client: drop the heavy image base64 (served lazily via
// the image route), expose imageCount, and clamp reaction tallies at 0.
function shape(p) {
  const r = p.reactions || {};
  const reactions = {};
  for (const k of EVENT_REACTIONS) reactions[k] = Math.max(0, Number(r[k]) || 0);
  return {
    _id: p._id,
    title: p.title,
    description: p.description,
    imageCount: p.imageCount != null ? p.imageCount : (p.images || []).length,
    reactions,
    views: Math.max(0, Number(p.views) || 0),
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// List published events (newest first). Aggregation projects imageCount and
// EXCLUDES the heavy images[] so base64 never leaves the database.
router.get("/", async (req, res) => {
  try {
    const items = await EventPost.aggregate([
      { $match: { published: true } },
      { $sort: { createdAt: -1 } },
      { $limit: 60 },
      { $project: { title: 1, description: 1, reactions: 1, views: 1, createdBy: 1, createdAt: 1, updatedAt: 1, imageCount: { $size: { $ifNull: ["$images", []] } } } },
    ]);
    res.json({ items: items.map(shape) });
  } catch (e) { res.status(500).json({ message: e.message || "Failed to load events." }); }
});

// Single post (for the shareable /events/:id view).
router.get("/:id", async (req, res) => {
  try {
    const p = await EventPost.findById(req.params.id).lean();
    if (!p || !p.published) return res.status(404).json({ message: "Event not found." });
    res.json(shape(p));
  } catch { res.status(404).json({ message: "Event not found." }); }
});

// Lazy image by index (decoded from the stored data URL, browser-cached).
router.get("/:id/image/:idx", async (req, res) => {
  try {
    const p = await EventPost.findById(req.params.id).select("images published").lean();
    const img = p?.published ? (p.images || [])[Number(req.params.idx)] : null;
    const m = img && /^data:(.+?);base64,(.+)$/s.exec(img);
    if (!m) return res.status(404).end();
    res.set("Content-Type", m[1]);
    // Long cache; the client appends ?v=updatedAt so a replaced image busts it.
    res.set("Cache-Control", "public, max-age=604800, immutable");
    res.send(Buffer.from(m[2], "base64"));
  } catch { res.status(500).end(); }
});

// Count a view (client guards double-counting per browser).
router.post("/:id/view", async (req, res) => {
  try {
    await EventPost.updateOne({ _id: req.params.id, published: true }, { $inc: { views: 1 } });
    res.json({ ok: true });
  } catch { res.status(200).json({ ok: false }); }
});

// React: set `reaction`, optionally clearing a `prev` one (client tracks its
// own choice in localStorage so it's one-per-browser, toggleable).
router.post("/:id/react", async (req, res) => {
  try {
    const reaction = String(req.body?.reaction || "");
    const prev = String(req.body?.prev || "");
    const inc = {};
    if (reaction && EVENT_REACTIONS.includes(reaction)) inc[`reactions.${reaction}`] = 1;
    if (prev && prev !== reaction && EVENT_REACTIONS.includes(prev)) inc[`reactions.${prev}`] = -1;
    if (!Object.keys(inc).length) return res.status(400).json({ message: "Invalid reaction." });
    const p = await EventPost.findOneAndUpdate({ _id: req.params.id, published: true }, { $inc: inc }, { new: true }).lean();
    if (!p) return res.status(404).json({ message: "Event not found." });
    res.json({ ok: true, reactions: shape(p).reactions });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

export default router;
