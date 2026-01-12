// server/routes/water/waterReadings.routes.js
import express from "express";
import WaterReading from "../../models/WaterReading.js";
import WaterMember from "../../models/WaterMember.js";
import WaterSettings from "../../models/WaterSettings.js";
import WaterBill from "../../models/WaterBill.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { computeDueDate, isPastDue, periodCoveredLabel } from "../../utils/waterPeriod.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "meter_reader", "water_bill_officer"])];

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

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

// GET /api/water/readings?periodKey=YYYY-MM&q=&readStatus=all|read|unread&page=&limit=
router.get("/", ...guard, async (req, res) => {
  const periodKey = String(req.query.periodKey || "").trim();
  if (!periodKey) return res.status(400).json({ message: "periodKey is required (YYYY-MM)." });

  const q = String(req.query.q || "").trim();
  const readStatus = String(req.query.readStatus || "all").trim(); // all|read|unread

  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "12", 10)));
  const skip = (page - 1) * limit;

  const memberFilter = {};
  if (q) {
    memberFilter.$or = [
      { pnNo: { $regex: q, $options: "i" } },
      { accountName: { $regex: q, $options: "i" } },
    ];
  }

  const [members, totalMembers] = await Promise.all([
    WaterMember.find(memberFilter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    WaterMember.countDocuments(memberFilter),
  ]);

  const pnNos = members.map((m) => m.pnNo);
  const readings = await WaterReading.find({ periodKey, pnNo: { $in: pnNos } });
  const rMap = new Map(readings.map((r) => [r.pnNo, r]));

  const lastReadingAgg = await WaterReading.aggregate([
    { $match: { pnNo: { $in: pnNos } } },
    { $sort: { readAt: -1 } },
    { $group: { _id: "$pnNo", doc: { $first: "$$ROOT" } } },
  ]);
  const lastMap = new Map(lastReadingAgg.map((x) => [x._id, x.doc]));

  let items = members.map((m) => {
    const cur = rMap.get(m.pnNo) || null;
    const last = lastMap.get(m.pnNo) || null;

    return {
      pnNo: m.pnNo,
      accountName: m.accountName,
      meterNumber: m.meterNumber,
      accountStatus: m.accountStatus,
      classification: m.classification,
      addressText: [
        m.address?.houseLotNo,
        m.address?.streetSitioPurok,
        m.address?.barangay,
        m.address?.municipalityCity,
        m.address?.province,
      ].filter(Boolean).join(", "),
      hasReading: !!cur,
      reading: cur,
      suggestedPreviousReading: cur?.previousReading ?? last?.presentReading ?? 0,
    };
  });

  if (readStatus === "read") items = items.filter((x) => x.hasReading);
  if (readStatus === "unread") items = items.filter((x) => !x.hasReading);

  res.json({ items, total: totalMembers, page, limit, periodKey });
});

// POST /api/water/readings (creates/updates reading and auto-generates bill)
router.post("/", ...guard, async (req, res) => {
  try {
    const { periodKey, pnNo, presentReading } = req.body || {};
    if (!periodKey || !pnNo) return res.status(400).json({ message: "periodKey and pnNo are required." });

    const pres = Number(presentReading);
    if (Number.isNaN(pres) || pres < 0) return res.status(400).json({ message: "Invalid presentReading." });

    const member = await WaterMember.findOne({ pnNo: String(pnNo).trim() });
    if (!member) return res.status(404).json({ message: "Member not found." });

    let settings = await WaterSettings.findOne();
    if (!settings) {
      settings = await WaterSettings.create({
        ratePerCubic: 0,
        penaltyType: "flat",
        penaltyValue: 0,
        dueDayOfMonth: 15,
        graceDays: 0,
        readingStartDayOfMonth: 1,
        readingWindowDays: 7,
      });
    }

    // Determine previous reading
    const existing = await WaterReading.findOne({ periodKey, pnNo: member.pnNo });
    let prev = existing?.previousReading;

    if (prev === undefined || prev === null) {
      const last = await WaterReading.findOne({ pnNo: member.pnNo }).sort({ readAt: -1 });
      prev = Number(last?.presentReading ?? 0);
    }

    if (pres < prev) return res.status(400).json({ message: "Present reading must be >= previous reading." });

    const consumed = pres - prev;

    // ✅ Snapshot settings used (prevents inconsistency later)
    const rateUsed = toMoney(settings.ratePerCubic || 0);

    const dueDayUsed = clamp(settings.dueDayOfMonth ?? 15, 1, 31);
    const graceDaysUsed = clamp(settings.graceDays ?? 0, 0, 60);

    const penaltyTypeUsed = settings.penaltyType || "flat";
    const penaltyValueUsed = toMoney(settings.penaltyValue || 0);

    const amount = toMoney(consumed * rateUsed);

    const dueDate = computeDueDate(periodKey, dueDayUsed, graceDaysUsed);
    const overdueNow = isPastDue(dueDate);

    let penaltyApplied = 0;
    if (overdueNow) {
      penaltyApplied = computePenalty(amount, penaltyTypeUsed, penaltyValueUsed);
    }

    const totalDue = toMoney(amount + penaltyApplied);

    // upsert reading
    const reading = await WaterReading.findOneAndUpdate(
      { periodKey, pnNo: member.pnNo },
      {
        $set: {
          previousReading: prev,
          presentReading: pres,
          consumed,
          readAt: new Date(),
          readBy: req.user?.employeeId || "",
        },
      },
      { new: true, upsert: true }
    );

    // auto-generate/update bill for this period
    const addressText = [
      member.address?.houseLotNo,
      member.address?.streetSitioPurok,
      member.address?.barangay,
      member.address?.municipalityCity,
      member.address?.province,
    ].filter(Boolean).join(", ");

    const periodCovered = periodCoveredLabel(periodKey);

    const bill = await WaterBill.findOneAndUpdate(
      { pnNo: member.pnNo, periodCovered },
      {
        $setOnInsert: {
          createdBy: req.user?.employeeId || "",
        },
        $set: {
          pnNo: member.pnNo,
          accountName: member.accountName,
          addressText,
          classification: member.classification,

          periodCovered,
          periodKey,

          previousReading: prev,
          presentReading: pres,
          consumed,

          rateUsed,
          amount,

          penaltyApplied,
          totalDue,

          dueDate,

          // snapshot fields
          dueDayUsed,
          graceDaysUsed,
          penaltyTypeUsed,
          penaltyValueUsed,
          penaltyComputedAt: overdueNow ? new Date() : undefined,

          // IMPORTANT: don't override "paid"
          ...(existing?.status === "paid"
            ? {}
            : { status: overdueNow ? "overdue" : "unpaid" }),
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      ok: true,
      reading,
      bill,
      receipt: {
        pnNo: member.pnNo,
        accountName: member.accountName,
        periodCovered,
        previousReading: prev,
        presentReading: pres,
        consumed,
        rateUsed,
        amount,
        penaltyApplied,
        totalDue,
        dueDate,
        status: bill.status,
        readAt: reading.readAt,
        readBy: reading.readBy,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to save reading." });
  }
});

export default router;
