// Overall Audit Report — one endpoint that aggregates every money
// figure for a date range, plus product inventory, for the audit
// committee. A second set of endpoints lets the committee SIGN a
// period (freezing the figures) and list/view signed reports.
//
// Read + sign only — nothing here mutates operational data.

import express from "express";
import WaterPayment from "../models/WaterPayment.js";
import LoanPayment from "../models/LoanPayment.js";
import LoanApplication from "../models/LoanApplication.js";
import WaterMember from "../models/WaterMember.js";
import SavingsTransaction from "../models/SavingsTransaction.js";
import SavingsAccount from "../models/SavingsAccount.js";
import Expense from "../models/Expense.js";
import Payroll from "../models/Payroll.js";
import MemberFeeRequest from "../models/MemberFeeRequest.js";
import { ProductLoanCatalog, ProductLoanApplication } from "../models/ProductLoan.js";
import { Bank, BankAccount, CashVault, TreasuryTransaction } from "../models/Treasury.js";
import AuditReport from "../models/AuditReport.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "audit_committee"])];
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function parseRange(q) {
  const from = q.from ? new Date(String(q.from) + "T00:00:00") : null;
  const to = q.to ? new Date(String(q.to) + "T23:59:59.999") : null;
  const range = {};
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) range.$lte = to;
  return { range, hasRange: Object.keys(range).length > 0, from, to };
}

// Builds the full audit summary for a range. Reused by both the live
// GET and the sign endpoint (so a signed snapshot == what was shown).
async function buildSummary(q) {
  const { range, hasRange } = parseRange(q);
  const payMatch = hasRange ? { paidAt: range } : {};

  const [waterPays, loanPays, savingsAgg, expenseAgg, loanAgg, outstandingAgg,
         catalog, prodAgg, banks, vault, treasuryAgg, cbuAgg, savingsBalAgg] = await Promise.all([
    WaterPayment.find(payMatch).select("method amountPaid cbuExcess").lean(),
    LoanPayment.find(payMatch).select("method amountPaid cbuExcess").lean(),
    SavingsTransaction.aggregate([
      { $match: { ...(hasRange ? { paidAt: range } : {}), orNo: { $not: /^(INT|ADJ)-/ } } },
      { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: { status: "disbursed", ...(hasRange ? { disbursedAt: range } : {}) } },
      { $group: { _id: "$paymentMethod", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    // Loans released in range
    LoanApplication.aggregate([
      { $match: { status: { $in: ["released", "closed"] }, ...(hasRange ? { releasedAt: range } : {}) } },
      { $group: { _id: null, count: { $sum: 1 }, capital: { $sum: "$principal" },
        interest: { $sum: "$totalInterest" }, deductions: { $sum: "$totalCharges" },
        payable: { $sum: "$totalPayment" }, paid: { $sum: "$totalPaid" }, unpaid: { $sum: "$balance" } } },
    ]),
    // Outstanding NOW (range-independent)
    LoanApplication.aggregate([
      { $match: { status: "released", balance: { $gt: 0 } } },
      { $group: { _id: null, count: { $sum: 1 }, balance: { $sum: "$balance" } } },
    ]),
    ProductLoanCatalog.find({}).select("name category unitPrice capital profit stock isActive").lean(),
    // Product transactions in range
    ProductLoanApplication.aggregate([
      { $match: { status: { $nin: ["cancelled", "rejected"] }, ...(hasRange ? { createdAt: range } : {}) } },
      { $group: { _id: "$transactionType", count: { $sum: 1 }, revenue: { $sum: "$totalPrice" },
        capital: { $sum: "$totalCapital" }, profit: { $sum: "$profitRecorded" },
        paid: { $sum: "$totalPaid" }, unpaid: { $sum: "$balance" } } },
    ]),
    Bank.find({}).select("name").lean(),
    CashVault.findOne().lean(),
    TreasuryTransaction.aggregate([
      { $match: hasRange ? { createdAt: range } : {} },
      { $group: { _id: { target: "$target", type: "$type" }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    WaterMember.aggregate([
      { $match: { cbuBalance: { $ne: 0 } } },
      { $group: { _id: null, total: { $sum: "$cbuBalance" }, members: { $sum: 1 } } },
    ]),
    SavingsAccount.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: null, total: { $sum: "$balance" }, accounts: { $sum: 1 } } },
    ]),
  ]);

  const bankAccounts = await BankAccount.find({ status: "active" })
    .select("bankName accountNumber balance").lean();

  // ── Disbursements breakdown (period) — everything paid OUT ──
  const [payrollAgg, expenseByCat, loanPayout, memberFeeAgg] = await Promise.all([
    Payroll.aggregate([
      { $match: { status: "disbursed", ...(hasRange ? { disbursedAt: range } : {}) } },
      { $group: { _id: "$type", count: { $sum: 1 }, total: { $sum: "$netPay" } } },
    ]),
    Expense.aggregate([
      { $match: { status: "disbursed", ...(hasRange ? { disbursedAt: range } : {}) } },
      { $group: { _id: "$category", count: { $sum: 1 }, total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
    ]),
    LoanApplication.aggregate([
      { $match: { status: { $in: ["released", "closed"] }, ...(hasRange ? { disbursedAt: range } : {}) } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$netProceeds" } } },
    ]),
    MemberFeeRequest.aggregate([
      { $match: { status: "paid", ...(hasRange ? { paidAt: range } : {}) } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" },
        membership: { $sum: "$membershipFee" }, tapping: { $sum: "$tappingFee" } } },
    ]),
  ]);
  const payroll = { payslips: { count: 0, total: 0 }, advances: { count: 0, total: 0 }, total: 0 };
  for (const r of payrollAgg) {
    const bucket = r._id === "cash_advance" ? payroll.advances : payroll.payslips;
    bucket.count = r.count; bucket.total = round2(r.total);
    payroll.total = round2(payroll.total + r.total);
  }
  const expenseBreakdown = expenseByCat.map((r) => ({ category: r._id || "Uncategorized", count: r.count, total: round2(r.total) }));
  const mf = memberFeeAgg[0] || {};

  const cashOf = (docs) => round2(docs.filter((d) => d.method !== "online")
    .reduce((s, d) => s + (Number(d.amountPaid) || 0) + (Number(d.cbuExcess) || 0), 0));
  const onlineOf = (docs) => round2(docs.filter((d) => d.method === "online")
    .reduce((s, d) => s + (Number(d.amountPaid) || 0) + (Number(d.cbuExcess) || 0), 0));

  let savIn = 0, savOut = 0;
  for (const r of savingsAgg) r._id === "deposit" ? (savIn = round2(r.total)) : (savOut = round2(r.total));
  let expCash = 0, expBank = 0;
  for (const r of expenseAgg) {
    if (r._id === "cash") expCash = round2(r.total);
    else expBank = round2(expBank + (Number(r.total) || 0));
  }

  // Product inventory (live, not range — what's on the shelf now).
  let stockUnits = 0, capitalUnsold = 0, retailUnsold = 0, profitPotential = 0;
  for (const c of catalog) {
    const st = Number(c.stock) || 0;
    stockUnits += st;
    capitalUnsold += st * (Number(c.capital) || 0);
    retailUnsold += st * (Number(c.unitPrice) || 0);
    profitPotential += st * (Number(c.profit) || 0);
  }
  const prodSold = { sale: { count: 0, revenue: 0, capital: 0, profit: 0 }, loan: { count: 0, revenue: 0, capital: 0, profit: 0 } };
  let prodPaid = 0, prodUnpaid = 0;
  for (const r of prodAgg) {
    const bucket = r._id === "sale" ? prodSold.sale : prodSold.loan;
    bucket.count += r.count; bucket.revenue = round2(bucket.revenue + r.revenue);
    bucket.capital = round2(bucket.capital + r.capital); bucket.profit = round2(bucket.profit + r.profit);
    prodPaid = round2(prodPaid + (r.paid || 0)); prodUnpaid = round2(prodUnpaid + (r.unpaid || 0));
  }

  const treasury = {};
  for (const r of treasuryAgg) {
    const k = `${r._id.target}_${r._id.type}`;
    treasury[k] = round2((treasury[k] || 0) + r.total);
  }

  const L = loanAgg[0] || {};
  const O = outstandingAgg[0] || {};
  return {
    range: { from: q.from || null, to: q.to || null },
    generatedAt: new Date(),
    collections: {
      waterCash: cashOf(waterPays), waterOnline: onlineOf(waterPays), waterCount: waterPays.length,
      loanCash: cashOf(loanPays), loanOnline: onlineOf(loanPays), loanCount: loanPays.length,
      savingsIn: savIn, savingsOut: savOut,
      productCashSale: prodSold.sale.revenue, productLoanRevenue: prodSold.loan.revenue,
    },
    expenses: { cash: expCash, bank: expBank, total: round2(expCash + expBank) },
    // General disbursements — total OUT with per-stream breakdown.
    disbursements: (() => {
      const payrollT = payroll.total;
      const expenseT = round2(expCash + expBank);
      const loanT = round2(loanPayout[0]?.total || 0);
      return {
        grandTotal: round2(payrollT + expenseT + loanT),
        payroll,
        expenses: { total: expenseT, cash: expCash, bank: expBank, byCategory: expenseBreakdown },
        loanProceeds: { count: loanPayout[0]?.count || 0, total: loanT },
        memberFees: { count: mf.count || 0, total: round2(mf.total || 0), membership: round2(mf.membership || 0), tapping: round2(mf.tapping || 0) },
      };
    })(),
    loans: {
      released: L.count || 0, capital: round2(L.capital || 0), interest: round2(L.interest || 0),
      deductions: round2(L.deductions || 0), payable: round2(L.payable || 0),
      paid: round2(L.paid || 0), unpaid: round2(L.unpaid || 0),
      outstandingNow: round2(O.balance || 0), outstandingCount: O.count || 0,
    },
    inventory: {
      stockUnits, capitalUnsold: round2(capitalUnsold), retailUnsold: round2(retailUnsold),
      profitPotential: round2(profitPotential), catalogItems: catalog.length,
      sold: prodSold, paid: prodPaid, unpaid: prodUnpaid,
    },
    treasury: {
      vaultBalance: round2(vault?.balance || 0),
      bankAccounts: bankAccounts.map((b) => ({ ...b, balance: round2(b.balance) })),
      bankTotal: round2(bankAccounts.reduce((s, b) => s + (Number(b.balance) || 0), 0)),
      movements: treasury,
    },
    cbu: { total: round2(cbuAgg[0]?.total || 0), members: cbuAgg[0]?.members || 0 },
    savings: { total: round2(savingsBalAgg[0]?.total || 0), accounts: savingsBalAgg[0]?.accounts || 0 },
  };
}

router.get("/summary", ...guard, async (req, res) => {
  try {
    res.json(await buildSummary(req.query));
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to build audit summary." });
  }
});

// Sign a period — freezes the current figures into a permanent record.
router.post("/sign", ...guard, async (req, res) => {
  try {
    const { from, to, label, findings } = req.body || {};
    if (!from || !to) return res.status(400).json({ message: "Period from and to are required." });
    const snapshot = await buildSummary({ from, to });
    const report = await AuditReport.create({
      periodFrom: new Date(from + "T00:00:00"),
      periodTo: new Date(to + "T23:59:59.999"),
      label: String(label || "").trim(),
      snapshot,
      findings: String(findings || "").trim(),
      signedBy: req.user?.fullName || req.user?.employeeId || "",
      signedByRole: req.user?.role || "",
    });
    res.status(201).json(report.toObject());
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to sign report." });
  }
});

router.get("/", ...guard, async (req, res) => {
  const items = await AuditReport.find({}).sort({ signedAt: -1 }).limit(100).lean();
  res.json({ items });
});

router.get("/:id", ...guard, async (req, res) => {
  const r = await AuditReport.findById(req.params.id).lean();
  if (!r) return res.status(404).json({ message: "Report not found." });
  res.json(r);
});

export default router;
