import express from "express";
import PaymentSettings from "../../models/PaymentSettings.js";
import OnlinePayment from "../../models/OnlinePayment.js";
import WaterBill from "../../models/WaterBill.js";
import LoanApplication from "../../models/LoanApplication.js";

const router = express.Router();
const ceilPeso = (n) => Math.ceil(Number(n) || 0);

async function getSettings() {
  let s = await PaymentSettings.findOne();
  if (!s) s = await PaymentSettings.create({});
  return s;
}

// Mode + QR + fee for the public pay screen (never exposes PSP secrets).
router.get("/info", async (req, res) => {
  const s = await getSettings();
  res.json({
    onlineEnabled: s.onlineEnabled !== false,
    mode: s.mode,
    realtime: s.mode !== "manual" && s.pspActive,
    qrImage: s.qrImage,
    onlineFee: s.onlineFee,
    payeeName: s.payeeName,
    instructions: s.instructions,
  });
});

// Submit an online payment (becomes pending → officer verifies).
// Idempotent: the reference is globally unique, so a refresh / double-submit
// never creates a duplicate or posts twice. Nothing is applied to the bill/
// loan here — only the officer's verify step posts the payment.
router.post("/submit", async (req, res) => {
  const b = req.body || {};
  const referenceId = String(b.referenceId || "").trim();
  if (!referenceId) return res.status(400).json({ message: "Reference / transaction ID is required." });

  const s = await getSettings();
  if (s.onlineEnabled === false) {
    return res.status(403).json({ message: "Online payments are temporarily unavailable. Please pay at the office (walk-in)." });
  }

  // One record per real transaction. A repeat submit (refresh/double-click)
  // is recognized and not duplicated.
  const existing = await OnlinePayment.findOne({ referenceId }).lean();
  if (existing) {
    const msg =
      existing.status === "verified"
        ? "This payment was already verified and posted. No need to resubmit."
        : existing.status === "rejected"
        ? "This reference was reviewed and couldn't be matched. If you made a new payment, submit its new reference number."
        : "We already received this reference and it's being verified. No need to resubmit.";
    return res.status(409).json({ message: msg });
  }

  // Manual QR requires a receipt screenshot for the officer to verify against.
  const receiptImage = String(b.receiptImage || "");
  if (s.mode === "manual" && !receiptImage) {
    return res.status(400).json({ message: "Please attach a screenshot of your payment receipt." });
  }
  if (receiptImage.length > 1500000) {
    return res.status(413).json({ message: "Receipt image is too large — please use a smaller screenshot." });
  }
  const senderName = String(b.payerName || "").trim();
  const fee = Number(s.onlineFee) || 0;
  let doc;

  if (b.module === "water") {
    const pnNo = String(b.pnNo || "").toUpperCase().trim();
    const meterNumber = String(b.meterNumber || "").toUpperCase().trim();
    const periodKey = String(b.periodKey || "").trim();
    const bill = await WaterBill.findOne({ pnNo, meterNumber, periodKey });
    if (!bill) return res.status(404).json({ message: "Bill not found for that meter/period." });
    if (bill.status === "paid") return res.status(400).json({ message: "This bill is already paid." });
    const amountDue = ceilPeso(bill.totalDue);
    doc = {
      module: "water", billId: bill._id, pnNo, meterNumber, periodKey, accountName: bill.accountName,
      amountDue, fee, amountToPay: amountDue + fee, referenceId,
      amountPaid: Number(b.amountPaid) || amountDue + fee, payerName: senderName, receiptImage,
    };
  } else if (b.module === "loan") {
    const loanId = String(b.loanId || "").trim();
    const loan = await LoanApplication.findOne({ loanId });
    if (!loan) return res.status(404).json({ message: "Loan not found." });
    if ((loan.balance || 0) <= 0) return res.status(400).json({ message: "This loan has no outstanding balance." });
    const amountDue = ceilPeso(Number(b.amountDue || loan.balance || 0));
    doc = {
      module: "loan", applicationId: loan._id, loanId, borrowerName: loan.borrowerName,
      amountDue, fee, amountToPay: amountDue + fee, referenceId,
      amountPaid: Number(b.amountPaid) || amountDue + fee, payerName: senderName, receiptImage,
    };
  } else {
    return res.status(400).json({ message: "Invalid payment type." });
  }

  try {
    await OnlinePayment.create(doc);
  } catch (e) {
    if (e?.code === 11000) {
      // Lost a race with a near-simultaneous submit of the same reference.
      return res.status(409).json({ message: "We already received this reference. No need to resubmit." });
    }
    throw e;
  }
  return res.status(201).json({ ok: true, message: "Payment submitted. It will be verified and posted within 2–3 working days." });
});

export default router;
