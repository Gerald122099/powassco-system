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
    mode: s.mode,
    realtime: s.mode !== "manual" && s.pspActive,
    qrImage: s.qrImage,
    onlineFee: s.onlineFee,
    payeeName: s.payeeName,
    instructions: s.instructions,
  });
});

// Submit an online payment (becomes pending → officer verifies).
router.post("/submit", async (req, res) => {
  const b = req.body || {};
  const referenceId = String(b.referenceId || "").trim();
  if (!referenceId) return res.status(400).json({ message: "Reference / transaction ID is required." });

  // Don't allow re-using a reference that's pending/verified.
  const dup = await OnlinePayment.findOne({ referenceId, status: { $ne: "rejected" } });
  if (dup) return res.status(409).json({ message: "This reference/transaction ID was already submitted." });

  const s = await getSettings();
  const fee = Number(s.onlineFee) || 0;

  if (b.module === "water") {
    const pnNo = String(b.pnNo || "").toUpperCase().trim();
    const meterNumber = String(b.meterNumber || "").toUpperCase().trim();
    const periodKey = String(b.periodKey || "").trim();
    const bill = await WaterBill.findOne({ pnNo, meterNumber, periodKey });
    if (!bill) return res.status(404).json({ message: "Bill not found for that meter/period." });
    if (bill.status === "paid") return res.status(400).json({ message: "This bill is already paid." });
    const amountDue = ceilPeso(bill.totalDue);
    await OnlinePayment.create({
      module: "water", billId: bill._id, pnNo, meterNumber, periodKey, accountName: bill.accountName,
      amountDue, fee, amountToPay: amountDue + fee, referenceId,
      amountPaid: Number(b.amountPaid) || amountDue + fee, payerName: b.payerName || "", payerPhone: b.payerPhone || "",
    });
    return res.status(201).json({ ok: true, message: "Payment submitted. It will be verified and posted within 2–3 working days." });
  }

  if (b.module === "loan") {
    const loanId = String(b.loanId || "").trim();
    const loan = await LoanApplication.findOne({ loanId });
    if (!loan) return res.status(404).json({ message: "Loan not found." });
    if ((loan.balance || 0) <= 0) return res.status(400).json({ message: "This loan has no outstanding balance." });
    const amountDue = ceilPeso(Number(b.amountDue || loan.balance || 0));
    await OnlinePayment.create({
      module: "loan", applicationId: loan._id, loanId, borrowerName: loan.borrowerName,
      amountDue, fee, amountToPay: amountDue + fee, referenceId,
      amountPaid: Number(b.amountPaid) || amountDue + fee, payerName: b.payerName || "", payerPhone: b.payerPhone || "",
    });
    return res.status(201).json({ ok: true, message: "Payment submitted. It will be verified and posted within 2–3 working days." });
  }

  return res.status(400).json({ message: "Invalid payment type." });
});

export default router;
