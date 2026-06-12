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
import WaterBill from "../models/WaterBill.js";
import WaterMember from "../models/WaterMember.js";
import CbuTransaction from "../models/CbuTransaction.js";
import LoanApplication from "../models/LoanApplication.js";
import SavingsTransaction from "../models/SavingsTransaction.js";
import Expense from "../models/Expense.js";
import { TreasuryTransaction } from "../models/Treasury.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const guard = [
  requireAuth,
  requireRole(["admin", "manager", "cashier", "water_bill_officer", "loan_officer"]),
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
      wantWater ? WaterPayment.find(baseMatch).select("orNo method amountPaid cbuExcess paidAt receivedBy pnNo meterNumber periodKey").lean() : Promise.resolve([]),
      wantLoan ? LoanPayment.find(baseMatch).select("orNo method amountPaid cbuExcess paidAt receivedBy loanId borrowerPnNo").lean() : Promise.resolve([]),
    ]);

    const sumBy = (docs, pred) => docs.filter(pred).reduce((s, d) => s + (Number(d.amountPaid) || 0), 0);
    const countBy = (docs, pred) => docs.filter(pred).length;
    const isOnline = (d) => d.method === "online";
    const isCash = (d) => !isOnline(d);

    // Bill portion only (the "amountPaid" the payment posted against
    // the bill / loan installment). For most receipts this matches
    // the totalDue exactly.
    const waterCashBill = sumBy(waterDocs, isCash);
    const waterOnlineBill = sumBy(waterDocs, isOnline);
    const loanCashBill = sumBy(loanDocs, isCash);
    const loanOnlineBill = sumBy(loanDocs, isOnline);

    // CBU portion (extra cash beyond the bill that the cashier
    // credited to the member's Capital Build-Up).
    const sumCbuBy = (docs, pred) => docs.filter(pred).reduce((s, d) => s + (Number(d.cbuExcess) || 0), 0);
    const waterCbuCash = sumCbuBy(waterDocs, isCash);
    const waterCbuOnline = sumCbuBy(waterDocs, isOnline);
    const loanCbuCash = sumCbuBy(loanDocs, isCash);
    const loanCbuOnline = sumCbuBy(loanDocs, isOnline);

    // True cash drawer = bill cash + CBU cash. This is what the
    // cashier physically holds at end of shift.
    const waterCashGross = waterCashBill + waterCbuCash;
    const waterOnlineGross = waterOnlineBill + waterCbuOnline;
    const loanCashGross = loanCashBill + loanCbuCash;
    const loanOnlineGross = loanOnlineBill + loanCbuOnline;

    const waterBillCollected = waterCashBill + waterOnlineBill;
    const loanBillCollected = loanCashBill + loanOnlineBill;
    const waterCbu = waterCbuCash + waterCbuOnline;
    const loanCbu = loanCbuCash + loanCbuOnline;

    const cashTotal = waterCashGross + loanCashGross;
    const onlineTotal = waterOnlineGross + loanOnlineGross;
    // Today's CBU movements straight from the ledger — this is the
    // SAME data the bookkeeper sees. Covers credits the cashier made
    // (water_overpay / loan_overpay) AND credits/debits the bookkeeper
    // typed in (manual_adjust, product_loan_charge, withdrawal). When
    // cashier-only metrics are needed, .water.cbu / .loan.cbu below
    // still split by module.
    const ledgerToday = await CbuTransaction.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { type: "$type", source: "$source" }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    let cbuTodayCredits = 0;
    let cbuTodayDebits = 0;
    const cbuTodayBySource = {};
    for (const row of ledgerToday) {
      const amt = Number(row.total || 0);
      if (row._id.type === "credit") cbuTodayCredits += amt;
      else if (row._id.type === "debit") cbuTodayDebits += amt;
      cbuTodayBySource[row._id.source || "unknown"] = (cbuTodayBySource[row._id.source || "unknown"] || 0) + (row._id.type === "credit" ? amt : -amt);
    }
    // Net CBU added today — this is what the cashier display matches
    // against the bookkeeper. Falls back to the payment-based sum if
    // the ledger is empty (legacy data before CbuTransaction existed).
    const cbuTotal = cbuTodayCredits > 0 || cbuTodayDebits > 0
      ? Number((cbuTodayCredits - cbuTodayDebits).toFixed(2))
      : Number((waterCbu + loanCbu).toFixed(2));
    const billCollectedTotal = waterBillCollected + loanBillCollected;
    const grand = cashTotal + onlineTotal;

    // Savings cash movements today. INT-/ADJ- references are excluded —
    // interest accrual and dual-control adjustments move balances, not
    // physical cash in the drawer. Bundled deposits (OR suffixed -SAV)
    // ARE included: their cash arrived at the counter but is not part
    // of waterCash/loanCash (those only count the bill + CBU portions).
    const savingsToday = await SavingsTransaction.aggregate([
      { $match: {
          paidAt: { $gte: start, $lt: end },
          orNo: { $not: /^(INT|ADJ)-/ },
        } },
      { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    let savingsIn = 0, savingsInCount = 0, savingsOut = 0, savingsOutCount = 0;
    for (const row of savingsToday) {
      if (row._id === "deposit") { savingsIn = Number(row.total || 0); savingsInCount = row.count; }
      else if (row._id === "withdrawal") { savingsOut = Number(row.total || 0); savingsOutCount = row.count; }
    }

    // Expense disbursements paid out by the cashier today (approved
    // requests they handed cash for). Deducts from the drawer.
    const disbursedAgg = await Expense.aggregate([
      { $match: { status: "disbursed", disbursedAt: { $gte: start, $lt: end } } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const disbursedTotal = Number(disbursedAgg[0]?.total || 0);
    const disbursedCount = Number(disbursedAgg[0]?.count || 0);

    // Net physical drawer position for the day: collections in (cash
    // only) + savings deposits − savings withdrawals − cash handed out
    // for disbursements.
    // Approved treasury moves that touch the physical drawer today
    // (vault_to_drawer adds cash, drawer_to_vault removes it).
    const drawerMoves = await TreasuryTransaction.aggregate([
      { $match: { target: "drawer", createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);
    let drawerTreasuryIn = 0, drawerTreasuryOut = 0;
    for (const row of drawerMoves) {
      if (row._id === "in") drawerTreasuryIn = Number(row.total || 0);
      else if (row._id === "out") drawerTreasuryOut = Number(row.total || 0);
    }
    const drawerNet = Number((cashTotal + savingsIn - savingsOut - disbursedTotal + drawerTreasuryIn - drawerTreasuryOut).toFixed(2));

    // System-wide outstanding (unsettled receivables) + total CBU
    // held across every active member account. All three are cheap
    // single-pass aggregates over indexed fields.
    const [waterOutstandingAgg, loanOutstandingAgg, cbuOnFileAgg] = await Promise.all([
      wantWater
        ? WaterBill.aggregate([
            { $match: { status: { $in: ["unpaid", "overdue"] } } },
            { $group: { _id: null, total: { $sum: "$totalDue" }, count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
      wantLoan
        ? LoanApplication.aggregate([
            { $match: { status: { $in: ["active", "approved", "released", "overdue"] } } },
            { $group: { _id: null, total: { $sum: "$balance" }, count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
      // Total CBU held across EVERY member with a non-zero balance —
      // intentionally NO accountStatus filter so we match the
      // bookkeeper's /members-cbu view. Inactive accounts can still
      // hold CBU until it's refunded or applied.
      WaterMember.aggregate([
        { $match: { cbuBalance: { $ne: 0 } } },
        { $group: { _id: null, total: { $sum: "$cbuBalance" }, count: { $sum: 1 } } },
      ]),
    ]);
    const waterOutstanding = Number(waterOutstandingAgg[0]?.total || 0);
    const waterOutstandingCount = Number(waterOutstandingAgg[0]?.count || 0);
    const loanOutstanding = Number(loanOutstandingAgg[0]?.total || 0);
    const loanOutstandingCount = Number(loanOutstandingAgg[0]?.count || 0);
    const cbuOnFile = Number(cbuOnFileAgg[0]?.total || 0);
    const cbuOnFileMembers = Number(cbuOnFileAgg[0]?.count || 0);

    // CBU ledger reconciliation. Sums credits and debits across the
    // entire CbuTransaction history; (credits - debits) should equal
    // the snapshot above to the centavo. If it doesn't, something
    // wrote to member.cbuBalance without a corresponding ledger entry
    // (or vice versa) — the dashboard surfaces the drift so the
    // bookkeeper can investigate.
    const ledgerAgg = await CbuTransaction.aggregate([
      { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    let ledgerCredits = 0;
    let ledgerDebits = 0;
    let ledgerCreditCount = 0;
    let ledgerDebitCount = 0;
    for (const row of ledgerAgg) {
      if (row._id === "credit") {
        ledgerCredits = Number(row.total || 0);
        ledgerCreditCount = Number(row.count || 0);
      } else if (row._id === "debit") {
        ledgerDebits = Number(row.total || 0);
        ledgerDebitCount = Number(row.count || 0);
      }
    }
    const ledgerNet = Number((ledgerCredits - ledgerDebits).toFixed(2));
    const cbuDrift = Number((cbuOnFile - ledgerNet).toFixed(2));

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
        // Aggregates across BOTH modules
        cash: cashTotal,            // drawer total (bill cash + CBU cash)
        online: onlineTotal,        // online total (bill online + CBU online)
        cbu: cbuTotal,              // CBU portion (cash + online)
        billCollected: billCollectedTotal, // bill portion (cash + online)
        grand,                      // cash + online (== bill + cbu)
        savings: { in: savingsIn, inCount: savingsInCount, out: savingsOut, outCount: savingsOutCount },
        disbursed: { total: disbursedTotal, count: disbursedCount },
        drawerNet,                  // cash + savings in − savings out − disbursed ± vault moves
        drawerTreasury: { in: drawerTreasuryIn, out: drawerTreasuryOut },
        water: {
          // backward-compatible aliases
          cash: waterCashGross,     // total cash drawer water
          online: waterOnlineGross, // total online water
          // explicit splits
          cashBill: waterCashBill,
          cashCbu: waterCbuCash,
          onlineBill: waterOnlineBill,
          onlineCbu: waterCbuOnline,
          billCollected: waterBillCollected,
          cbu: waterCbu,
          total: waterCashGross + waterOnlineGross,
          count: waterDocs.length,
        },
        loan: {
          cash: loanCashGross,
          online: loanOnlineGross,
          cashBill: loanCashBill,
          cashCbu: loanCbuCash,
          onlineBill: loanOnlineBill,
          onlineCbu: loanCbuOnline,
          billCollected: loanBillCollected,
          cbu: loanCbu,
          total: loanCashGross + loanOnlineGross,
          count: loanDocs.length,
        },
      },
      outstanding: {
        water: { total: waterOutstanding, count: waterOutstandingCount },
        loan: { total: loanOutstanding, count: loanOutstandingCount },
        grand: waterOutstanding + loanOutstanding,
      },
      cbuOnFile: {
        total: cbuOnFile,
        members: cbuOnFileMembers,
        // Ledger view — every CBU movement ever recorded. The net
        // (credits − debits) should equal `total` above; `drift` is
        // the gap, expected to be 0.
        ledger: {
          credits: ledgerCredits,
          creditCount: ledgerCreditCount,
          debits: ledgerDebits,
          debitCount: ledgerDebitCount,
          net: ledgerNet,
        },
        drift: cbuDrift,
      },
      // Today's CBU activity straight from the CbuTransaction ledger —
      // matches what the bookkeeper sees on the same date.
      cbuToday: {
        credits: Number(cbuTodayCredits.toFixed(2)),
        debits: Number(cbuTodayDebits.toFixed(2)),
        net: Number((cbuTodayCredits - cbuTodayDebits).toFixed(2)),
        bySource: cbuTodayBySource,
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
