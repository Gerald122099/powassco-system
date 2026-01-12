// server/routes/water/waterAnalytics.routes.js
import express from "express";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/WaterBill.js";
import WaterReading from "../../models/WaterReading.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { periodCoveredLabel } from "../../utils/waterPeriod.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader"])];

// GET /api/water/analytics?periodKey=YYYY-MM
router.get("/", ...guard, async (req, res) => {
  const periodKey = String(req.query.periodKey || "").trim();
  const periodCovered = periodKey ? periodCoveredLabel(periodKey) : null;

  const [members, activeMembers, disconnectedMembers] = await Promise.all([
    WaterMember.countDocuments({}),
    WaterMember.countDocuments({ accountStatus: "active" }),
    WaterMember.countDocuments({ accountStatus: "disconnected" }),
  ]);

  const billMatch = periodCovered ? { periodCovered } : {};
  const readingMatch = periodKey ? { periodKey } : null;

  const [unpaidBills, paidBills, overdueBills, unpaidAgg, paidAgg, overdueAgg] = await Promise.all([
    WaterBill.countDocuments({ ...billMatch, status: "unpaid" }),
    WaterBill.countDocuments({ ...billMatch, status: "paid" }),
    WaterBill.countDocuments({ ...billMatch, status: "overdue" }),

    WaterBill.aggregate([
      { $match: { ...billMatch, status: { $in: ["unpaid", "overdue"] } } },
      { $group: { _id: null, total: { $sum: "$totalDue" } } },
    ]),
    WaterBill.aggregate([
      { $match: { ...billMatch, status: "paid" } },
      { $group: { _id: null, total: { $sum: "$totalDue" } } },
    ]),
    WaterBill.aggregate([
      { $match: { ...billMatch, status: "overdue" } },
      { $group: { _id: null, total: { $sum: "$totalDue" } } },
    ]),
  ]);

  let readMeters = 0;
  let unreadMeters = 0;

  if (readingMatch) {
    readMeters = await WaterReading.countDocuments(readingMatch);
    unreadMeters = Math.max(0, members - readMeters);
  }

  res.json({
    periodKey: periodKey || null,

    members,
    activeMembers,
    disconnectedMembers,

    unpaidBills,
    paidBills,
    overdueBills,

    unpaidAmount: unpaidAgg?.[0]?.total || 0,
    collectedAmount: paidAgg?.[0]?.total || 0,
    overdueAmount: overdueAgg?.[0]?.total || 0,

    readMeters,
    unreadMeters,
  });
});

export default router;
