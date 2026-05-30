import express from "express";
import PaymentSettings from "../../models/PaymentSettings.js";
import OnlinePayment from "../../models/OnlinePayment.js";
import WaterBill from "../../models/WaterBill.js";
import LoanApplication from "../../models/LoanApplication.js";
import { createPaymongoCheckout, createXenditInvoice } from "../../utils/paymentProviders.js";

const router = express.Router();
const ceilPeso = (n) => Math.ceil(Number(n) || 0);

function successUrl() {
  const first = (process.env.CLIENT_ORIGIN || "https://powassco.site").split(",")[0].trim().replace(/\/+$/, "");
  return `${first}/inquiry?paid=1`;
}

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

// Realtime: create a hosted PSP checkout (PayMongo / Xendit) and return the
// URL to redirect the payer to. The PSP confirms payment via the webhook
// (auto-posts to the bill/loan). Activates only when an admin saved valid
// keys + toggled "Activate realtime" in Payment Settings.
router.post("/create-checkout", async (req, res) => {
  const s = await getSettings();
  if (s.onlineEnabled === false) return res.status(403).json({ message: "Online payments are temporarily unavailable. Please pay at the office." });
  if (s.mode === "manual" || !s.pspActive) {
    return res.status(400).json({ message: "Realtime online payment is not active. Use the manual QR option." });
  }

  const b = req.body || {};
  const fee = Number(s.onlineFee) || 0;
  let identity, amountDue, description, doc, externalId;

  if (b.module === "water") {
    const pnNo = String(b.pnNo || "").toUpperCase().trim();
    const meterNumber = String(b.meterNumber || "").toUpperCase().trim();
    const periodKey = String(b.periodKey || "").trim();
    const bill = await WaterBill.findOne({ pnNo, meterNumber, periodKey });
    if (!bill) return res.status(404).json({ message: "Bill not found." });
    if (bill.status === "paid") return res.status(400).json({ message: "This bill is already paid." });
    amountDue = ceilPeso(bill.totalDue);
    description = `POWASSCO water bill ${periodKey} • ${meterNumber}`;
    externalId = `PW-W-${pnNo}-${meterNumber}-${periodKey}-${Date.now()}`;
    identity = { module: "water", billId: bill._id, pnNo, meterNumber, periodKey, accountName: bill.accountName };
  } else if (b.module === "loan") {
    const loanId = String(b.loanId || "").trim();
    const loan = await LoanApplication.findOne({ loanId });
    if (!loan) return res.status(404).json({ message: "Loan not found." });
    if ((loan.balance || 0) <= 0) return res.status(400).json({ message: "This loan has no outstanding balance." });
    amountDue = ceilPeso(Number(b.amountDue || loan.balance || 0));
    description = `POWASSCO loan payment • ${loanId}`;
    externalId = `PW-L-${loanId}-${Date.now()}`;
    identity = { module: "loan", applicationId: loan._id, loanId, borrowerName: loan.borrowerName };
  } else {
    return res.status(400).json({ message: "Invalid payment type." });
  }

  const amountToPay = amountDue + fee;
  try {
    const { url, providerRef } = s.mode === "paymongo"
      ? await createPaymongoCheckout({ secretKey: s.paymongoSecretKey, amountPhp: amountToPay, description, referenceNumber: externalId, successUrl: successUrl() })
      : await createXenditInvoice({ apiKey: s.xenditApiKey, amountPhp: amountToPay, description, externalId, successUrl: successUrl() });

    await OnlinePayment.create({
      ...identity,
      amountDue, fee, amountToPay,
      referenceId: externalId, amountPaid: amountToPay,
      payerName: String(b.payerName || "").trim(),
      provider: s.mode, providerRef, checkoutUrl: url, status: "pending",
    });
    res.json({ url });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "A checkout is already in progress for this transaction." });
    res.status(502).json({ message: e.message || "Could not create checkout." });
  }
});

export default router;
