import express from "express";
import AuditLog from "../../models/AuditLog.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];

router.get("/", guard, async (req, res) => {
  const { q = "", actor = "", action = "", from = "", to = "", page = "1", limit = "25" } = req.query;
  const filter = {};
  if (actor) filter.actorName = new RegExp(String(actor).trim(), "i");
  if (action) filter.action = new RegExp(String(action).trim(), "i");
  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    filter.$or = [{ actorName: rx }, { action: rx }, { path: rx }, { actorRole: rx }];
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, limit: lim });
});

export default router;
