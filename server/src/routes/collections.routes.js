// Per-day collection summary used by the Cashier, Water Bill Officer, and
// Loan Officer dashboards. A single source of truth so the three views never
// disagree on the day's total.
//
// GET /api/collections/today?date=YYYY-MM-DD&module=water|loan|all&mine=1
//   - date defaults to today (server local time)
//   - module=water shows only water; module=loan shows only loans; default is "all"
//   - mine=1 scopes to payments where receivedBy = the signed-in user (officers
//     usually want their own postings; cashier wants the whole house)

import express from "express";
import WaterPayment from "../models/WaterPayment.js";
import LoanPayment from "../models/LoanPayment.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const guard = [
  requireAuth,
  requireRole(["admin", "cashier", "water_bill_officer", "loan_officer"]),
];

function dayRange(dateStr) {
  // Inclusive of "dateStr 00:00" up to (but not including) the next day.
  const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

router.get("/today", ...guard, async (req, res) => {
  try {
    const range = dayRange(req.query.date);
    if (!range) return res.status(400).json({ message: "Invalid date." });
    const { start, end } = range;

    const moduleParam = String(req.query.module || "all").toLowerCase();
    const mine = String(req.query.mine || "") === "1";
    const actorId = req.user?.employeeId || req.user?.fullName || "";

    const baseMatch = { paidAt: { $gte: start, $lt: end } };
    if (mine && actorId) baseMatch.receivedBy = actorId;

    const wantWater = moduleParam === "all" || moduleParam === "water";
    const wantLoan = moduleParam === "all" || moduleParam === "loan";

    const [waterDocs, loanDocs] = await Promise.all([
      wantWater ? WaterPayment.find(baseMatch).select("orNo method amountPaid paidAt receivedBy pnNo meterNumber periodKey").lean() : Promise.resolve([]),
      wantLoan ? LoanPayment.find(baseMatch).select("orNo method amountPaid paidAt receivedBy loanId borrowerPnNo").lean() : Promise.resolve([]),
    ]);

    const sumBy = (docs, pred) => docs.filter(pred).reduce((s, d) => s + (Number(d.amountPaid) || 0), 0);
    const countBy = (docs, pred) => docs.filter(pred).length;
    const isOnline = (d) => d.method === "online";
    const isCash = (d) => !isOnline(d);

    const waterCash = sumBy(waterDocs, isCash);
    const waterOnline = sumBy(waterDocs, isOnline);
    const loanCash = sumBy(loanDocs, isCash);
    const loanOnline = sumBy(loanDocs, isOnline);

    const grand = waterCash + waterOnline + loanCash + loanOnline;
    const cashTotal = waterCash + loanCash;
    const onlineTotal = waterOnline + loanOnline;

    // Per-collector breakdown (handy for the bill officer view to see who posted what).
    const byCollector = {};
    const collect = (d, label) => {
      const key = d.receivedBy || "unspecified";
      if (!byCollector[key]) byCollector[key] = { receivedBy: key, water: 0, loan: 0, total: 0, count: 0 };
      byCollector[key][label] += Number(d.amountPaid) || 0;
      byCollector[key].total += Number(d.amountPaid) || 0;
      byCollector[key].count += 1;
    };
    for (const d of waterDocs) collect(d, "water");
    for (const d of loanDocs) collect(d, "loan");
    const collectors = Object.values(byCollector).sort((a, b) => b.total - a.total);

    res.json({
      date: start.toISOString().slice(0, 10),
      scope: { module: moduleParam, mine, actor: actorId },
      totals: {
        cash: cashTotal,
        online: onlineTotal,
        grand,
        water: { cash: waterCash, online: waterOnline, total: waterCash + waterOnline, count: waterDocs.length },
        loan: { cash: loanCash, online: loanOnline, total: loanCash + loanOnline, count: loanDocs.length },
      },
      counts: {
        water: { total: waterDocs.length, cash: countBy(waterDocs, isCash), online: countBy(waterDocs, isOnline) },
        loan: { total: loanDocs.length, cash: countBy(loanDocs, isCash), online: countBy(loanDocs, isOnline) },
      },
      collectors,
      // Newest first; capped sensibly for a daily view.
      waterPayments: waterDocs.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)).slice(0, 200),
      loanPayments: loanDocs.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)).slice(0, 200),
    });
  } catch (e) {
    console.error("collections/today error:", e);
    res.status(500).json({ message: "Failed to load collections." });
  }
});

export default router;
