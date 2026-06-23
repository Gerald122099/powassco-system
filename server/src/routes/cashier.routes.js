// Cashier — lookup + posting (the single place payments enter the system).
//
//   GET  /api/cashier/water?q=...   — by PN no, meter, or name
//   GET  /api/cashier/loan?q=...    — by loan ID, reference, borrower, PN
//   POST /api/cashier/pay-water     — post a payment to one or more bills,
//                                     OR + amount received (≥ total due);
//                                     excess auto-credits the member's CBU.
//   POST /api/cashier/pay-loan      — post a payment that may cover the
//                                     current period and one or more advance
//                                     periods. Excess → CBU.
//
// Officers (water_bill_officer, loan_officer) keep the lookup endpoints for
// reference but can no longer mark bills paid — only the cashier can post.

import express from "express";
import WaterMember from "../models/WaterMember.js";
import WaterBill from "../models/WaterBill.js";
import WaterPayment from "../models/WaterPayment.js";
import LoanApplication from "../models/LoanApplication.js";
import LoanPayment from "../models/LoanPayment.js";
import { ProductLoanApplication, ProductLoanCatalog } from "../models/ProductLoan.js";
import OnlinePayment from "../models/OnlinePayment.js";
import CbuTransaction from "../models/CbuTransaction.js";
import SavingsAccount from "../models/SavingsAccount.js";
import SavingsTransaction from "../models/SavingsTransaction.js";
import WaterSettings from "../models/WaterSettings.js";
import Expense from "../models/Expense.js";
import Payroll from "../models/Payroll.js";
import MemberFeeRequest from "../models/MemberFeeRequest.js";
import { BankAccount } from "../models/Treasury.js";
import { TreasuryTransaction } from "../models/Treasury.js";
import { freshenBill, penaltyForDays } from "../utils/penalty.js";
import { applySeniorDiscountToUnpaidBills } from "../scripts/applySeniorDiscount.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
// View access — for the lookup endpoints. Officers can still SEE dues but
// not pay.
const guard = [requireAuth, requireRole(["admin", "cashier", "water_bill_officer", "loan_officer", "bookkeeper"])];
// Pay access — only cashier (and admin for emergencies).
const payGuard = [requireAuth, requireRole(["admin", "cashier"])];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Append a CBU credit and bump the member's running balance.
// CRITICAL: uses $inc with findOneAndUpdate, NOT member.save() with a
// precomputed value. Two concurrent credits (water_overpay + a bundled
// cashier_contribution on the same OR; or two cashiers in parallel)
// would otherwise both load the same pre-balance and the second
// .save() would silently overwrite the first's increment — money lost
// from the cached balance while the ledger rows show both credits.
async function creditCbu({ member, amount, source, refOrNo, waterPaymentId = null, loanPaymentId = null, postedBy, note = "" }) {
  if (!member || !(amount > 0)) return Number(member?.cbuBalance || 0);
  const amt = round2(Number(amount));
  const updated = await WaterMember.findOneAndUpdate(
    { _id: member._id },
    { $inc: { cbuBalance: amt } },
    { new: true }
  );
  const newBal = round2(Number(updated?.cbuBalance || 0));
  await CbuTransaction.create({
    pnNo: member.pnNo,
    accountName: member.accountName,
    type: "credit",
    amount: amt,
    balanceAfter: newBal,
    source,
    refOrNo,
    waterPaymentId,
    loanPaymentId,
    note,
    postedBy,
  });
  return newBal;
}

const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => String(s || "").trim().toUpperCase();

// ------ WATER LOOKUP ------
// Search a member by PN no, meter number, OR account name.
// If a name matches multiple accounts the response is a candidate list so the
// cashier can pick the exact one before issuing an OR.
router.get("/water", ...guard, async (req, res) => {
  try {
    const raw = String(req.query.q || "").trim();
    if (!raw || raw.length < 2) return res.status(400).json({ message: "Enter an Account No., meter number, or account name (at least 2 characters)." });
    const q = raw.toUpperCase();

    const rxStart = new RegExp("^" + escapeRegex(q), "i");
    const rxAny = new RegExp(escapeRegex(raw), "i");

    // Try PN first (exact → prefix), then meter number (exact → prefix), then accountName (any-position, case-insensitive).
    let member =
      (await WaterMember.findOne({ pnNo: q }).lean()) ||
      (await WaterMember.findOne({ pnNo: rxStart }).lean()) ||
      (await WaterMember.findOne({ "meters.meterNumber": q }).lean()) ||
      (await WaterMember.findOne({ "meters.meterNumber": rxStart }).lean());

    if (!member) {
      const nameMatches = await WaterMember.find({ accountName: rxAny })
        .select("pnNo accountName address meters accountStatus")
        .sort({ accountName: 1 })
        .limit(20)
        .lean();
      if (nameMatches.length === 0) {
        return res.status(404).json({ message: "No account found for that PN, meter number, or name." });
      }
      if (nameMatches.length > 1) {
        return res.json({
          candidates: nameMatches.map((m) => ({
            pnNo: m.pnNo,
            accountName: m.accountName,
            accountStatus: m.accountStatus,
            address: [m.address?.streetSitioPurok, m.address?.barangay].filter(Boolean).join(", "),
            meters: (m.meters || []).filter((mt) => mt.meterStatus === "active").map((mt) => mt.meterNumber),
          })),
        });
      }
      member = nameMatches[0];
    }

    // Bills (all — sorted newest first). We DON'T use .lean() because we
    // call freshenBill() below to bring totalDue / penalty / overdue
    // status up to today. Without this the cashier saw a stale totalDue
    // (older snapshot) while the water bill officer saw the live one,
    // because their endpoint already runs the same recompute.
    const billDocs = await WaterBill.find({ pnNo: member.pnNo }).sort({ periodCovered: -1 });
    const liveSettings = await WaterSettings.findOne();
    for (const b of billDocs) {
      if (b.status !== "paid") await freshenBill(b, { settings: liveSettings });
    }
    // Project to the same shape the client already consumes.
    const bills = billDocs.map((b) => ({
      _id: b._id,
      pnNo: b.pnNo,
      meterNumber: b.meterNumber,
      periodCovered: b.periodCovered,
      periodKey: b.periodKey,
      consumed: b.consumed,
      previousReading: b.previousReading,
      presentReading: b.presentReading,
      baseAmount: b.baseAmount,
      discount: b.discount,
      discountReason: b.discountReason || "",
      penaltyApplied: b.penaltyApplied,
      totalDue: b.totalDue,
      status: b.status,
      dueDate: b.dueDate,
      paidAt: b.paidAt,
      orNo: b.orNo,
      daysOverdue: b.daysOverdue || 0,
      subjectForDisconnection: !!b.subjectForDisconnection,
    }));

    // Last few payments (so the cashier can sanity-check "already paid recently?").
    const billIds = bills.map((b) => b._id);
    const payments = billIds.length
      ? await WaterPayment.find({ billId: { $in: billIds } })
          .sort({ paidAt: -1 })
          .limit(20)
          .select("billId pnNo meterNumber orNo amountPaid paidAt receivedBy method")
          .lean()
      : [];

    // Online payments still in pending review — flag so cashier doesn't double-collect.
    const pendingOnline = await OnlinePayment.find({
      module: "water",
      pnNo: member.pnNo,
      status: "pending",
    })
      .select("meterNumber periodKey amountToPay referenceId createdAt")
      .lean();

    const unpaid = bills.filter((b) => b.status !== "paid");
    const totalDue = unpaid.reduce((sum, b) => sum + (Number(b.totalDue) || 0), 0);

    // Open product-loan / rental balances for the SAME member, so the
    // cashier can include them in a single OR with the water payment.
    // Only loans + rentals with an outstanding balance are returned;
    // fully-paid and never-released items are skipped.
    const productLoans = await ProductLoanApplication.find({
      pnNo: member.pnNo,
      transactionType: { $in: ["loan", "rental"] },
      balance: { $gt: 0 },
    })
      .select("_id transactionType productName productCategory quantity totalPrice balance dueDate borrowDate returnDate rentFee latePenalty status")
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    // Voluntary savings account (if any) — surfaced so the pay modal
    // can offer a deposit bundle on the same OR.
    const savingsAccount = await SavingsAccount.findOne({ pnNo: member.pnNo, status: "active" })
      .select("pnNo balance status")
      .lean();

    res.json({
      member: (() => {
        const activeMeters = (member.meters || []).filter((m) => m.meterStatus === "active");
        // Effective discount meter: the flagged one, else the first active meter.
        const discountMeterNumber = (activeMeters.find((m) => m.isDiscountMeter) || activeMeters[0])?.meterNumber || "";
        return {
          pnNo: member.pnNo,
          accountName: member.accountName,
          accountStatus: member.accountStatus,
          cbuBalance: Number(member.cbuBalance) || 0,
          classification: member.billing?.classification,
          address: [member.address?.houseLotNo, member.address?.streetSitioPurok, member.address?.barangay, member.address?.municipalityCity].filter(Boolean).join(", "),
          contact: member.contact?.mobileNumber || "",
          // Senior / PWD discount status, surfaced so the cashier sees the
          // indicator and the discount that's baked into each bill.
          isSeniorCitizen: !!member.personal?.isSeniorCitizen,
          seniorDiscountRate: Number(member.personal?.seniorDiscountRate || 0),
          hasPWD: !!member.billing?.hasPWD,
          // Which meter carries the discount (multi-meter accounts). The cashier
          // can change this via POST /cashier/water/discount-meter.
          discountMeterNumber,
          meters: activeMeters.map((m) => ({
            meterNumber: m.meterNumber, meterBrand: m.meterBrand, meterSize: m.meterSize, lastReading: m.lastReading,
            isDiscountMeter: m.meterNumber === discountMeterNumber,
          })),
        };
      })(),
      bills,
      unpaidCount: unpaid.length,
      totalDue,
      recentPayments: payments,
      pendingOnline,
      productLoans,
      savingsAccount,
      cashierCanWaivePenalty: !!liveSettings?.cashierCanWaivePenalty,
      penaltySettings: {
        daily: Number(liveSettings?.penaltyDailyAmount ?? 10),
        grace: Number(liveSettings?.penaltyGraceDays ?? 5),
        after: Number(liveSettings?.penaltyAfterGraceAmount ?? 200),
      },
    });
  } catch (e) {
    console.error("Cashier water lookup error:", e);
    res.status(500).json({ message: "Lookup failed. Please try again." });
  }
});

// Choose which meter carries the senior/PWD discount for a MULTI-METER
// account, then re-apply the discount to that member's unpaid bills (moves it
// to the chosen meter and clears it from the others). Single-meter accounts
// always use their one meter, so this is only needed when meters.length > 1.
//   body: { pnNo, meterNumber }
router.post("/water/discount-meter", ...payGuard, async (req, res) => {
  try {
    const pnNo = String(req.body?.pnNo || "").toUpperCase().trim();
    const meterNumber = String(req.body?.meterNumber || "").toUpperCase().trim();
    if (!pnNo || !meterNumber) return res.status(400).json({ message: "pnNo and meterNumber are required." });

    const member = await WaterMember.findOne({ pnNo });
    if (!member) return res.status(404).json({ message: "Member not found." });
    if (!member.personal?.isSeniorCitizen && !member.billing?.hasPWD) {
      return res.status(400).json({ message: "This member has no senior/PWD discount." });
    }
    const active = (member.meters || []).filter((m) => m.meterStatus === "active");
    const target = active.find((m) => String(m.meterNumber).toUpperCase() === meterNumber);
    if (!target) return res.status(400).json({ message: "Meter not found or not active." });

    // Flag the chosen meter; clear the flag on all others.
    for (const m of member.meters) {
      m.isDiscountMeter = String(m.meterNumber).toUpperCase() === meterNumber;
    }
    await member.save();

    // Re-apply (base-preserving) so the discount moves to the chosen meter.
    const applied = await applySeniorDiscountToUnpaidBills({ dry: false, pnNo });
    res.json({ ok: true, discountMeter: target.meterNumber, applied });
  } catch (e) {
    console.error("Set discount meter error:", e);
    res.status(500).json({ message: "Could not update the discount meter." });
  }
});

// ------ LOAN LOOKUP ------
// Search by loan ID, reference code, borrower name, or PN no.
router.get("/loan", ...guard, async (req, res) => {
  try {
    const raw = String(req.query.q || "").trim();
    if (!raw || raw.length < 2) return res.status(400).json({ message: "Enter a loan ID, reference code, borrower name, or Account No." });
    const q = raw.toUpperCase();
    const rx = new RegExp(escapeRegex(raw), "i");

    const loans = await LoanApplication.find({
      $or: [
        { loanId: q },
        { loanId: rx },
        { referenceCode: q },
        { referenceCode: rx },
        { borrowerPnNo: q },
        { borrowerName: rx },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select(
        "loanId referenceCode borrowerPnNo borrowerName borrowerType principal monthlyPayment totalPayment totalPaid balance status releasedAt maturityDate firstPaymentDate termMonths interestRatePerMonth totalInterest totalCharges netProceeds charges amortizationSchedule createdAt"
      )
      .lean();

    if (loans.length === 0) return res.status(404).json({ message: "No loan found for that query." });

    const loanIds = loans.map((l) => l.loanId);

    // Pull open product-loan / rental balances for the borrowers
    // returned, so the cashier sees them next to the loan and can
    // bundle into the same OR.
    const borrowerPnNos = [...new Set(loans.map((l) => l.borrowerPnNo).filter(Boolean))];
    const [recentPayments, pendingOnline, productLoans] = await Promise.all([
      LoanPayment.find({ loanId: { $in: loanIds } })
        .sort({ paidAt: -1 })
        // Bumped to 500 so a multi-month catch-up on a legacy loan
        // can fully populate the paid-periods set on the cashier
        // picker; still bounded.
        .limit(500)
        .select("loanId orNo method amountPaid paidAt receivedBy periodsCovered periodsPaid")
        .lean(),
      OnlinePayment.find({ module: "loan", loanId: { $in: loanIds }, status: "pending" })
        .select("loanId amountToPay referenceId createdAt")
        .lean(),
      borrowerPnNos.length > 0
        ? ProductLoanApplication.find({
            pnNo: { $in: borrowerPnNos },
            transactionType: { $in: ["loan", "rental"] },
            balance: { $gt: 0 },
          })
            .select("_id pnNo transactionType productName productCategory quantity totalPrice balance dueDate borrowDate returnDate rentFee latePenalty status")
            .sort({ dueDate: 1, createdAt: -1 })
            .lean()
        : Promise.resolve([]),
    ]);

    // Pull savings accounts for the borrowers so the pay modal can
    // bundle a deposit on the same OR.
    const savingsAccounts = borrowerPnNos.length > 0
      ? await SavingsAccount.find({ pnNo: { $in: borrowerPnNos }, status: "active" })
          .select("pnNo balance status")
          .lean()
      : [];

    res.json({ loans, recentPayments, pendingOnline, productLoans, savingsAccounts });
  } catch (e) {
    console.error("Cashier loan lookup error:", e);
    res.status(500).json({ message: "Lookup failed. Please try again." });
  }
});

// ----------------------------------------------------------------------
// POST /api/cashier/pay-water — cashier posts a water payment.
// Body: { pnNo, meterNumber, periodKey, orNo, amountReceived, method?, note? }
// Rules:
//   • Cashier may post against an unpaid/overdue bill identified by (pn, meter, periodKey).
//   • amountReceived MUST be >= bill.totalDue. Excess goes to the member's CBU.
//   • orNo is unique system-wide (WaterPayment.orNo has a unique index).
// ----------------------------------------------------------------------
router.post("/pay-water", ...payGuard, async (req, res) => {
  try {
    const pnNo = norm(req.body?.pnNo);
    const meterNumber = norm(req.body?.meterNumber);
    const periodKey = String(req.body?.periodKey || "").trim();
    const orNo = String(req.body?.orNo || "").trim().toUpperCase();
    const amountReceived = Number(req.body?.amountReceived || 0);
    const method = String(req.body?.method || "cash").toLowerCase();
    const note = String(req.body?.note || "");
    // Optional inline bundle of product-loan / rental payments to
    // settle on the SAME OR as the water bill. Each entry is
    // { id: <ProductLoanApplication._id>, amount: <₱> }. Amounts here
    // are deducted from amountReceived BEFORE computing CBU excess,
    // so a cashier can hand back a single receipt covering everything.
    const rawProductLoans = Array.isArray(req.body?.productLoanPayments)
      ? req.body.productLoanPayments
      : [];
    // Optional bundled additions (collected as part of this OR):
    //   savingsDeposit   — credited to the member's savings account
    //   cbuContribution  — credited to the member's CBU (separate from
    //                       automatic excess routing below)
    const savingsDeposit = Math.max(0, round2(Number(req.body?.savingsDeposit || 0)));
    const cbuContribution = Math.max(0, round2(Number(req.body?.cbuContribution || 0)));
    // Where the automatic excess (received − expected) goes:
    //   cbu (default) | savings | split (50/50, odd centavo to CBU)
    const excessTo = ["cbu", "savings", "split"].includes(req.body?.excessTo) ? req.body.excessTo : "cbu";

    if (!pnNo || !meterNumber || !periodKey) return res.status(400).json({ message: "pnNo, meterNumber and periodKey are required." });
    if (!orNo) return res.status(400).json({ message: "OR number is required." });
    if (!(amountReceived > 0)) return res.status(400).json({ message: "Enter the amount received." });

    // Pre-fetch ONLY to compute totalDue + read snapshot fields. The
    // actual write that flips status is atomic below — guarantees no
    // two concurrent cashier clicks can both mark the same bill paid.
    const bill = await WaterBill.findOne({ pnNo, meterNumber, periodKey });
    if (!bill) return res.status(404).json({ message: "Bill not found for that meter/period." });
    if (bill.status === "paid") return res.status(409).json({ message: "This bill is already paid." });

    const totalDue = round2(Number(bill.totalDue) || 0);
    // Penalty adjustment: the cashier may charge the penalty for only N of
    // the days overdue (penaltyDays), or fully waive it. Only honored when
    // the admin enabled cashierCanWaivePenalty. penaltyDays takes precedence;
    // waivePenalty (legacy) is equivalent to penaltyDays = 0.
    const waiveSettings = await WaterSettings.findOne().lean();
    const penaltyOnBill = round2(Number(bill.penaltyApplied) || 0);
    const baseWaterDue = round2(totalDue - penaltyOnBill); // base charge, no penalty
    const canAdjustPenalty = !!waiveSettings?.cashierCanWaivePenalty && penaltyOnBill > 0;
    let chosenPenalty = penaltyOnBill; // default: full penalty
    if (canAdjustPenalty) {
      if (req.body?.penaltyDays != null) {
        const maxDays = Math.max(0, Number(bill.daysOverdue) || 0);
        const m = Math.max(0, Math.min(Math.floor(Number(req.body.penaltyDays)), maxDays));
        chosenPenalty = round2(penaltyForDays(m, waiveSettings));
      } else if (req.body?.waivePenalty) {
        chosenPenalty = 0;
      }
    }
    const penaltyWaivedAmt = round2(penaltyOnBill - chosenPenalty);
    const waivePenalty = penaltyWaivedAmt > 0; // for notes / bill update
    const effectiveWaterDue = round2(baseWaterDue + chosenPenalty);

    // Validate + pre-load every product loan that's being bundled, so
    // we can fail fast (and atomically) before flipping the water
    // bill. Any unresolved id, mismatched member, or over-payment on
    // a single product loan aborts the whole transaction.
    const productLoanPayments = [];
    for (const pl of rawProductLoans) {
      const amt = round2(Number(pl?.amount || 0));
      if (!(amt > 0)) continue;
      const doc = await ProductLoanApplication.findById(String(pl?.id || ""));
      if (!doc) return res.status(404).json({ message: `Product loan ${pl?.id} not found.` });
      if (doc.pnNo !== pnNo) return res.status(400).json({ message: `Product loan ${doc._id} belongs to a different member.` });
      if (doc.transactionType === "sale") return res.status(400).json({ message: `Sale ${doc._id} cannot accept additional payments.` });
      if (amt > Number(doc.balance || 0) + 0.005) {
        return res.status(400).json({ message: `Cannot pay ₱${amt} on ${doc.productName} — outstanding is only ₱${doc.balance}.` });
      }
      productLoanPayments.push({ doc, amount: amt });
    }
    const productLoanTotal = productLoanPayments.reduce((s, p) => s + p.amount, 0);

    // If a savings deposit is requested, verify the account exists.
    // No silent open — the cashier opens through the Savings tab first
    // so this validation surfaces missing setup early.
    let savingsAccountForBundle = null;
    if (savingsDeposit > 0 || excessTo !== "cbu") {
      savingsAccountForBundle = await SavingsAccount.findOne({ pnNo });
      if (!savingsAccountForBundle || savingsAccountForBundle.status === "closed") {
        return res.status(400).json({
          message: savingsDeposit > 0
            ? "Member has no active savings account. Open one in the Savings tab before bundling."
            : "Excess can't route to savings — member has no active savings account.",
        });
      }
    }

    const totalExpected = round2(effectiveWaterDue + productLoanTotal + savingsDeposit + cbuContribution);
    if (amountReceived < totalExpected) {
      return res.status(400).json({
        message: `Amount received (₱${amountReceived}) is less than the combined total (₱${totalExpected}: water ₱${effectiveWaterDue}${waivePenalty ? ` (penalty ₱${chosenPenalty} charged, ₱${penaltyWaivedAmt} waived)` : ""}${productLoanTotal > 0 ? ` + product loans ₱${productLoanTotal}` : ""}${savingsDeposit > 0 ? ` + savings ₱${savingsDeposit}` : ""}${cbuContribution > 0 ? ` + CBU ₱${cbuContribution}` : ""}).`,
      });
    }

    // Reject duplicate OR up-front (the unique index would catch it anyway).
    const dupOr = await WaterPayment.findOne({ orNo });
    if (dupOr) return res.status(409).json({ message: `OR ${orNo} already used.` });

    const cbuExcess = round2(amountReceived - totalExpected);
    const receivedBy = req.user?.fullName || req.user?.employeeId || "";

    // Split the excess per the cashier's routing choice. The payment
    // doc's cbuExcess field stores only the CBU-bound portion so the
    // drawer/CBU reports stay exact; the savings-bound portion gets
    // its own ledger row below (OR suffixed -EXC).
    let excessCbuPart = cbuExcess;
    let excessSavingsPart = 0;
    if (cbuExcess > 0 && excessTo === "savings") {
      excessCbuPart = 0;
      excessSavingsPart = cbuExcess;
    } else if (cbuExcess > 0 && excessTo === "split") {
      excessSavingsPart = round2(Math.floor((cbuExcess / 2) * 100) / 100);
      excessCbuPart = round2(cbuExcess - excessSavingsPart); // odd centavo → CBU
    }

    // STEP 1 — atomic status flip. If the bill is already paid (or doesn't
    // exist any more), this returns null and we abort. This is the single
    // source of truth for "I have the right to post this payment".
    const claimed = await WaterBill.findOneAndUpdate(
      { _id: bill._id, status: { $ne: "paid" } },
      { $set: {
        status: "paid", paidAt: new Date(), orNo, subjectForDisconnection: false,
        // Penalty waived → reflect the reduced due on the bill itself.
        ...(waivePenalty ? { penaltyApplied: chosenPenalty, totalDue: effectiveWaterDue } : {}),
      } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: "This bill is already paid (race lost)." });

    // STEP 2 — create the WaterPayment. Unique-index on orNo is the last
    // safety net. If create throws E11000, undo the status flip below.
    let payment;
    try {
      payment = await WaterPayment.create({
        billId: claimed._id,
        pnNo: claimed.pnNo,
        meterNumber: claimed.meterNumber,
        periodKey: claimed.periodKey,
        orNo,
        method,
        amountPaid: effectiveWaterDue,
        amountReceived: round2(amountReceived),
        cbuExcess: excessCbuPart,
        discountApplied: claimed.discount || 0,
        penaltyApplied: claimed.penaltyApplied || 0,
        classification: claimed.classification,
        receivedBy,
        paidAt: new Date(),
        notes: note || [
          waivePenalty ? `Penalty: charged ₱${chosenPenalty}, waived ₱${penaltyWaivedAmt} by ${receivedBy}` : "",
          cbuExcess > 0 ? `Excess ₱${cbuExcess} credited to CBU` : "",
        ].filter(Boolean).join(" • "),
      });
    } catch (e) {
      // Compensate: re-open the bill so the cashier can retry with a
      // different OR. The atomic check above ensures only this request
      // touched it.
      await WaterBill.updateOne({ _id: claimed._id }, { $set: { status: "unpaid", paidAt: null, orNo: "" } });
      if (e?.code === 11000) return res.status(409).json({ message: "OR number is already in use." });
      throw e;
    }

    // Credit CBU if there was excess. CbuTransaction is a ledger (append-
    // only), but the atomic status flip above means we get here exactly
    // once per OR, so no double-credit risk.
    let newCbuBalance = 0;
    if (excessCbuPart > 0) {
      const member = await WaterMember.findOne({ pnNo: claimed.pnNo });
      if (member) {
        newCbuBalance = await creditCbu({
          member, amount: excessCbuPart, source: "water_overpay", refOrNo: orNo,
          waterPaymentId: payment._id, postedBy: receivedBy,
          note: `Excess from OR ${orNo} (water bill ${claimed.periodCovered || claimed.periodKey})`,
        });
      }
    }

    // Savings-bound excess (cashier picked savings / split routing).
    let excessSavingsResult = null;
    if (excessSavingsPart > 0 && savingsAccountForBundle) {
      const updatedExc = await SavingsAccount.findOneAndUpdate(
        { _id: savingsAccountForBundle._id },
        { $inc: { balance: excessSavingsPart } },
        { new: true }
      );
      await SavingsTransaction.create({
        pnNo,
        type: "deposit",
        amount: excessSavingsPart,
        orNo: `${orNo}-EXC`,
        method,
        receivedBy,
        balanceAfter: round2(updatedExc.balance),
        paidAt: new Date(),
        note: `Excess from water OR ${orNo} routed to savings`,
        bundledWithOr: orNo,
      });
      excessSavingsResult = { amount: excessSavingsPart, newBalance: updatedExc.balance };
    }

    // STEP 3 — apply any bundled product-loan / rental payments. Same
    // OR is recorded on each ProductLoanApplication.payments entry so
    // the audit trail back-references this single receipt.
    const productLoanResults = [];
    for (const { doc, amount } of productLoanPayments) {
      doc.payments.push({
        orNo,
        amount,
        method,
        paidAt: new Date(),
        receivedBy,
        note: `Bundled with water OR ${orNo}`,
      });
      doc.totalPaid = round2((doc.totalPaid || 0) + amount);
      doc.balance = round2((doc.balance || 0) - amount);
      if (doc.balance <= 0) {
        doc.status = doc.transactionType === "rental" ? "returned" : "fully_paid";
      }
      await doc.save();
      productLoanResults.push({
        id: String(doc._id),
        productName: doc.productName,
        transactionType: doc.transactionType,
        applied: amount,
        newBalance: doc.balance,
        status: doc.status,
      });
    }

    // STEP 4 — bundled savings deposit (single OR, separate ledger row
    // tagged with bundledWithOr so the bookkeeper can reconcile).
    let savingsResult = null;
    if (savingsDeposit > 0 && savingsAccountForBundle) {
      const updated = await SavingsAccount.findOneAndUpdate(
        { _id: savingsAccountForBundle._id },
        { $inc: { balance: savingsDeposit } },
        { new: true }
      );
      const savingsTx = await SavingsTransaction.create({
        pnNo,
        type: "deposit",
        amount: savingsDeposit,
        orNo: `${orNo}-SAV`, // suffix so the OR row is unique system-wide
        method,
        receivedBy,
        balanceAfter: round2(updated.balance),
        note: `Bundled with water OR ${orNo}`,
        bundledWithOr: orNo,
      });
      savingsResult = { tx: savingsTx, newBalance: updated.balance };
    }

    // STEP 5 — direct CBU contribution (separate from any excess).
    let cbuContributionResult = null;
    if (cbuContribution > 0) {
      const member = await WaterMember.findOne({ pnNo });
      if (member) {
        const newBal = await creditCbu({
          member, amount: cbuContribution, source: "cashier_contribution", refOrNo: orNo,
          waterPaymentId: payment._id, postedBy: receivedBy,
          note: `Direct CBU contribution bundled with OR ${orNo}`,
        });
        cbuContributionResult = { amount: cbuContribution, newBalance: newBal };
      }
    }

    res.status(201).json({
      ok: true,
      message: cbuExcess > 0
        ? `Posted ₱${totalDue} (water)${productLoanTotal > 0 ? ` + ₱${productLoanTotal} (product loans)` : ""}${savingsDeposit > 0 ? ` + ₱${savingsDeposit} (savings)` : ""}${cbuContribution > 0 ? ` + ₱${cbuContribution} (CBU)` : ""}. Excess ₱${cbuExcess} → CBU (new balance ₱${newCbuBalance}).`
        : `Posted ₱${totalDue} (water)${productLoanTotal > 0 ? ` + ₱${productLoanTotal} (product loans)` : ""}${savingsDeposit > 0 ? ` + ₱${savingsDeposit} (savings)` : ""}${cbuContribution > 0 ? ` + ₱${cbuContribution} (CBU)` : ""}.`,
      payment, cbuExcess: excessCbuPart, totalExcess: cbuExcess, newCbuBalance,
      excessSavings: excessSavingsResult,
      productLoanPayments: productLoanResults,
      productLoanTotal,
      savingsDeposit: savingsResult,
      cbuContribution: cbuContributionResult,
    });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "OR number is already in use." });
    console.error("pay-water error:", e);
    res.status(500).json({ message: e.message || "Payment failed." });
  }
});

// ----------------------------------------------------------------------
// POST /api/cashier/pay-loan — cashier posts a loan payment.
// Body: { loanId, orNo, amountReceived, periodsCovered (1..N), method?, note? }
// Rules:
//   • Pays the next `periodsCovered` scheduled installments (default 1).
//   • amountReceived MUST be >= the sum of those installments. Excess → CBU.
//   • orNo is unique system-wide.
// ----------------------------------------------------------------------
router.post("/pay-loan", ...payGuard, async (req, res) => {
  try {
    const loanId = String(req.body?.loanId || "").trim();
    const orNo = String(req.body?.orNo || "").trim().toUpperCase();
    const amountReceived = Number(req.body?.amountReceived || 0);
    // Two ways to specify which installments are being paid:
    //   1. periods: [1, 2, 3]   — explicit period numbers (1-based).
    //                             The new cashier picker uses this so
    //                             the cashier can hand-pick which
    //                             scheduled rows are being settled.
    //   2. periodsCovered: 3    — legacy "next N installments" form.
    //                             Kept for backwards compatibility.
    const explicitPeriods = Array.isArray(req.body?.periods)
      ? req.body.periods.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 1)
      : null;
    const periodsCovered = Math.max(1, Math.min(60, Number(req.body?.periodsCovered || 1)));
    const method = String(req.body?.method || "cash").toLowerCase();
    const note = String(req.body?.note || "");
    // Bundled additions (same OR): savings deposit + direct CBU contribution.
    const savingsDeposit = Math.max(0, round2(Number(req.body?.savingsDeposit || 0)));
    const cbuContribution = Math.max(0, round2(Number(req.body?.cbuContribution || 0)));
    const excessTo = ["cbu", "savings", "split"].includes(req.body?.excessTo) ? req.body.excessTo : "cbu";

    if (!loanId) return res.status(400).json({ message: "loanId is required." });
    if (!orNo) return res.status(400).json({ message: "OR number is required." });
    if (!(amountReceived > 0)) return res.status(400).json({ message: "Enter the amount received." });

    const loan = await LoanApplication.findOne({ loanId });
    if (!loan) return res.status(404).json({ message: "Loan not found." });
    if (Number(loan.balance || 0) <= 0) return res.status(400).json({ message: "Loan has no outstanding balance." });

    // Build the list of installments being paid by this OR. With
    // explicitPeriods, look up each period number on the schedule.
    // Otherwise fall back to "next N unpaid" behavior.
    let upcoming;
    let periodNumbers; // 1-based period numbers this payment covers
    if (explicitPeriods && explicitPeriods.length > 0) {
      const schedule = loan.amortizationSchedule || [];
      // Index-of-period — schedule entries can be {period: N, ...} or
      // just be ordered by index; we treat both interchangeably.
      const byPeriod = new Map(
        schedule.map((r, i) => [Number(r.period ?? i + 1), r])
      );
      upcoming = [];
      periodNumbers = [];
      for (const p of explicitPeriods) {
        const row = byPeriod.get(p);
        if (row) {
          upcoming.push(row);
          periodNumbers.push(p);
        }
      }
      if (upcoming.length === 0) return res.status(400).json({ message: "None of the selected periods exist on this loan's schedule." });
    } else {
      const monthly = Number(loan.monthlyPayment) || 0;
      const paidApproxPeriods = monthly > 0 ? Math.floor((Number(loan.totalPaid) || 0) / monthly) : 0;
      upcoming = (loan.amortizationSchedule || []).slice(paidApproxPeriods, paidApproxPeriods + periodsCovered);
      if (upcoming.length === 0) return res.status(400).json({ message: "No upcoming installments to pay." });
      periodNumbers = upcoming.map((r, i) => Number(r.period ?? paidApproxPeriods + i + 1));
    }
    const totalDue = round2(upcoming.reduce((s, r) => s + (Number(r.payment) || 0), 0));
    // Capital (principal) vs interest split of this payment, summed from the
    // diminishing-balance schedule rows being settled.
    const principalPaid = round2(upcoming.reduce((s, r) => s + (Number(r.principal) || 0), 0));
    const interestPaid = round2(upcoming.reduce((s, r) => s + (Number(r.interest) || 0), 0));

    // Same bundling trick as pay-water: cashier can include any open
    // product loans / rentals owned by the same borrower on this OR.
    // (Bundling water bills onto the loan-pay OR is intentionally
    // NOT supported here — there are too many water bills typically;
    // the cashier should use pay-water as the entry point in that case
    // and bundle this loan as a productLoan-like add-on later if we
    // expand to that. For now: loan + product-loans only.)
    const rawProductLoans = Array.isArray(req.body?.productLoanPayments)
      ? req.body.productLoanPayments
      : [];
    const productLoanPayments = [];
    for (const pl of rawProductLoans) {
      const amt = round2(Number(pl?.amount || 0));
      if (!(amt > 0)) continue;
      const doc = await ProductLoanApplication.findById(String(pl?.id || ""));
      if (!doc) return res.status(404).json({ message: `Product loan ${pl?.id} not found.` });
      if (doc.pnNo !== loan.borrowerPnNo) {
        return res.status(400).json({ message: `Product loan ${doc._id} belongs to a different member.` });
      }
      if (doc.transactionType === "sale") {
        return res.status(400).json({ message: `Sale ${doc._id} cannot accept additional payments.` });
      }
      if (amt > Number(doc.balance || 0) + 0.005) {
        return res.status(400).json({ message: `Cannot pay ₱${amt} on ${doc.productName} — outstanding is only ₱${doc.balance}.` });
      }
      productLoanPayments.push({ doc, amount: amt });
    }
    const productLoanTotal = productLoanPayments.reduce((s, p) => s + p.amount, 0);

    // Pre-validate savings account for bundled deposit / excess routing.
    let savingsAccountForBundle = null;
    if (savingsDeposit > 0 || excessTo !== "cbu") {
      savingsAccountForBundle = await SavingsAccount.findOne({ pnNo: loan.borrowerPnNo });
      if (!savingsAccountForBundle || savingsAccountForBundle.status === "closed") {
        return res.status(400).json({
          message: savingsDeposit > 0
            ? "Borrower has no active savings account. Open one in the Savings tab before bundling."
            : "Excess can't route to savings — borrower has no active savings account.",
        });
      }
    }

    const totalExpected = round2(totalDue + productLoanTotal + savingsDeposit + cbuContribution);

    if (amountReceived < totalExpected) {
      return res.status(400).json({
        message: `Amount received (₱${amountReceived}) is less than combined total (₱${totalExpected}: loan ₱${totalDue}${productLoanTotal > 0 ? ` + product loans ₱${productLoanTotal}` : ""}${savingsDeposit > 0 ? ` + savings ₱${savingsDeposit}` : ""}${cbuContribution > 0 ? ` + CBU ₱${cbuContribution}` : ""}).`,
      });
    }
    const dupOr = await LoanPayment.findOne({ orNo });
    if (dupOr) return res.status(409).json({ message: `OR ${orNo} already used.` });

    const cbuExcess = round2(amountReceived - totalExpected);
    const receivedBy = req.user?.fullName || req.user?.employeeId || "";

    // Excess routing split — same scheme as pay-water.
    let excessCbuPart = cbuExcess;
    let excessSavingsPart = 0;
    if (cbuExcess > 0 && excessTo === "savings") {
      excessCbuPart = 0;
      excessSavingsPart = cbuExcess;
    } else if (cbuExcess > 0 && excessTo === "split") {
      excessSavingsPart = round2(Math.floor((cbuExcess / 2) * 100) / 100);
      excessCbuPart = round2(cbuExcess - excessSavingsPart);
    }

    // Create the LoanPayment first. Unique-index on orNo is the race
    // breaker: two concurrent cashier clicks with the same OR will see
    // E11000 here. We do this BEFORE incrementing the loan so a failed
    // payment never leaves the loan over-credited.
    let payment;
    try {
      payment = await LoanPayment.create({
        loanId: loan.loanId,
        applicationId: loan._id,
        borrowerPnNo: loan.borrowerPnNo,
        orNo,
        method,
        amountPaid: totalDue,
        amountReceived: round2(amountReceived),
        cbuExcess: excessCbuPart,
        principalPaid,
        interestPaid,
        periodsCovered: upcoming.length,
        periodsPaid: periodNumbers,
        paidAt: new Date(),
        receivedBy,
      });
    } catch (e) {
      if (e?.code === 11000) return res.status(409).json({ message: "OR number is already in use." });
      throw e;
    }

    // Atomic increment on the loan. $inc + conditional balance recompute
    // means two concurrent payments with different ORs add up cleanly
    // instead of clobbering each other's totalPaid. We re-fetch to get
    // the post-write balance for the status flip.
    await LoanApplication.updateOne(
      { _id: loan._id },
      { $inc: { totalPaid: totalDue } }
    );
    const fresh = await LoanApplication.findById(loan._id).select("totalPayment totalPaid status balance");
    const newBalance = round2(Math.max(0, Number(fresh.totalPayment || 0) - Number(fresh.totalPaid || 0)));
    const setOps = { balance: newBalance };
    if (newBalance <= 0 && fresh.status === "released") setOps.status = "closed";
    await LoanApplication.updateOne({ _id: loan._id }, { $set: setOps });

    let newCbuBalance = 0;
    if (excessCbuPart > 0) {
      const member = await WaterMember.findOne({ pnNo: String(loan.borrowerPnNo || "").toUpperCase() });
      if (member) {
        newCbuBalance = await creditCbu({
          member, amount: excessCbuPart, source: "loan_overpay", refOrNo: orNo,
          loanPaymentId: payment._id, postedBy: receivedBy,
          note: `Excess from OR ${orNo} (loan ${loan.loanId})`,
        });
      }
    }

    // Savings-bound excess.
    let excessSavingsResult = null;
    if (excessSavingsPart > 0 && savingsAccountForBundle) {
      const updatedExc = await SavingsAccount.findOneAndUpdate(
        { _id: savingsAccountForBundle._id },
        { $inc: { balance: excessSavingsPart } },
        { new: true }
      );
      await SavingsTransaction.create({
        pnNo: loan.borrowerPnNo,
        type: "deposit",
        amount: excessSavingsPart,
        orNo: `${orNo}-EXC`,
        method,
        receivedBy,
        balanceAfter: round2(updatedExc.balance),
        paidAt: new Date(),
        note: `Excess from loan OR ${orNo} routed to savings`,
        bundledWithOr: orNo,
      });
      excessSavingsResult = { amount: excessSavingsPart, newBalance: updatedExc.balance };
    }

    // Apply bundled product-loan / rental payments. Same OR ties
    // every receipt back to the single piece of paper the cashier
    // handed the member.
    const productLoanResults = [];
    for (const { doc, amount } of productLoanPayments) {
      doc.payments.push({
        orNo,
        amount,
        method,
        paidAt: new Date(),
        receivedBy,
        note: `Bundled with loan OR ${orNo}`,
      });
      doc.totalPaid = round2((doc.totalPaid || 0) + amount);
      doc.balance = round2((doc.balance || 0) - amount);
      if (doc.balance <= 0) {
        doc.status = doc.transactionType === "rental" ? "returned" : "fully_paid";
      }
      await doc.save();
      productLoanResults.push({
        id: String(doc._id),
        productName: doc.productName,
        transactionType: doc.transactionType,
        applied: amount,
        newBalance: doc.balance,
        status: doc.status,
      });
    }

    // Bundled savings deposit (single OR, suffixed tx OR for uniqueness).
    let savingsResult = null;
    if (savingsDeposit > 0 && savingsAccountForBundle) {
      const updated = await SavingsAccount.findOneAndUpdate(
        { _id: savingsAccountForBundle._id },
        { $inc: { balance: savingsDeposit } },
        { new: true }
      );
      const savingsTx = await SavingsTransaction.create({
        pnNo: loan.borrowerPnNo,
        type: "deposit",
        amount: savingsDeposit,
        orNo: `${orNo}-SAV`,
        method,
        receivedBy,
        balanceAfter: round2(updated.balance),
        note: `Bundled with loan OR ${orNo}`,
        bundledWithOr: orNo,
      });
      savingsResult = { tx: savingsTx, newBalance: updated.balance };
    }

    // Direct CBU contribution (separate from excess).
    let cbuContributionResult = null;
    if (cbuContribution > 0) {
      const member = await WaterMember.findOne({ pnNo: String(loan.borrowerPnNo || "").toUpperCase() });
      if (member) {
        const newBal = await creditCbu({
          member, amount: cbuContribution, source: "cashier_contribution", refOrNo: orNo,
          loanPaymentId: payment._id, postedBy: receivedBy,
          note: `Direct CBU contribution bundled with OR ${orNo}`,
        });
        cbuContributionResult = { amount: cbuContribution, newBalance: newBal };
      }
    }

    res.status(201).json({
      ok: true,
      message: cbuExcess > 0
        ? `Posted ₱${totalDue} for ${upcoming.length} period(s)${productLoanTotal > 0 ? ` + ₱${productLoanTotal} (product loans)` : ""}${savingsDeposit > 0 ? ` + ₱${savingsDeposit} (savings)` : ""}${cbuContribution > 0 ? ` + ₱${cbuContribution} (CBU)` : ""}. Excess ₱${cbuExcess} → CBU (new balance ₱${newCbuBalance}).`
        : `Posted ₱${totalDue} for ${upcoming.length} period(s)${productLoanTotal > 0 ? ` + ₱${productLoanTotal} (product loans)` : ""}${savingsDeposit > 0 ? ` + ₱${savingsDeposit} (savings)` : ""}${cbuContribution > 0 ? ` + ₱${cbuContribution} (CBU)` : ""}.`,
      payment, cbuExcess: excessCbuPart, totalExcess: cbuExcess, newCbuBalance, periodsCovered: upcoming.length, totalDue,
      principalPaid, interestPaid,
      // Per-period capital/interest split so the receipt can itemise it.
      periodBreakdown: upcoming.map((r, i) => ({
        period: Number(r.period ?? periodNumbers[i]),
        payment: round2(Number(r.payment) || 0),
        principal: round2(Number(r.principal) || 0),
        interest: round2(Number(r.interest) || 0),
        balance: round2(Number(r.balance) || 0),
      })),
      excessSavings: excessSavingsResult,
      productLoanPayments: productLoanResults,
      productLoanTotal,
      savingsDeposit: savingsResult,
      cbuContribution: cbuContributionResult,
    });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "OR number is already in use." });
    console.error("pay-loan error:", e);
    res.status(500).json({ message: e.message || "Payment failed." });
  }
});

// ----------------------------------------------------------------------
// POST /api/cashier/sale-cart — multi-product counter sale on ONE OR.
// Body: { items: [{ productId, quantity }], orNo, method, remarks,
//         pnNo | (customerName, customerContact) }
// Creates one sale record per line (sharing the OR — line 2+ get an
// internal "#n" suffix so each row stays uniquely traceable), decrements
// stock per line, and (for member savings) debits the grand total once.
// ----------------------------------------------------------------------
router.post("/sale-cart", ...payGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const rawItems = Array.isArray(b.items) ? b.items : [];
    const orNo = String(b.orNo || "").toUpperCase().trim();
    const method = String(b.method || "cash").toLowerCase();
    const remarks = String(b.remarks || "");
    if (rawItems.length === 0) return res.status(400).json({ message: "Add at least one product to the cart." });
    if (!orNo) return res.status(400).json({ message: "OR number is required for sales." });

    // Member vs walk-in.
    const pnNo = String(b.pnNo || "").toUpperCase().trim();
    let member = null;
    if (pnNo) {
      member = await WaterMember.findOne({ pnNo });
      if (!member) return res.status(404).json({ message: `Member ${pnNo} not found.` });
    }
    const customerName = String(b.customerName || "").trim();
    const customerContact = String(b.customerContact || "").trim();
    if (!member && !customerName) return res.status(400).json({ message: "Enter a member Account Number or a walk-in customer name." });

    // OR must be unused across all product transactions.
    const dup = await ProductLoanApplication.findOne({ "payments.orNo": orNo }).select("_id").lean();
    if (dup) return res.status(409).json({ message: `OR ${orNo} already used on a product transaction.` });

    // Resolve + validate every line (merge duplicate productIds, check stock).
    const merged = new Map();
    for (const it of rawItems) {
      const id = String(it?.productId || "");
      const qty = Math.max(1, Math.floor(Number(it?.quantity) || 1));
      if (!id) continue;
      merged.set(id, (merged.get(id) || 0) + qty);
    }
    const lines = [];
    for (const [id, qty] of merged.entries()) {
      const product = await ProductLoanCatalog.findById(id);
      if (!product) return res.status(404).json({ message: "A product in the cart no longer exists." });
      if (!product.isActive) return res.status(400).json({ message: `${product.name} is inactive.` });
      if (product.stock > 0 && qty > product.stock) return res.status(400).json({ message: `Insufficient stock for ${product.name} (only ${product.stock} left).` });
      const unitPrice = round2(product.unitPrice);
      lines.push({ product, qty, unitPrice, total: round2(unitPrice * qty) });
    }
    const grandTotal = round2(lines.reduce((s, l) => s + l.total, 0));

    const receivedBy = req.user?.fullName || req.user?.employeeId || "";
    const now = new Date();

    // Member savings payment: debit the grand total ONCE (race-safe) + ledger.
    let savingsRollback = null;
    if (method === "savings") {
      if (!member) return res.status(400).json({ message: "Savings payment needs a member Account Number." });
      const acct = await SavingsAccount.findOne({ pnNo: member.pnNo });
      if (!acct || acct.status === "closed") return res.status(400).json({ message: "Member has no active savings account." });
      const updated = await SavingsAccount.findOneAndUpdate(
        { _id: acct._id, balance: { $gte: grandTotal } },
        { $inc: { balance: -grandTotal } },
        { new: true }
      );
      if (!updated) return res.status(409).json({ message: `Insufficient savings (needs ₱${grandTotal}).` });
      try {
        await SavingsTransaction.create({
          pnNo: member.pnNo, type: "withdrawal", amount: grandTotal, orNo, method: "other",
          balanceAfter: round2(updated.balance), receivedBy,
          note: `Cart sale (${lines.length} item${lines.length === 1 ? "" : "s"})`,
        });
        savingsRollback = { acctId: acct._id, amount: grandTotal, orNo };
      } catch (e) {
        await SavingsAccount.updateOne({ _id: acct._id }, { $inc: { balance: grandTotal } });
        throw e;
      }
    }

    // Create one sale doc per line. First line keeps the exact OR; the rest
    // get a "#n" suffix so payments.orNo stays unique but ties to the receipt.
    const created = [];
    try {
      let i = 0;
      for (const l of lines) {
        i += 1;
        const lineOr = i === 1 ? orNo : `${orNo}#${i}`;
        const unitCapital = round2(l.product.capital || 0);
        const doc = await ProductLoanApplication.create({
          pnNo: member?.pnNo || "",
          accountName: member?.accountName || "",
          customerName: member ? "" : customerName,
          customerContact: member ? "" : customerContact,
          transactionType: "sale",
          productId: l.product._id,
          productName: l.product.name,
          productCategory: l.product.category,
          quantity: l.qty,
          unitPrice: l.unitPrice,
          totalPrice: l.total,
          unitCapital,
          totalCapital: round2(unitCapital * l.qty),
          profitRecorded: round2(l.total - round2(unitCapital * l.qty)),
          balance: 0,
          totalPaid: l.total,
          payments: [{
            orNo: lineOr, amount: l.total, method, paidAt: now, receivedBy,
            note: `${member ? `Member cart sale — ${member.accountName}` : "Walk-in cart sale"}${method === "savings" ? " (paid via savings)" : ""}${i > 1 ? ` [OR ${orNo}]` : ""}`,
          }],
          status: "fully_paid",
          approvedAt: now, approvedBy: receivedBy, releasedAt: now, releasedBy: receivedBy,
          remarks,
        });
        created.push(doc);
        if (l.product.stock > 0) await ProductLoanCatalog.findByIdAndUpdate(l.product._id, { $inc: { stock: -l.qty } });
      }
    } catch (e) {
      // Best-effort rollback: remove any docs created + refund savings.
      for (const d of created) {
        try { if (d.product?.stock > 0) await ProductLoanCatalog.findByIdAndUpdate(d.productId, { $inc: { stock: d.quantity } }); } catch { /* ignore */ }
        try { await ProductLoanApplication.deleteOne({ _id: d._id }); } catch { /* ignore */ }
      }
      if (savingsRollback) {
        await SavingsAccount.updateOne({ _id: savingsRollback.acctId }, { $inc: { balance: savingsRollback.amount } });
        await SavingsTransaction.deleteOne({ orNo: savingsRollback.orNo, type: "withdrawal" });
      }
      if (e?.code === 11000) return res.status(409).json({ message: `OR ${orNo} already used.` });
      throw e;
    }

    res.status(201).json({
      ok: true,
      orNo,
      method,
      total: grandTotal,
      itemCount: lines.length,
      customer: member ? { pnNo: member.pnNo, accountName: member.accountName } : { customerName },
      items: lines.map((l) => ({ productName: l.product.name, quantity: l.qty, unitPrice: l.unitPrice, total: l.total })),
    });
  } catch (e) {
    console.error("sale-cart error:", e);
    res.status(500).json({ message: e.message || "Failed to post sale." });
  }
});

// ─── Loan disbursement (Phase 7) ────────────────────────────────────
// Today's physical drawer position — same formula the collections
// endpoint exposes as drawerNet. Recomputed here so the sufficiency
// check can't be spoofed by a stale client.
// Cash received on PRODUCT transactions today (sales, product-loan /
// rental payments, and the bundled portions riding water/loan ORs —
// those land in payments[] only, never in WaterPayment/LoanPayment
// amounts, so this is their single source of truth for drawer math).
async function productCashToday(start, end) {
  const agg = await ProductLoanApplication.aggregate([
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: start, $lt: end }, "payments.method": { $ne: "online" } } },
    { $group: { _id: null, total: { $sum: "$payments.amount" }, count: { $sum: 1 } } },
  ]);
  return { total: Number(agg[0]?.total || 0), count: Number(agg[0]?.count || 0) };
}

async function drawerNetToday() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const inRange = { paidAt: { $gte: start, $lt: end } };
  const [water, loans, savings, expenses, drawerMoves] = await Promise.all([
    WaterPayment.find(inRange).select("method amountPaid cbuExcess").lean(),
    LoanPayment.find(inRange).select("method amountPaid cbuExcess").lean(),
    (await import("../models/SavingsTransaction.js")).default.aggregate([
      { $match: { ...inRange, orNo: { $not: /^(INT|ADJ)-/ } } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]),
    Expense.aggregate([
      { $match: { status: "disbursed", paymentMethod: "cash", disbursedAt: { $gte: start, $lt: end } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    TreasuryTransaction.aggregate([
      { $match: { target: "drawer", createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]),
  ]);
  const cashOf = (docs) => docs.filter((d) => d.method !== "online")
    .reduce((s, d) => s + (Number(d.amountPaid) || 0) + (Number(d.cbuExcess) || 0), 0);
  let savIn = 0, savOut = 0;
  for (const r of savings) r._id === "deposit" ? (savIn = r.total) : (savOut = r.total);
  let trIn = 0, trOut = 0;
  for (const r of drawerMoves) r._id === "in" ? (trIn = r.total) : (trOut = r.total);
  const disbursed = Number(expenses[0]?.total || 0);
  const product = await productCashToday(start, end);
  return round2(cashOf(water) + cashOf(loans) + product.total + savIn - savOut - disbursed + trIn - trOut);
}

// Full drawer reconciliation for the cashier Cash Drawer tab:
// every inflow and outflow component separated + totals.
router.get("/drawer-summary", requireAuth, requireRole(["admin", "manager", "audit_committee", "cashier", "bookkeeper"]), async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const inRange = { paidAt: { $gte: start, $lt: end } };
    const SavingsTx = (await import("../models/SavingsTransaction.js")).default;
    const MemberFee = (await import("../models/MemberFeeRequest.js")).default;

    const [water, loans, savingsAgg, feeAgg, expenseAgg, drawerRows, product] = await Promise.all([
      WaterPayment.find(inRange).select("method amountPaid cbuExcess").lean(),
      LoanPayment.find(inRange).select("method amountPaid cbuExcess").lean(),
      SavingsTx.aggregate([
        { $match: { ...inRange, orNo: { $not: /^(INT|ADJ)-/ } } },
        { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      MemberFee.aggregate([
        { $match: { status: "paid", paidAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
      ]),
      Expense.aggregate([
        { $match: { status: "disbursed", paymentMethod: "cash", disbursedAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      TreasuryTransaction.find({ target: "drawer", createdAt: { $gte: start, $lt: end } })
        .sort({ createdAt: -1 }).select("type amount note refNo by createdAt").lean(),
      productCashToday(start, end),
    ]);

    const split = (docs) => {
      const cash = docs.filter((d) => d.method !== "online");
      return {
        bill: round2(cash.reduce((t, d) => t + (Number(d.amountPaid) || 0), 0)),
        cbu: round2(cash.reduce((t, d) => t + (Number(d.cbuExcess) || 0), 0)),
        count: cash.length,
        online: round2(docs.filter((d) => d.method === "online").reduce((t, d) => t + (Number(d.amountPaid) || 0) + (Number(d.cbuExcess) || 0), 0)),
      };
    };
    const w = split(water);
    const l = split(loans);
    let savIn = 0, savInCount = 0, savOut = 0, savOutCount = 0;
    for (const r of savingsAgg) {
      if (r._id === "deposit") { savIn = round2(r.total); savInCount = r.count; }
      else { savOut = round2(r.total); savOutCount = r.count; }
    }
    // Member fees already arrive as drawer treasury IN rows — surfaced
    // separately for display, NOT re-added in the totals.
    const fees = { total: round2(feeAgg[0]?.total || 0), count: Number(feeAgg[0]?.count || 0) };
    const expenseCash = { total: round2(expenseAgg[0]?.total || 0), count: Number(expenseAgg[0]?.count || 0) };
    let trIn = 0, trOut = 0;
    for (const r of drawerRows) {
      if (r.type === "in") trIn += Number(r.amount) || 0;
      else trOut += Number(r.amount) || 0;
    }
    trIn = round2(trIn); trOut = round2(trOut);

    const totalIn = round2(w.bill + w.cbu + l.bill + l.cbu + product.total + savIn + trIn);
    const totalOut = round2(savOut + expenseCash.total + trOut);
    res.json({
      date: start.toISOString().slice(0, 10),
      inflows: {
        waterBill: w.bill, waterCbu: w.cbu, waterCount: w.count,
        loanBill: l.bill, loanCbu: l.cbu, loanCount: l.count,
        product: round2(product.total), productCount: product.count,
        savingsIn: savIn, savingsInCount: savInCount,
        treasuryIn: trIn,
        memberFees: fees.total, memberFeeCount: fees.count,
      },
      outflows: {
        savingsOut: savOut, savingsOutCount: savOutCount,
        expenseCash: expenseCash.total, expenseCashCount: expenseCash.count,
        treasuryOut: trOut,
      },
      totals: { in: totalIn, out: totalOut, net: round2(totalIn - totalOut), online: round2(w.online + l.online) },
      drawerLedger: drawerRows,
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to load drawer summary." });
  }
});

// Queue of loans the loan officer released for payout.
router.get("/loan-disbursements", ...payGuard, async (req, res) => {
  const [items, drawer, bankAccounts] = await Promise.all([
    LoanApplication.find({ status: "for_disbursement" })
      .select("loanId borrowerName borrowerPnNo principal totalCharges netProceeds releasedBy approvedBy managerApprovedBy createdAt")
      .sort({ createdAt: 1 })
      .lean(),
    drawerNetToday(),
    BankAccount.find({ status: "active" }).select("bankName accountNumber balance").lean(),
  ]);
  res.json({ items, drawerNet: drawer, bankAccounts });
});

// Pay out the net proceeds. Refuses when today's drawer can't cover it
// (operator rule: request cash from the vault first). On success the
// loan becomes "released": due dates are stamped from TODAY (money in
// the borrower's hand is when the clock starts) and the drawer ledger
// records the outflow.
router.post("/disburse-loan", ...payGuard, async (req, res) => {
  try {
    const loanId = String(req.body?.loanId || "").trim();
    const orNo = String(req.body?.orNo || "").trim().toUpperCase();
    if (!loanId) return res.status(400).json({ message: "loanId is required." });
    if (!orNo) return res.status(400).json({ message: "OR / voucher number is required." });

    // Release method: cash (drawer) | bank | check. Bank/cheque send
    // the proceeds to the borrower from a coop bank account instead of
    // the drawer; cheque also records a cheque number.
    const method = ["cash", "bank", "check"].includes(req.body?.method) ? req.body.method : "cash";
    const bankAccountId = String(req.body?.bankAccountId || "");
    const chequeNumber = String(req.body?.chequeNumber || "").trim();

    const loan = await LoanApplication.findOne({ loanId });
    if (!loan) return res.status(404).json({ message: "Loan not found." });
    if (loan.status !== "for_disbursement") {
      return res.status(409).json({ message: `Loan is ${loan.status} — only for_disbursement loans can be paid out.` });
    }
    const net = round2(Number(loan.netProceeds) || (Number(loan.principal) || 0) - (Number(loan.totalCharges) || 0));
    if (!(net > 0)) return res.status(400).json({ message: "Net proceeds compute to ₱0 — check the loan's charges." });

    // Funds-source check up front. Cash → drawer; bank/cheque → the
    // selected coop bank account (must hold enough).
    let drawer = 0;
    let bankAcct = null;
    if (method === "cash") {
      drawer = await drawerNetToday();
      if (drawer < net) {
        return res.status(400).json({
          message: `Insufficient cash drawer (₱${drawer.toLocaleString()} available, need ₱${net.toLocaleString()}). Request cash from the Cash Vault first (Treasury tab).`,
        });
      }
    } else {
      if (!bankAccountId) return res.status(400).json({ message: "Pick the bank account to release from." });
      if (method === "check" && !chequeNumber) return res.status(400).json({ message: "Cheque number is required." });
      bankAcct = await BankAccount.findOne({ _id: bankAccountId, status: "active" }).lean();
      if (!bankAcct) return res.status(400).json({ message: "Bank account not found." });
      if (Number(bankAcct.balance) < net) {
        return res.status(400).json({ message: `Insufficient balance in ${bankAcct.bankName} (₱${Number(bankAcct.balance).toLocaleString()} available, need ₱${net.toLocaleString()}).` });
      }
    }

    const who = req.user?.fullName || req.user?.employeeId || "";
    // Atomic claim — two cashiers can't both pay the same loan.
    const setFields = {
      status: "released", disbursedBy: who, disbursedAt: new Date(), disbursementOr: orNo,
      releasedAt: new Date(), disbursementMethod: method,
    };
    if (bankAcct) setFields.disbursementBank = `${bankAcct.bankName} ····${String(bankAcct.accountNumber).slice(-4)}`;
    if (method === "check") setFields.disbursementCheque = chequeNumber;
    const claimed = await LoanApplication.findOneAndUpdate(
      { _id: loan._id, status: "for_disbursement" },
      { $set: setFields },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: "Already disbursed by someone else." });

    // Stamp first-payment/maturity/due dates from the actual payout date.
    const start = new Date(claimed.releasedAt);
    const first = new Date(start); first.setMonth(first.getMonth() + 1);
    const maturity = new Date(start); maturity.setMonth(maturity.getMonth() + Number(claimed.termMonths || 1));
    claimed.firstPaymentDate = first;
    claimed.maturityDate = maturity;
    claimed.amortizationSchedule = (claimed.amortizationSchedule || []).map((row, i) => {
      const r = typeof row.toObject === "function" ? row.toObject() : { ...row };
      const dd = new Date(start); dd.setMonth(dd.getMonth() + (i + 1));
      r.dueDate = dd;
      return r;
    });
    await claimed.save();

    if (method === "cash") {
      await TreasuryTransaction.create({
        target: "drawer", type: "out", amount: net, balanceAfter: null, refNo: orNo, by: who,
        note: `Loan disbursement ${claimed.loanId} — net proceeds to ${claimed.borrowerName} (cash)`,
      });
    } else {
      // Debit the bank account atomically (conditional — can't overdraw)
      // and record a bank OUT ledger row referencing the cheque/OR.
      const updatedAcct = await BankAccount.findOneAndUpdate(
        { _id: bankAcct._id, balance: { $gte: net } },
        { $inc: { balance: -net } },
        { new: true }
      );
      if (!updatedAcct) {
        // Balance moved under us — roll the loan back to the queue.
        await LoanApplication.updateOne({ _id: claimed._id }, { $set: { status: "for_disbursement", disbursedBy: "", disbursedAt: null, disbursementOr: "" } });
        return res.status(409).json({ message: "Bank balance changed — try again." });
      }
      await TreasuryTransaction.create({
        target: "bank", bankAccountId: updatedAcct._id, type: "out", amount: net,
        balanceAfter: round2(updatedAcct.balance),
        refNo: method === "check" ? chequeNumber : orNo, by: who,
        note: `Loan disbursement ${claimed.loanId} — ${claimed.borrowerName} via ${method === "check" ? "cheque " + chequeNumber : "bank transfer"}`,
      });
    }

    res.json({
      ok: true, loan: claimed.toObject(), netProceeds: net, method,
      drawerAfter: method === "cash" ? round2(drawer - net) : undefined,
    });
  } catch (e) {
    console.error("disburse-loan error:", e);
    res.status(500).json({ message: e.message || "Disbursement failed." });
  }
});

// ─── Payroll disbursement (Phase 5) ─────────────────────────────────
router.get("/payroll-disbursements", ...payGuard, async (req, res) => {
  const [items, drawer] = await Promise.all([
    Payroll.find({ status: "approved" })
      .select("employeeName employeeCode position type notes periodStart periodEnd payDate rateType rate daysWorked basicPay overtimePay allowances grossPay sss philhealth pagibig withholdingTax otherDeductions totalDeductions netPay recordedBy approvedBy approvedAt")
      .sort({ createdAt: 1 }).lean(),
    drawerNetToday(),
  ]);
  res.json({ items, drawerNet: drawer });
});

router.post("/disburse-payroll", ...payGuard, async (req, res) => {
  try {
    const orNo = String(req.body?.orNo || "").trim().toUpperCase();
    if (!orNo) return res.status(400).json({ message: "OR / voucher number is required." });
    const receivedBy = String(req.body?.receivedBy || "").trim();
    const slip = await Payroll.findById(req.body?.id);
    if (!slip) return res.status(404).json({ message: "Payslip not found." });
    if (slip.status !== "approved") return res.status(409).json({ message: `Payslip is ${slip.status} — manager approval first.` });
    const net = round2(Number(slip.netPay) || 0);
    if (!(net > 0)) return res.status(400).json({ message: "Net pay is ₱0." });
    const drawer = await drawerNetToday();
    if (drawer < net) {
      return res.status(400).json({ message: `Insufficient cash drawer (₱${drawer.toLocaleString()} available, need ₱${net.toLocaleString()}). Request cash from the Cash Vault first.` });
    }
    const who = req.user?.fullName || req.user?.employeeId || "";
    const claimed = await Payroll.findOneAndUpdate(
      { _id: slip._id, status: "approved" },
      { $set: { status: "disbursed", disbursedBy: who, disbursedAt: new Date(), disbursementOr: orNo, receivedBy: receivedBy || slip.employeeName } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: "Already disbursed." });
    await TreasuryTransaction.create({
      target: "drawer", type: "out", amount: net, balanceAfter: null, refNo: orNo, by: who,
      note: `${claimed.type === "cash_advance" ? "Cash advance" : "Payroll"} — ${claimed.employeeName}`,
    });
    res.json({ ok: true, slip: claimed.toObject(), drawerAfter: round2(drawer - net) });
  } catch (e) {
    res.status(500).json({ message: e.message || "Disbursement failed." });
  }
});

// ─── New-member fees (Phase 9) ──────────────────────────────────────
router.get("/member-fees", ...payGuard, async (req, res) => {
  const items = await MemberFeeRequest.find({ status: "pending" }).sort({ createdAt: 1 }).lean();
  res.json({ items });
});

router.post("/pay-member-fee", ...payGuard, async (req, res) => {
  try {
    const orNo = String(req.body?.orNo || "").trim().toUpperCase();
    if (!orNo) return res.status(400).json({ message: "OR number is required." });
    const dup = await MemberFeeRequest.findOne({ orNo }).lean();
    if (dup) return res.status(409).json({ message: `OR ${orNo} already used on a member fee.` });
    const who = req.user?.fullName || req.user?.employeeId || "";
    const claimed = await MemberFeeRequest.findOneAndUpdate(
      { _id: req.body?.id, status: "pending" },
      { $set: { status: "paid", orNo, paidBy: who, paidAt: new Date() } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: "Fee request is not pending." });
    await TreasuryTransaction.create({
      target: "drawer", type: "in", amount: claimed.total, balanceAfter: null,
      refNo: orNo, by: who,
      note: `New-member fees ${claimed.pnNo} (${claimed.accountName}): membership ₱${claimed.membershipFee} + tapping ₱${claimed.tappingFee}`,
    });
    res.json({ ok: true, fee: claimed });
  } catch (e) {
    res.status(500).json({ message: e.message || "Payment failed." });
  }
});

export default router;
