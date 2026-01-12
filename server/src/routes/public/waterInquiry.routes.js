import express from "express";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/WaterBill.js";
import WaterPayment from "../../models/WaterPayment.js";

const router = express.Router();

/**
 * Simple in-memory rate limit per IP
 * - 10 requests per 5 minutes (adjust as you want)
 */
const RL_WINDOW_MS = 5 * 60 * 1000;
const RL_MAX = 10;
const hits = new Map(); // ip -> { count, resetAt }

function rateLimit(req, res, next) {
  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const now = Date.now();
  const rec = hits.get(ip);

  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return next();
  }

  rec.count += 1;

  if (rec.count > RL_MAX) {
    const retrySec = Math.ceil((rec.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retrySec));
    return res.status(429).json({ message: "Too many attempts. Please try again later." });
  }

  return next();
}

/**
 * Public inquiry
 * POST /api/public/water/inquiry
 * body: { pnNo, birthdate, onlyLast12? }
 */
router.post("/inquiry", rateLimit, async (req, res) => {
  try {
    const { pnNo, birthdate, onlyLast12 } = req.body || {};

    const pn = String(pnNo || "").trim();
    const bd = String(birthdate || "").trim(); // expect YYYY-MM-DD

    if (!pn || !bd) {
      return res.status(400).json({ message: "PN No and Birthdate are required." });
    }

    // match member by pnNo + birthdate (stored as string)
    const member = await WaterMember.findOne({
      pnNo: pn,
      "personal.birthdate": bd,
    }).select("pnNo accountName accountStatus classification meterNumber");

    // avoid leaking whether PN exists
    if (!member) {
      return res.status(401).json({ message: "Invalid PN No or Birthdate." });
    }

    const billsFilter = { pnNo: pn };

    // optional server-side last 12 months
    if (onlyLast12) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      billsFilter.createdAt = { $gte: cutoff };
    }

    const bills = await WaterBill.find(billsFilter)
      .sort({ createdAt: -1 })
      .select("_id periodCovered totalDue dueDate status createdAt paidAt");

    const billIds = bills.map((b) => b._id);

    const payments = billIds.length
      ? await WaterPayment.find({ billId: { $in: billIds } })
          .sort({ paidAt: -1 })
          .select("_id billId pnNo orNo method amountPaid paidAt receivedBy")
      : [];

    // attach payments per bill
    const payMap = new Map();
    for (const p of payments) {
      const key = String(p.billId);
      if (!payMap.has(key)) payMap.set(key, []);
      payMap.get(key).push(p);
    }

    const billsDecorated = bills.map((b) => {
      const obj = b.toObject();
      obj.payments = payMap.get(String(b._id)) || [];
      return obj;
    });

    return res.json({ member, bills: billsDecorated });
  } catch (e) {
    console.error("Public inquiry error:", e);
    return res.status(500).json({ message: "Inquiry failed." });
  }
});

export default router;
