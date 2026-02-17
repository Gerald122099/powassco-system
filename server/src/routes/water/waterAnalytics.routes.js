// server/routes/water/waterAnalytics.routes.js (FIXED)
import express from "express";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/waterbill.js";
import WaterReading from "../../models/WaterReading.js";
import WaterPayment from "../../models/WaterPayment.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader"])];

function toPeriodKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function isValidPeriodKey(pk) {
  // YYYY-MM basic validation + month 01-12
  if (!/^\d{4}-\d{2}$/.test(pk)) return false;
  const [, m] = pk.split("-").map(Number);
  return m >= 1 && m <= 12;
}

function periodRangeLast12() {
  const end = new Date();
  end.setDate(1); // first day of current month
  const start = new Date(end);
  start.setMonth(start.getMonth() - 11);

  const keys = [];
  const cursor = new Date(start);
  for (let i = 0; i < 12; i++) {
    keys.push(toPeriodKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function periodRangeYear(yearNum) {
  const keys = [];
  for (let m = 1; m <= 12; m++) {
    keys.push(`${yearNum}-${String(m).padStart(2, "0")}`);
  }
  return keys;
}

// Convert periodKeys -> [startDateInclusive, endDateExclusive]
function periodKeysToDateRange(periodKeys) {
  if (!periodKeys || periodKeys.length === 0) {
    const now = new Date();
    return [
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 1),
    ];
  }

  const first = periodKeys[0];
  const last = periodKeys[periodKeys.length - 1];

  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);

  const start = new Date(fy, fm - 1, 1);
  const end = new Date(ly, lm, 1); // next month start
  return [start, end];
}

function safeNum(n) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x : 0;
}

function normalizeMembersByClassification(mapLike) {
  // Always return these keys for consistent UI
  const base = {
    residential: 0,
    commercial: 0,
    institutional: 0,
    government: 0,
    unknown: 0,
  };
  for (const [k, v] of Object.entries(mapLike || {})) {
    base[k || "unknown"] = safeNum(v);
  }
  return base;
}

/**
 * GET /api/water/analytics
 * Supports:
 *  - ?mode=last12
 *  - ?mode=month&periodKey=YYYY-MM
 *  - ?mode=year&year=YYYY
 *
 * Also accepts legacy:
 *  - ?periodKey=YYYY-MM
 *  - ?year=YYYY
 */
router.get("/", ...guard, async (req, res) => {
  try {
    const modeParam = String(req.query.mode || "").trim(); // last12|month|year
    const periodKeyParam = String(req.query.periodKey || "").trim();
    const yearParam = String(req.query.year || "").trim();

    let mode = "last12";
    let periodKeys = periodRangeLast12();

    // Prefer explicit mode when provided
    if (modeParam === "month") {
      if (!periodKeyParam || !isValidPeriodKey(periodKeyParam)) {
        return res.status(400).json({ message: "Invalid or missing periodKey (YYYY-MM)." });
      }
      mode = "month";
      periodKeys = [periodKeyParam];
    } else if (modeParam === "year") {
      const y = Number(yearParam);
      if (!Number.isFinite(y) || y < 1900 || y > 2500) {
        return res.status(400).json({ message: "Invalid year." });
      }
      mode = "year";
      periodKeys = periodRangeYear(y);
    } else if (modeParam === "last12" || modeParam === "") {
      mode = "last12";
      periodKeys = periodRangeLast12();
    } else {
      // Legacy support: if mode is unknown, fallback to old behavior using periodKey/year
      if (periodKeyParam) {
        if (!isValidPeriodKey(periodKeyParam)) {
          return res.status(400).json({ message: "Invalid periodKey format (YYYY-MM)." });
        }
        mode = "month";
        periodKeys = [periodKeyParam];
      } else if (yearParam) {
        const y = Number(yearParam);
        if (!Number.isFinite(y) || y < 1900 || y > 2500) {
          return res.status(400).json({ message: "Invalid year." });
        }
        mode = "year";
        periodKeys = periodRangeYear(y);
      }
    }

    const [rangeStart, rangeEnd] = periodKeysToDateRange(periodKeys);

    // =========================
    // 1) MEMBERS
    // =========================
    const [members, activeMembers, disconnectedMembers, seniors] = await Promise.all([
      WaterMember.countDocuments({}),
      WaterMember.countDocuments({ accountStatus: "active" }),
      WaterMember.countDocuments({ accountStatus: "disconnected" }),
      WaterMember.countDocuments({ "personal.isSeniorCitizen": true }),
    ]);

    const membersByClassAgg = await WaterMember.aggregate([
      { $group: { _id: "$billing.classification", count: { $sum: 1 } } },
    ]);

    const membersByClassificationRaw = membersByClassAgg.reduce((acc, r) => {
      acc[r._id || "unknown"] = r.count;
      return acc;
    }, {});
    const membersByClassification = normalizeMembersByClassification(membersByClassificationRaw);

    const disconnectedWithinRange = await WaterMember.countDocuments({
      accountStatus: "disconnected",
      $or: [
        { disconnectionDate: { $gte: rangeStart, $lt: rangeEnd } },
        { statusDate: { $gte: rangeStart, $lt: rangeEnd } },
      ],
    });

    // =========================
    // 2) METERS (embedded in WaterMember)
    // =========================
    const meterStatsAgg = await WaterMember.aggregate([
      { $unwind: { path: "$meters", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: null,
          totalMeters: { $sum: 1 },
          activeMeters: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$meters.meterStatus", "active"] },
                    { $eq: ["$meters.isBillingActive", true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          inactiveMeters: {
            $sum: {
              $cond: [{ $ne: ["$meters.meterStatus", "active"] }, 1, 0],
            },
          },
        },
      },
    ]);

    const meterStats = meterStatsAgg?.[0] || { totalMeters: 0, activeMeters: 0, inactiveMeters: 0 };

    const newMetersInstalledAgg = await WaterMember.aggregate([
      { $unwind: { path: "$meters", preserveNullAndEmptyArrays: false } },
      {
        $match: {
          "meters.installationDate": { $gte: rangeStart, $lt: rangeEnd },
        },
      },
      { $count: "count" },
    ]);
    const newMetersInstalled = newMetersInstalledAgg?.[0]?.count || 0;

    const totalActiveMeters = meterStats.activeMeters || 0;

    // =========================
    // 3) BILLS (by periodKey list)
    // =========================
    const billMatch = { periodKey: { $in: periodKeys } };

    const [statusCounts, totalsAgg, unpaidAmountAgg] = await Promise.all([
      WaterBill.aggregate([
        { $match: billMatch },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      WaterBill.aggregate([
        { $match: billMatch },
        {
          $group: {
            _id: null,
            billedAmount: { $sum: "$totalDue" },
            totalDiscounts: { $sum: "$discount" },
            totalConsumption: { $sum: "$consumed" },
          },
        },
      ]),
      WaterBill.aggregate([
        { $match: { ...billMatch, status: { $in: ["unpaid", "overdue"] } } },
        { $group: { _id: null, total: { $sum: "$totalDue" } } },
      ]),
    ]);

    const billCounts = statusCounts.reduce(
      (acc, r) => {
        acc[r._id] = r.count;
        return acc;
      },
      { unpaid: 0, paid: 0, overdue: 0 }
    );

    const billTotals = totalsAgg?.[0] || {
      billedAmount: 0,
      totalDiscounts: 0,
      totalConsumption: 0,
    };

    // Collected amount = payments linked to bills in those periods
    const paymentsAgg = await WaterPayment.aggregate([
      {
        $lookup: {
          from: "waterbills",
          localField: "billId",
          foreignField: "_id",
          as: "bill",
        },
      },
      { $unwind: "$bill" },
      { $match: { "bill.periodKey": { $in: periodKeys } } },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]);

    // Partial bills = has payments but not fully paid, status unpaid/overdue
    const partialAgg = await WaterBill.aggregate([
      { $match: { ...billMatch, status: { $in: ["unpaid", "overdue"] } } },
      {
        $lookup: {
          from: "waterpayments",
          localField: "_id",
          foreignField: "billId",
          as: "pays",
        },
      },
      { $addFields: { paidSoFar: { $sum: "$pays.amountPaid" } } },
      {
        $match: {
          paidSoFar: { $gt: 0 },
          $expr: { $lt: ["$paidSoFar", "$totalDue"] },
        },
      },
      { $count: "partialBills" },
    ]);
    const partialBills = partialAgg?.[0]?.partialBills || 0;

    // =========================
    // 4) READINGS
    // =========================
    // Distinct meters read across selected periods (overall)
    const readMetersAgg = await WaterReading.aggregate([
      { $match: { periodKey: { $in: periodKeys } } },
      { $group: { _id: "$meterNumber" } },
      { $count: "readMeters" },
    ]);
    const readMeters = readMetersAgg?.[0]?.readMeters || 0;
    const unreadMeters = Math.max(0, totalActiveMeters - readMeters);

    // Monthly reading series (distinct per periodKey)
    const readSeriesAgg = await WaterReading.aggregate([
      { $match: { periodKey: { $in: periodKeys } } },
      { $group: { _id: { periodKey: "$periodKey", meterNumber: "$meterNumber" } } },
      { $group: { _id: "$_id.periodKey", readMeters: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    
    // FIXED: Create map properly
    const readSeriesMap = new Map();
    readSeriesAgg.forEach((r) => {
      readSeriesMap.set(r._id, r.readMeters);
    });

    // =========================
    // 5) SERIES (Bills + Payments)
    // =========================
    const billSeriesAgg = await WaterBill.aggregate([
      { $match: billMatch },
      {
        $group: {
          _id: "$periodKey",
          billedAmount: { $sum: "$totalDue" },
          discounts: { $sum: "$discount" },
          consumption: { $sum: "$consumed" },
          unpaidAmount: {
            $sum: {
              $cond: [{ $in: ["$status", ["unpaid", "overdue"]] }, "$totalDue", 0],
            },
          },
          paidBills: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
          unpaidBills: { $sum: { $cond: [{ $eq: ["$status", "unpaid"] }, 1, 0] } },
          overdueBills: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    
    // FIXED: Create map properly
    const billSeriesMap = new Map();
    billSeriesAgg.forEach((r) => {
      billSeriesMap.set(r._id, r);
    });

    const collectedSeriesAgg = await WaterPayment.aggregate([
      {
        $lookup: {
          from: "waterbills",
          localField: "billId",
          foreignField: "_id",
          as: "bill",
        },
      },
      { $unwind: "$bill" },
      { $match: { "bill.periodKey": { $in: periodKeys } } },
      { $group: { _id: "$bill.periodKey", collectedAmount: { $sum: "$amountPaid" } } },
      { $sort: { _id: 1 } },
    ]);
    
    // FIXED: Create map properly
    const collectedMap = new Map();
    collectedSeriesAgg.forEach((r) => {
      collectedMap.set(r._id, r.collectedAmount);
    });

    // ✅ Guarantee a row per periodKey (fill missing months with zeros)
    const series = periodKeys.map((k) => {
      const b = billSeriesMap.get(k);
      // FIXED: Use the map directly with get method
      const readM = readSeriesMap.get(k) || 0;
      const unreadM = Math.max(0, totalActiveMeters - readM);
      const collected = collectedMap.get(k) || 0;

      return {
        periodKey: k,
        billedAmount: safeNum(b?.billedAmount),
        collectedAmount: safeNum(collected),
        unpaidAmount: safeNum(b?.unpaidAmount),
        discounts: safeNum(b?.discounts),
        consumption: safeNum(b?.consumption),
        paidBills: safeNum(b?.paidBills),
        unpaidBills: safeNum(b?.unpaidBills),
        overdueBills: safeNum(b?.overdueBills),
        readMeters: readM,
        unreadMeters: unreadM,
      };
    });

    return res.json({
      mode,
      periodKey: periodKeyParam || null,
      year: yearParam || null,
      periodKeys,
      range: { start: rangeStart, end: rangeEnd },

      // members
      members,
      activeMembers,
      disconnectedMembers,
      disconnectedWithinRange,
      seniors,
      membersByClassification,

      // meters
      meterStats,
      totalMeters: safeNum(meterStats.totalMeters),
      totalActiveMeters: safeNum(totalActiveMeters),
      newMetersInstalled,

      // bills
      bills: {
        unpaidBills: safeNum(billCounts.unpaid),
        paidBills: safeNum(billCounts.paid),
        overdueBills: safeNum(billCounts.overdue),
        partialBills,

        billedAmount: safeNum(billTotals.billedAmount),
        unpaidAmount: safeNum(unpaidAmountAgg?.[0]?.total),
        collectedAmount: safeNum(paymentsAgg?.[0]?.total),

        totalDiscounts: safeNum(billTotals.totalDiscounts),
        totalConsumption: safeNum(billTotals.totalConsumption),
      },

      // readings
      readMeters: safeNum(readMeters),
      unreadMeters: safeNum(unreadMeters),

      // series for charts + pdf table
      series,
    });
  } catch (e) {
    console.error("analytics error:", e);
    return res.status(500).json({ 
      message: "Failed to load analytics",
      error: process.env.NODE_ENV === "development" ? e.message : undefined 
    });
  }
});

export default router;