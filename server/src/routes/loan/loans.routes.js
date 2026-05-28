import express from "express";
import LoanApplication from "../../models/LoanApplication.js";
import LoanPayment from "../../models/LoanPayment.js";
import LoanSettings from "../../models/LoanSettings.js";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/WaterBill.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import {
  computeAmortization,
  computeCharges,
  DEFAULT_CHARGE_RULES,
  DEFAULT_INTEREST_RATE_PER_MONTH,
} from "../../utils/loanAmortization.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "loan_officer"])];

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function normPN(s) {
  return String(s || "").toUpperCase().trim();
}

async function getSettings() {
  let s = await LoanSettings.findOne();
  if (!s) s = await LoanSettings.create({});
  if (!s.charges || s.charges.length === 0) {
    s.charges = DEFAULT_CHARGE_RULES;
    if (!s.interestRatePerMonth) s.interestRatePerMonth = DEFAULT_INTEREST_RATE_PER_MONTH;
    await s.save();
  }
  return s;
}

// Count a member's outstanding (unpaid/overdue) water bills.
async function outstandingWaterBills(pnNo) {
  return WaterBill.countDocuments({ pnNo, status: { $in: ["unpaid", "overdue"] } });
}

// ---- Eligibility: member exists + no unpaid/overdue water bills ----
router.get("/eligibility/:pnNo", guard, async (req, res) => {
  const pnNo = normPN(req.params.pnNo);
  const member = await WaterMember.findOne({ pnNo });
  if (!member) {
    return res.status(404).json({ eligible: false, reason: "Water member not found" });
  }
  const outstanding = await outstandingWaterBills(pnNo);
  const eligible = outstanding === 0;
  res.json({
    eligible,
    reason: eligible
      ? "No outstanding water bills"
      : `${outstanding} unpaid/overdue water bill(s) must be settled first`,
    outstandingBills: outstanding,
    member: {
      pnNo: member.pnNo,
      accountName: member.accountName,
      accountStatus: member.accountStatus,
      address: member.fullAddress || "",
      classification: member.billing?.classification || "residential",
    },
  });
});

// ---- Amortization + charges preview ----
router.post("/amortization", guard, async (req, res) => {
  const s = await getSettings();
  const principal = Number(req.body.principal || 0);
  const rate = Number(req.body.interestRatePerMonth ?? s.interestRatePerMonth ?? 2.5);
  const term = Math.max(1, Number(req.body.termMonths || s.defaultTermMonths || 6));
  const amort = computeAmortization({ principal, monthlyRatePct: rate, termMonths: term });
  const charges = computeCharges({ principal, rules: s.charges });
  res.json({ ...amort, ...charges, interestRatePerMonth: rate, termMonths: term });
});

// ---- Settings ----
router.get("/settings", guard, async (req, res) => {
  res.json(await getSettings());
});
router.put("/settings", guard, async (req, res) => {
  const s = await getSettings();
  const allow = [
    "interestRatePerMonth",
    "penaltyRatePerMonth",
    "defaultTermMonths",
    "charges",
    "dueDayOfMonth",
    "graceDays",
    "penaltyType",
    "penaltyValue",
    "penaltyFrequency",
  ];
  for (const k of allow) if (k in req.body) s[k] = req.body[k];
  s.updatedBy = req.user?.fullName || req.user?.employeeId || "";
  await s.save();
  res.json(s);
});

// ---- List applications ----
router.get("/applications", guard, async (req, res) => {
  const { q = "", status = "", month = "", page = "1", limit = "12" } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    filter.$or = [{ loanId: rx }, { referenceCode: rx }, { borrowerPnNo: rx }, { borrowerName: rx }];
  }
  if (month) {
    const [y, m] = String(month).split("-").map(Number);
    if (y && m) {
      filter.createdAt = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
    }
  }
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, parseInt(limit, 10) || 12);
  const [items, total] = await Promise.all([
    LoanApplication.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * lim)
      .limit(lim)
      .lean(),
    LoanApplication.countDocuments(filter),
  ]);
  res.json({ items, total, page: pageNum, limit: lim });
});

// ---- Get one (with payments) ----
router.get("/applications/:id", guard, async (req, res) => {
  const loan = await LoanApplication.findById(req.params.id).lean();
  if (!loan) return res.status(404).json({ message: "Loan not found" });
  const payments = await LoanPayment.find({ loanId: loan.loanId }).sort({ paidAt: 1 }).lean();
  res.json({ ...loan, payments });
});

// ---- Apply (creates loan; eligibility gate) ----
router.post("/applications", guard, async (req, res) => {
  const b = req.body || {};
  const pnNo = normPN(b.borrowerPnNo);
  if (!pnNo) return res.status(400).json({ message: "borrowerPnNo is required" });

  const member = await WaterMember.findOne({ pnNo });
  if (!member) return res.status(404).json({ message: `Water member not found for PN No ${pnNo}` });

  const outstanding = await outstandingWaterBills(pnNo);
  if (outstanding > 0 && !b.override) {
    return res.status(409).json({
      message: `Member has ${outstanding} unpaid/overdue water bill(s); not eligible for a loan.`,
      outstandingBills: outstanding,
    });
  }

  const principal = Number(b.principal || 0);
  if (!(principal > 0)) return res.status(400).json({ message: "Principal (amount applied) must be greater than 0" });

  const s = await getSettings();
  const rate = Number(b.interestRatePerMonth ?? s.interestRatePerMonth ?? 2.5);
  const term = Math.max(1, Number(b.termMonths || s.defaultTermMonths || 6));

  const amort = computeAmortization({ principal, monthlyRatePct: rate, termMonths: term });
  const charges = computeCharges({ principal, rules: s.charges });

  const loan = await LoanApplication.create({
    borrowerPnNo: pnNo,
    borrowerName: b.borrowerName || member.accountName,
    borrowerAddress: b.borrowerAddress || member.fullAddress || "",
    borrowerStatus: member.accountStatus || "active",
    loanType: b.loanType || "regular",
    purpose: b.purpose || "",
    collateral: b.collateral || "",
    modeOfPayment: b.modeOfPayment === "semi-monthly" ? "semi-monthly" : "monthly",
    principal,
    interestRatePerMonth: rate,
    termMonths: term,
    monthlyPayment: amort.monthlyPayment,
    totalPayment: amort.totalPayment,
    totalInterest: amort.totalInterest,
    amortizationSchedule: amort.rows,
    charges: charges.items,
    totalCharges: charges.total,
    netProceeds: charges.netProceeds,
    applicant: b.applicant || {},
    coMaker: b.coMaker || {},
    sourceOfIncome: Array.isArray(b.sourceOfIncome) ? b.sourceOfIncome : [],
    cooperative: b.cooperative || {},
    balance: amort.totalPayment,
    status: "pending",
    createdBy: req.user?.fullName || req.user?.employeeId || "",
  });

  res.status(201).json(loan);
});

// ---- Update status (approve / reject / release / close) ----
router.patch("/applications/:id/status", guard, async (req, res) => {
  const { status, disbursedAt, remarks } = req.body || {};
  const allowed = ["pending", "approved", "rejected", "released", "closed"];
  if (!allowed.includes(status)) return res.status(400).json({ message: "Invalid status" });

  const loan = await LoanApplication.findById(req.params.id);
  if (!loan) return res.status(404).json({ message: "Loan not found" });

  const who = req.user?.fullName || req.user?.employeeId || "";
  loan.status = status;
  if (remarks != null) loan.remarks = remarks;

  if (status === "approved") {
    loan.approvedAt = new Date();
    loan.approvedBy = who;
  }

  if (status === "released") {
    loan.releasedAt = disbursedAt ? new Date(disbursedAt) : new Date();
    loan.releasedBy = who;
    const start = new Date(loan.releasedAt);
    const first = new Date(start);
    first.setMonth(first.getMonth() + 1);
    loan.firstPaymentDate = first;
    const maturity = new Date(start);
    maturity.setMonth(maturity.getMonth() + Number(loan.termMonths || 1));
    loan.maturityDate = maturity;
    // stamp due dates onto the schedule (first installment one month after release)
    loan.amortizationSchedule = (loan.amortizationSchedule || []).map((row, i) => {
      const r = typeof row.toObject === "function" ? row.toObject() : { ...row };
      const dd = new Date(start);
      dd.setMonth(dd.getMonth() + (i + 1));
      r.dueDate = dd;
      return r;
    });
  }

  await loan.save();
  res.json(loan);
});

// ---- Record a payment ----
router.post("/applications/:id/payments", guard, async (req, res) => {
  const loan = await LoanApplication.findById(req.params.id);
  if (!loan) return res.status(404).json({ message: "Loan not found" });

  const amountPaid = Number(req.body.amountPaid || 0);
  if (!(amountPaid > 0)) return res.status(400).json({ message: "amountPaid must be greater than 0" });

  const orNo = String(req.body.orNo || "").trim() || `OR-${Date.now()}`;
  const payment = await LoanPayment.create({
    loanId: loan.loanId,
    applicationId: loan._id,
    borrowerPnNo: loan.borrowerPnNo,
    orNo,
    method: req.body.method || "cash",
    amountPaid,
    paidAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(),
    receivedBy: req.user?.fullName || req.user?.employeeId || "",
  });

  loan.totalPaid = round2(Number(loan.totalPaid || 0) + amountPaid);
  loan.balance = round2(Math.max(0, Number(loan.totalPayment || 0) - loan.totalPaid));
  if (loan.balance <= 0 && loan.status === "released") loan.status = "closed";
  await loan.save();

  res.status(201).json({ payment, loan });
});

export default router;
