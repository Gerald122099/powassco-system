import express from "express";
import ServiceRequest from "../../models/ServiceRequest.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];

router.get("/", guard, async (req, res) => {
  const { type = "", status = "", q = "", page = "1", limit = "20" } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    filter.$or = [{ fullName: rx }, { phone: rx }, { accountNumber: rx }, { meterNumber: rx }, { address: rx }, { email: rx }];
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const [items, total, pendingCount] = await Promise.all([
    ServiceRequest.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    ServiceRequest.countDocuments(filter),
    ServiceRequest.countDocuments({ status: "pending" }),
  ]);
  res.json({ items, total, pendingCount, page: pg, limit: lim });
});

router.patch("/:id", guard, async (req, res) => {
  const update = {};
  if ("status" in req.body) update.status = req.body.status;
  if ("adminNotes" in req.body) update.adminNotes = req.body.adminNotes;
  if (update.status === "resolved") {
    update.resolvedAt = new Date();
    update.handledBy = req.user?.fullName || req.user?.employeeId || "";
  }
  const doc = await ServiceRequest.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!doc) return res.status(404).json({ message: "Request not found." });
  res.json(doc);
});

router.delete("/:id", guard, async (req, res) => {
  const doc = await ServiceRequest.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: "Request not found." });
  res.json({ ok: true });
});

export default router;
