import express from "express";
import Asset, { ASSET_CATEGORIES } from "../../models/Asset.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

async function nextAssetTag() {
  const last = await Asset.findOne({ assetTag: /^PW-ASSET-\d+$/ }).sort({ createdAt: -1 }).lean();
  let n = 1;
  if (last?.assetTag) {
    const m = last.assetTag.match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `PW-ASSET-${String(n).padStart(4, "0")}`;
}

router.get("/categories", guard, (req, res) => res.json(ASSET_CATEGORIES));

router.get("/", guard, async (req, res) => {
  const { q = "", category = "", status = "", due = "", page = "1", limit = "20" } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (due === "1") {
    filter.$or = [{ nextAuditDue: { $lte: new Date() } }, { nextAuditDue: null }, { lastAuditedAt: null }];
  }
  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    const search = [{ name: rx }, { brand: rx }, { model: rx }, { serialNumber: rx }, { assignedTo: rx }, { assetTag: rx }];
    filter.$and = filter.$or ? [{ $or: filter.$or }, { $or: search }] : undefined;
    if (filter.$and) delete filter.$or;
    else filter.$or = search;
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const [items, total, dueCount] = await Promise.all([
    Asset.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    Asset.countDocuments(filter),
    Asset.countDocuments({ status: { $ne: "disposed" }, $or: [{ nextAuditDue: { $lte: new Date() } }, { lastAuditedAt: null }] }),
  ]);
  res.json({ items, total, dueCount, page: pg, limit: lim });
});

router.post("/", guard, async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category) return res.status(400).json({ message: "Name and category are required." });
  const assetTag = b.assetTag?.trim() || (await nextAssetTag());
  const asset = await Asset.create({ ...b, assetTag, name: String(b.name).trim() });
  res.status(201).json(asset);
});

router.put("/:id", guard, async (req, res) => {
  const allow = [
    "assetTag", "category", "name", "brand", "model", "serialNumber", "specs",
    "assignedTo", "location", "status", "condition", "acquisitionDate", "value", "notes",
  ];
  const update = {};
  for (const k of allow) if (k in req.body) update[k] = req.body[k];
  const asset = await Asset.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!asset) return res.status(404).json({ message: "Asset not found." });
  res.json(asset);
});

// Record a 6-month audit check.
router.post("/:id/audit", guard, async (req, res) => {
  const { present = true, condition = "good", notes = "" } = req.body || {};
  const asset = await Asset.findById(req.params.id);
  if (!asset) return res.status(404).json({ message: "Asset not found." });
  const now = new Date();
  asset.auditHistory.push({ date: now, present: !!present, condition, notes, auditedBy: req.user?.fullName || req.user?.employeeId || "" });
  asset.lastAuditedAt = now;
  asset.nextAuditDue = addMonths(now, 6);
  asset.condition = condition;
  if (!present) asset.notes = `[${now.toLocaleDateString()}] Reported MISSING. ${notes}`.trim();
  await asset.save();
  res.json(asset);
});

router.delete("/:id", guard, async (req, res) => {
  const asset = await Asset.findByIdAndDelete(req.params.id);
  if (!asset) return res.status(404).json({ message: "Asset not found." });
  res.json({ ok: true });
});

export default router;
