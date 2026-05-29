import express from "express";
import PaymentSettings from "../models/PaymentSettings.js";
import OnlinePayment from "../models/OnlinePayment.js";
import WaterBill from "../models/WaterBill.js";
import WaterPayment from "../models/WaterPayment.js";
import LoanApplication from "../models/LoanApplication.js";
import LoanPayment from "../models/LoanPayment.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function getSettings() {
  let s = await PaymentSettings.findOne();
  if (!s) s = await PaymentSettings.create({});
  return s;
}

// ---- Admin: QR + fee settings ----
const adminGuard = [requireAuth, requireRole(["admin"])];
router.get("/settings", ...adminGuard, async (req, res) => res.json(await getSettings()));
router.put("/settings", ...adminGuard, async (req, res) => {
  const s = await getSettings();
  const allow = ["mode", "qrImage", "onlineFee", "payeeName", "instructions", "paymongoSecretKey", "paymongoPublicKey", "xenditApiKey", "pspActive"];
  for (const k of allow) if (k in req.body) s[k] = req.body[k];
  s.updatedBy = req.user?.fullName || req.user?.employeeId || "";
  await s.save();
  res.json(s);
});

// ---- Officers: pending online payments to verify ----
const officerGuard = [requireAuth, requireRole(["admin", "water_bill_officer", "loan_officer"])];

function scopeModule(req) {
  if (req.user.role === "water_bill_officer") return "water";
  if (req.user.role === "loan_officer") return "loan";
  return null; // admin: any
}

router.get("/online", ...officerGuard, async (req, res) => {
  const { status = "pending", module = "" } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const scoped = scopeModule(req);
  if (scoped) filter.module = scoped;
  else if (module) filter.module = module;
  const items = await OnlinePayment.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  res.json(items);
});

router.post("/online/:id/verify", ...officerGuard, async (req, res) => {
  const op = await OnlinePayment.findById(req.params.id);
  if (!op) return res.status(404).json({ message: "Payment not found." });
  if (op.status !== "pending") return res.status(400).json({ message: "Already processed." });
  const scoped = scopeModule(req);
  if (scoped && scoped !== op.module) return res.status(403).json({ message: "Not your module to verify." });

  const orNo = String(req.body.orNo || "").trim();
  if (!orNo) return res.status(400).json({ message: "OR number is required." });

  if (op.module === "water") {
    const bill = await WaterBill.findById(op.billId);
    if (!bill) return res.status(404).json({ message: "Bill no longer exists." });
    if (bill.status !== "paid") {
      const dupOr = await WaterPayment.findOne({ orNo });
      if (dupOr) return res.status(409).json({ message: `OR ${orNo} already used.` });
      await WaterPayment.create({
        billId: bill._id, pnNo: bill.pnNo, meterNumber: bill.meterNumber, periodKey: bill.periodKey,
        orNo, method: "online", amountPaid: bill.totalDue,
        discountApplied: bill.discount || 0, penaltyApplied: bill.penaltyApplied || 0,
        classification: bill.classification, receivedBy: req.user?.employeeId || "",
        paidAt: new Date(), notes: `Online payment • ref ${op.referenceId}`,
      });
      bill.status = "paid";
      bill.paidAt = new Date();
      bill.orNo = orNo;
      await bill.save();
    }
  } else {
    const loan = await LoanApplication.findById(op.applicationId);
    if (!loan) return res.status(404).json({ message: "Loan no longer exists." });
    const amt = op.amountDue;
    await LoanPayment.create({
      loanId: loan.loanId, applicationId: loan._id, borrowerPnNo: loan.borrowerPnNo,
      orNo, method: "online", amountPaid: amt, paidAt: new Date(), receivedBy: req.user?.fullName || req.user?.employeeId || "",
    });
    loan.totalPaid = round2(Number(loan.totalPaid || 0) + amt);
    loan.balance = round2(Math.max(0, Number(loan.totalPayment || 0) - loan.totalPaid));
    if (loan.balance <= 0 && loan.status === "released") loan.status = "closed";
    await loan.save();
  }

  op.status = "verified";
  op.orNo = orNo;
  op.verifiedBy = req.user?.fullName || req.user?.employeeId || "";
  op.verifiedAt = new Date();
  await op.save();
  res.json({ ok: true, onlinePayment: op });
});

router.post("/online/:id/reject", ...officerGuard, async (req, res) => {
  const op = await OnlinePayment.findById(req.params.id);
  if (!op) return res.status(404).json({ message: "Payment not found." });
  const scoped = scopeModule(req);
  if (scoped && scoped !== op.module) return res.status(403).json({ message: "Not your module." });
  op.status = "rejected";
  op.rejectionReason = String(req.body.reason || "").trim();
  op.verifiedBy = req.user?.fullName || req.user?.employeeId || "";
  op.verifiedAt = new Date();
  await op.save();
  res.json({ ok: true });
});

export default router;
