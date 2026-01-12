// server/routes/water/waterPayments.routes.js
import express from "express";
import WaterPayment from "../../models/WaterPayment.js";
import WaterBill from "../../models/WaterBill.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { periodCoveredLabel } from "../../utils/waterPeriod.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer"])];

// GET /api/water/payments?q=&page=&limit=&periodKey=YYYY-MM
router.get("/", ...guard, async (req, res) => {
  const q = (req.query.q || "").trim();
  const periodKey = (req.query.periodKey || "").trim();

  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "12", 10)));
  const skip = (page - 1) * limit;

  const filter = {};
  if (q) {
    filter.$or = [
      { pnNo: { $regex: q, $options: "i" } },
      { orNo: { $regex: q, $options: "i" } },
    ];
  }

  // periodKey filter: find bills for that period and match payment billIds
  if (periodKey) {
    const periodCovered = periodCoveredLabel(periodKey);
    const bills = await WaterBill.find({ periodCovered }).select("_id");
    filter.billId = { $in: bills.map((b) => b._id) };
  }

  const [items, total] = await Promise.all([
    WaterPayment.find(filter).sort({ paidAt: -1 }).skip(skip).limit(limit),
    WaterPayment.countDocuments(filter),
  ]);

  res.json({ items, total, page, limit });
});

export default router;
