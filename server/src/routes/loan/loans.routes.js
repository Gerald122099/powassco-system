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
// GET /api/loan/eligibility/search?q=... — fuzzy lookup that accepts
// any of:
//   - exact Account Number (6-char alphanumeric, after pnNo migration)
//   - exact meter number (NNNNN#N or legacy bare numeric)
//   - account name (case-insensitive substring)
// Returns either ONE matched member with full eligibility (when the
// query resolves unambiguously) or a list of candidates (when the
// name search produces multiple hits).
router.get("/eligibility/search", guard, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ message: "q is required" });
    const qUpper = q.toUpperCase();

    // 1) Exact Account Number match (pnNo)
    let hits = await WaterMember.find({ pnNo: qUpper }).limit(5).lean();

    // 2) Exact meter number — multikey index match
    if (hits.length === 0) {
      hits = await WaterMember.find({ "meters.meterNumber": qUpper }).limit(5).lean();
    }

    // 3) Fuzzy account name (case-insensitive substring). Anchor on
    //    the start so "Aguanta" doesn't match "Daguanta" — Mongo's
    //    regex with /^.../i hits the indexed prefix when there's one.
    if (hits.length === 0) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      hits = await WaterMember.find({
        $or: [{ accountName: re }, { "personal.fullName": re }],
      })
        .limit(25)
        .lean();
    }

    if (hits.length === 0) return res.status(404).json({ message: "No matching account found." });

    // Multiple name hits → return the candidate list so the UI can
    // show a picker. No eligibility computed yet — that's only when
    // a single member is resolved.
    if (hits.length > 1) {
      return res.json({
        multiple: true,
        candidates: hits.map((m) => ({
          pnNo: m.pnNo,
          accountName: m.accountName,
          address: [m.address?.streetSitioPurok, m.address?.barangay].filter(Boolean).join(", ") || "",
          classification: m.billing?.classification || "residential",
          meters: (m.meters || []).filter((mt) => mt.meterStatus === "active").map((mt) => mt.meterNumber),
          cbuBalance: Number(m.cbuBalance || 0),
        })),
      });
    }

    // Single match — compute full eligibility (same gates as the
    // direct /eligibility/:pnNo endpoint).
    const member = hits[0];
    const outstanding = await outstandingWaterBills(member.pnNo);
    const s = await getSettings();
    const minCbu = Number(s.minCbuForLoan ?? 3000);
    const cbu = Number(member.cbuBalance || 0);
    const reasons = [];
    if (outstanding > 0) reasons.push(`${outstanding} unpaid/overdue water bill(s) must be settled first`);
    if (cbu < minCbu) reasons.push(`CBU balance ₱${cbu.toFixed(2)} is below the ₱${minCbu.toFixed(2)} minimum required for a loan`);
    const eligible = reasons.length === 0;

    res.json({
      eligible,
      reason: eligible ? "Eligible — no outstanding bills and CBU above minimum" : reasons.join("; "),
      outstandingBills: outstanding,
      cbuBalance: cbu,
      minCbuRequired: minCbu,
      member: {
        pnNo: member.pnNo,
        accountName: member.accountName,
        accountStatus: member.accountStatus,
        address: member.fullAddress || "",
        classification: member.billing?.classification || "residential",
      },
    });
  } catch (e) {
    console.error("eligibility/search error:", e);
    res.status(500).json({ message: "Eligibility search failed." });
  }
});

router.get("/eligibility/:pnNo", guard, async (req, res) => {
  const pnNo = normPN(req.params.pnNo);
  const member = await WaterMember.findOne({ pnNo });
  if (!member) {
    return res.status(404).json({ eligible: false, reason: "Water member not found" });
  }
  const outstanding = await outstandingWaterBills(pnNo);
  const s = await getSettings();
  const minCbu = Number(s.minCbuForLoan ?? 3000);
  const cbu = Number(member.cbuBalance || 0);

  // Two gates: no outstanding water bills AND CBU at-or-above the
  // co-op's minimum. Both have to pass; bookkeeper can override at
  // POST time with body.override.
  const reasons = [];
  if (outstanding > 0) reasons.push(`${outstanding} unpaid/overdue water bill(s) must be settled first`);
  if (cbu < minCbu) reasons.push(`CBU balance ₱${cbu.toFixed(2)} is below the ₱${minCbu.toFixed(2)} minimum required for a loan`);
  const eligible = reasons.length === 0;

  res.json({
    eligible,
    reason: eligible ? "Eligible — no outstanding bills and CBU above minimum" : reasons.join("; "),
    outstandingBills: outstanding,
    cbuBalance: cbu,
    minCbuRequired: minCbu,
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

// ---- Summary / analytics (capital out, interest/profit, collections) ----
router.get("/summary", guard, async (req, res) => {
  const { from, to } = req.query;
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  const loans = await LoanApplication.find(match).lean();
  const sum = (arr, f) => round2(arr.reduce((s, x) => s + Number(f(x) || 0), 0));
  const released = loans.filter((l) => ["released", "closed"].includes(l.status));

  const byStatus = { pending: 0, approved: 0, rejected: 0, released: 0, closed: 0 };
  loans.forEach((l) => {
    if (byStatus[l.status] != null) byStatus[l.status] += 1;
  });

  res.json({
    totalApplications: loans.length,
    byStatus,
    capitalReleased: sum(released, (l) => l.principal), // capital out
    expectedInterest: sum(released, (l) => l.totalInterest), // interest = profit
    totalCharges: sum(released, (l) => l.totalCharges), // fees collected
    totalReceivable: sum(released, (l) => l.totalPayment),
    totalCollected: sum(loans, (l) => l.totalPaid),
    outstanding: sum(released, (l) => l.balance),
  });
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
    "defaultTermMonthsEmployee",
    "minCbuForLoan",
    "charges",
    "dueDayOfMonth",
    "graceDays",
    "penaltyType",
    "penaltyValue",
    "penaltyFrequency",
    "productTerms",
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

  // CBU eligibility gate. Co-op policy: borrower must hold at least
  // `minCbuForLoan` (default ₱3,000) in their Capital Build-Up before
  // we'll release a new loan. Bookkeeper can override with
  // body.override (same flag the outstanding-bills check uses).
  const minCbu = Number(s.minCbuForLoan ?? 3000);
  const cbu = Number(member.cbuBalance || 0);
  if (cbu < minCbu && !b.override) {
    return res.status(409).json({
      message: `CBU balance ₱${cbu.toFixed(2)} is below the ₱${minCbu.toFixed(2)} minimum required for a loan.`,
      cbuBalance: cbu,
      minCbuRequired: minCbu,
      shortfall: Number((minCbu - cbu).toFixed(2)),
    });
  }
  const rate = Number(b.interestRatePerMonth ?? s.interestRatePerMonth ?? 2.5);
  // borrowerType drives the default term when the form didn't ship
  // an explicit termMonths. Members = 6, Employees = 12 (configurable
  // in LoanSettings). Officer can always override by passing
  // termMonths in the body.
  const borrowerType = b.borrowerType === "employee" ? "employee" : "member";
  const defaultTerm = borrowerType === "employee"
    ? Number(s.defaultTermMonthsEmployee || 12)
    : Number(s.defaultTermMonths || 6);
  const term = Math.max(1, Number(b.termMonths || defaultTerm));

  const amort = computeAmortization({ principal, monthlyRatePct: rate, termMonths: term });
  const charges = computeCharges({ principal, rules: s.charges });

  const loan = await LoanApplication.create({
    borrowerPnNo: pnNo,
    borrowerName: b.borrowerName || member.accountName,
    borrowerAddress: b.borrowerAddress || member.fullAddress || "",
    borrowerStatus: member.accountStatus || "active",
    loanType: b.loanType || "regular",
    borrowerType,
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
// Locked down to cashier + admin. Officers track loans + balances but do
// not post payments. The preferred new path is POST /api/cashier/pay-loan
// (which captures CBU excess); this legacy endpoint stays for back-compat.
const loanCashierGuard = [requireAuth, requireRole(["admin", "cashier"])];
router.post("/applications/:id/payments", loanCashierGuard, async (req, res) => {
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
