// Dual-control balance adjustments (CBU + Savings).
//
//   POST /api/adjustments            — admin files a request
//   GET  /api/adjustments?status=    — admin + bookkeeper list
//   POST /api/adjustments/:id/approve — bookkeeper approves → balance applies
//   POST /api/adjustments/:id/reject  — bookkeeper rejects (no money moves)
//
// Apply semantics on approve:
//   cbu     → $inc WaterMember.cbuBalance ± amount + CbuTransaction row
//             (source "manual_adjust") so the ledger reconciles.
//   savings → conditional $inc SavingsAccount.balance + SavingsTransaction
//             row. Debits are conditional on sufficient balance — a debit
//             that would go negative is rejected with a clear error and
//             the adjustment stays pending (bookkeeper can reject it).

import express from "express";
import BalanceAdjustment from "../models/BalanceAdjustment.js";
import WaterMember from "../models/WaterMember.js";
import CbuTransaction from "../models/CbuTransaction.js";
import SavingsAccount from "../models/SavingsAccount.js";
import SavingsTransaction from "../models/SavingsTransaction.js";
import LoanApplication from "../models/LoanApplication.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const requestGuard = [requireAuth, requireRole(["admin"])];
const reviewGuard = [requireAuth, requireRole(["bookkeeper"])];
const listGuard = [requireAuth, requireRole(["admin", "bookkeeper"])];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const normPN = (s) => String(s || "").toUpperCase().trim();

function makeAdjRef() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ADJ-${stamp}-${rand}`;
}

// ─── File a request (admin) ────────────────────────────────────────
router.post("/", requestGuard, async (req, res) => {
  try {
    const module = String(req.body?.module || "");
    const pnNo = normPN(req.body?.pnNo);
    const type = String(req.body?.type || "");
    const amount = round2(Number(req.body?.amount));
    const reason = String(req.body?.reason || "").trim();
    const refId = String(req.body?.refId || "").trim().toUpperCase();

    if (!["cbu", "savings", "loan"].includes(module)) return res.status(400).json({ message: "module must be cbu, savings, or loan." });
    if (!pnNo) return res.status(400).json({ message: "Account number is required." });
    if (!["credit", "debit"].includes(type)) return res.status(400).json({ message: "type must be credit or debit." });
    if (!(amount > 0)) return res.status(400).json({ message: "Amount must be greater than 0." });
    if (!reason) return res.status(400).json({ message: "A reason is required — it goes on the permanent record." });

    const member = await WaterMember.findOne({ pnNo }).select("pnNo accountName cbuBalance").lean();
    if (!member) return res.status(404).json({ message: `Member ${pnNo} not found.` });

    if (module === "savings") {
      const acct = await SavingsAccount.findOne({ pnNo }).select("status balance").lean();
      if (!acct) return res.status(400).json({ message: "Member has no savings account." });
      if (acct.status === "closed") return res.status(400).json({ message: "Savings account is closed." });
    }
    if (module === "loan") {
      if (!refId) return res.status(400).json({ message: "Loan ID is required for loan adjustments." });
      const loan = await LoanApplication.findOne({ loanId: refId }).select("loanId borrowerPnNo").lean();
      if (!loan) return res.status(404).json({ message: `Loan ${refId} not found.` });
      if (loan.borrowerPnNo !== pnNo) return res.status(400).json({ message: `Loan ${refId} belongs to a different member.` });
    }

    const adj = await BalanceAdjustment.create({
      module,
      pnNo,
      accountName: member.accountName || "",
      refId: module === "loan" ? refId : "",
      type,
      amount,
      reason,
      requestedBy: req.user?.fullName || req.user?.employeeId || "",
    });
    res.status(201).json(adj.toObject());
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to file adjustment." });
  }
});

// ─── List ──────────────────────────────────────────────────────────
router.get("/", listGuard, async (req, res) => {
  try {
    const status = String(req.query.status || "").trim();
    const filter = {};
    if (status) {
      const arr = status.split(",").map((s) => s.trim()).filter(Boolean);
      filter.status = arr.length === 1 ? arr[0] : { $in: arr };
    }
    const items = await BalanceAdjustment.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ message: "Failed to load adjustments." });
  }
});

// ─── Approve (bookkeeper) → apply the balance change ───────────────
router.post("/:id/approve", reviewGuard, async (req, res) => {
  try {
    const reviewNote = String(req.body?.note || "").trim();
    // Atomically claim the pending row so two bookkeeper clicks can't
    // both apply. Only the request that flips pending→approved
    // proceeds to move money.
    const adj = await BalanceAdjustment.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      {
        $set: {
          status: "approved",
          reviewedBy: req.user?.fullName || req.user?.employeeId || "",
          reviewedAt: new Date(),
          reviewNote,
        },
      },
      { new: true }
    );
    if (!adj) return res.status(409).json({ message: "Adjustment is not pending (already reviewed?)." });

    const refOrNo = makeAdjRef();
    const signed = adj.type === "credit" ? adj.amount : -adj.amount;

    try {
      if (adj.module === "cbu") {
        // Debits are conditional so the cached balance can't go negative.
        const cond = adj.type === "debit"
          ? { pnNo: adj.pnNo, cbuBalance: { $gte: adj.amount } }
          : { pnNo: adj.pnNo };
        const updated = await WaterMember.findOneAndUpdate(
          cond,
          { $inc: { cbuBalance: signed } },
          { new: true }
        );
        if (!updated) throw new Error(`CBU balance is below ₱${adj.amount} — cannot debit.`);
        const newBal = round2(Number(updated.cbuBalance) || 0);
        await CbuTransaction.create({
          pnNo: adj.pnNo,
          accountName: adj.accountName,
          type: adj.type,
          amount: adj.amount,
          balanceAfter: newBal,
          source: "manual_adjust",
          refOrNo,
          note: `Dual-control adjustment: ${adj.reason} (requested by ${adj.requestedBy}, approved by ${adj.reviewedBy})`,
          postedBy: adj.reviewedBy,
        });
        adj.balanceBefore = round2(newBal - signed);
        adj.balanceAfter = newBal;
      } else if (adj.module === "loan") {
        // Loan adjustment moves totalPaid (a CREDIT = additional amount
        // recorded as paid → balance shrinks; a DEBIT = paid amount
        // reduced → balance grows). The recompute follows the same
        // balance = totalPayment − totalPaid pattern as every payment
        // path so nothing desyncs.
        const loan = await LoanApplication.findOne({ loanId: adj.refId });
        if (!loan) throw new Error(`Loan ${adj.refId} no longer exists.`);
        if (adj.type === "debit" && Number(loan.totalPaid || 0) < adj.amount) {
          throw new Error(`Loan totalPaid is below ₱${adj.amount} — cannot debit.`);
        }
        await LoanApplication.updateOne(
          { _id: loan._id },
          { $inc: { totalPaid: adj.type === "credit" ? adj.amount : -adj.amount } }
        );
        const fresh = await LoanApplication.findById(loan._id).select("totalPayment totalPaid status");
        const newBalance = round2(Math.max(0, Number(fresh.totalPayment || 0) - Number(fresh.totalPaid || 0)));
        const setOps = { balance: newBalance };
        // Close when fully paid; reopen if a debit re-exposed a balance.
        if (newBalance <= 0 && fresh.status === "released") setOps.status = "closed";
        if (newBalance > 0 && fresh.status === "closed") setOps.status = "released";
        await LoanApplication.updateOne({ _id: loan._id }, { $set: setOps });
        adj.balanceBefore = round2(newBalance + (adj.type === "credit" ? adj.amount : -adj.amount));
        adj.balanceAfter = newBalance;
      } else {
        const cond = adj.type === "debit"
          ? { pnNo: adj.pnNo, status: "active", balance: { $gte: adj.amount } }
          : { pnNo: adj.pnNo, status: "active" };
        const updated = await SavingsAccount.findOneAndUpdate(
          cond,
          { $inc: { balance: signed } },
          { new: true }
        );
        if (!updated) throw new Error(`Savings balance is below ₱${adj.amount} (or account closed) — cannot debit.`);
        const newBal = round2(Number(updated.balance) || 0);
        await SavingsTransaction.create({
          pnNo: adj.pnNo,
          type: adj.type === "credit" ? "deposit" : "withdrawal",
          amount: adj.amount,
          orNo: refOrNo,
          method: "other",
          receivedBy: adj.reviewedBy,
          balanceAfter: newBal,
          paidAt: new Date(),
          note: `Dual-control adjustment: ${adj.reason} (requested by ${adj.requestedBy}, approved by ${adj.reviewedBy})`,
        });
        adj.balanceBefore = round2(newBal - signed);
        adj.balanceAfter = newBal;
      }
    } catch (applyErr) {
      // Roll the claim back to pending so the bookkeeper can reject it
      // explicitly (or retry once the balance allows).
      await BalanceAdjustment.updateOne(
        { _id: adj._id },
        { $set: { status: "pending", reviewedBy: "", reviewedAt: null, reviewNote: "" } }
      );
      return res.status(400).json({ message: applyErr.message });
    }

    adj.appliedRefOrNo = refOrNo;
    await adj.save();
    res.json(adj.toObject());
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to approve adjustment." });
  }
});

// ─── Reject (bookkeeper) ───────────────────────────────────────────
router.post("/:id/reject", reviewGuard, async (req, res) => {
  try {
    const reviewNote = String(req.body?.note || "").trim();
    const adj = await BalanceAdjustment.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      {
        $set: {
          status: "rejected",
          reviewedBy: req.user?.fullName || req.user?.employeeId || "",
          reviewedAt: new Date(),
          reviewNote,
        },
      },
      { new: true }
    );
    if (!adj) return res.status(409).json({ message: "Adjustment is not pending (already reviewed?)." });
    res.json(adj.toObject());
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to reject adjustment." });
  }
});

export default router;
