// server/src/routes/water/waterBills.routes.js
import express from "express";
import WaterBill from "../../models/WaterBill.js";
import WaterPayment from "../../models/WaterPayment.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { isPastDue } from "../../utils/waterPeriod.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader"])];

function toMoney(n) {
  return Number((Number(n || 0)).toFixed(2));
}

function computePenalty(amount, penaltyTypeUsed, penaltyValueUsed) {
  const base = Number(amount || 0);
  const type = penaltyTypeUsed || "flat";
  const val = Number(penaltyValueUsed || 0);

  let p = 0;
  if (type === "percent") p = base * (val / 100);
  else p = val;

  return toMoney(Math.max(0, p));
}

// Uses bill snapshot fields => prevents totals changing when settings change later
async function ensureOverdueAndPenalty(bill, now = new Date()) {
  if (!bill) return bill;
  if (bill.status === "paid") return bill;

  const pastDue = isPastDue(bill.dueDate, now);
  if (!pastDue) return bill;

  if (bill.status === "unpaid") bill.status = "overdue";

  const penaltyShouldBe = computePenalty(bill.amount, bill.penaltyTypeUsed, bill.penaltyValueUsed);
  const totalShouldBe = toMoney(Number(bill.amount || 0) + penaltyShouldBe);

  // apply if missing or inconsistent
  if (
    Number(bill.penaltyApplied || 0) !== penaltyShouldBe ||
    Number(bill.totalDue || 0) !== totalShouldBe
  ) {
    bill.penaltyApplied = penaltyShouldBe;
    bill.totalDue = totalShouldBe;
    bill.penaltyComputedAt = new Date();
  }

  await bill.save();
  return bill;
}

// GET /api/water/bills?q=&status=&page=&limit=
router.get("/", ...guard, async (req, res) => {
  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim(); // unpaid|paid|overdue|""
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "12", 10)));
  const skip = (page - 1) * limit;

  const filter = {};
  if (status) filter.status = status;

  if (q) {
    filter.$or = [
      { pnNo: { $regex: q, $options: "i" } },
      { accountName: { $regex: q, $options: "i" } },
      { periodCovered: { $regex: q, $options: "i" } },
    ];
  }

  // mark unpaid as overdue when dueDate passed
  await WaterBill.updateMany(
    { status: "unpaid", dueDate: { $lte: new Date() } },
    { $set: { status: "overdue" } }
  );

  const [items, total] = await Promise.all([
    WaterBill.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    WaterBill.countDocuments(filter),
  ]);

  // ensure penalty applied for overdue/past-due items in this page
  const now = new Date();
  for (const b of items) {
    if (b.status !== "paid" && isPastDue(b.dueDate, now)) {
      await ensureOverdueAndPenalty(b, now);
    }
  }

  // re-fetch updated page so UI receives correct totals
  const refreshed = await WaterBill.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);

  res.json({ items: refreshed, total, page, limit });
});

// POST /api/water/bills/:id/pay
router.post("/:id/pay", ...guard, async (req, res) => {
  try {
    const { orNo, method } = req.body || {};
    if (!orNo || !String(orNo).trim()) return res.status(400).json({ message: "OR No is required." });
    if (!method) return res.status(400).json({ message: "Payment method is required." });

    const bill = await WaterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found." });
    if (bill.status === "paid") return res.status(400).json({ message: "Bill is already paid." });

    // Ensure overdue + penalty before paying
    await ensureOverdueAndPenalty(bill, new Date());

    const pay = await WaterPayment.create({
      billId: bill._id,
      pnNo: bill.pnNo,
      orNo: String(orNo).trim(),
      method: String(method).trim(),
      amountPaid: bill.totalDue,
      receivedBy: req.user?.employeeId || "",
      paidAt: new Date(),
    });

    bill.status = "paid";
    bill.paidAt = new Date();
    await bill.save();

    res.json({ ok: true, payment: pay, bill });
  } catch (e) {
    if (String(e?.code) === "11000") return res.status(409).json({ message: "OR No already exists." });
    res.status(500).json({ message: "Failed to pay bill." });
  }
});

export default router;
