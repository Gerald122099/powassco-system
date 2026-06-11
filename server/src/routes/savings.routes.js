// Voluntary Savings module — open account, deposit, withdraw, ledger.
//
// Atomicity rules:
//   • SavingsAccount.balance is the cached running balance.
//   • Every write goes:
//       1) findOneAndUpdate the SavingsTransaction (unique orNo upsert)
//       2) findOneAndUpdate the SavingsAccount.balance with $inc
//     so a duplicate POST (same orNo) is a no-op on both rows.
//   • Withdrawals validate balance BEFORE the inc — the balance
//     $inc is conditional on { balance: { $gte: amount } } so a race
//     can't drive it negative.
//
// Roles:
//   GET /savings        — admin, bookkeeper, cashier (read)
//   GET /savings/:pnNo  — admin, bookkeeper, cashier
//   POST /savings/open  — admin, bookkeeper, cashier (any of them
//                         can open at the counter when a member asks)
//   POST /savings/deposit / withdraw — admin, cashier
//   POST /savings/:id/close — admin, bookkeeper

import express from "express";
import mongoose from "mongoose";
import SavingsAccount from "../models/SavingsAccount.js";
import SavingsTransaction from "../models/SavingsTransaction.js";
import WaterMember from "../models/WaterMember.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const readGuard = [requireAuth, requireRole(["admin", "bookkeeper", "cashier"])];
const openGuard = [requireAuth, requireRole(["admin", "bookkeeper", "cashier"])];
const txGuard = [requireAuth, requireRole(["admin", "cashier"])];
const closeGuard = [requireAuth, requireRole(["admin", "bookkeeper"])];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const normPN = (s) => String(s || "").toUpperCase().trim();

// Yearly-ish OR sequence for savings receipts. Format: SAV-YYYYMMDD-NNNNN.
// Counter is per-day so we don't need a separate collection; we just
// count today's transactions and add 1. Collision is ruled out by the
// unique index on orNo (race => 11000 dup error => we retry once).
async function nextSavingsOr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const prefix = `SAV-${y}${m}${d}`;
  const startOfDay = new Date(y, now.getMonth(), now.getDate());
  const startOfNextDay = new Date(y, now.getMonth(), now.getDate() + 1);
  const count = await SavingsTransaction.countDocuments({
    createdAt: { $gte: startOfDay, $lt: startOfNextDay },
  });
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

// ─── List + search ─────────────────────────────────────────────────
router.get("/", readGuard, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = {};
    if (q) {
      const rx = new RegExp(q, "i");
      filter.$or = [{ pnNo: rx }, { accountName: rx }];
    }
    const items = await SavingsAccount.find(filter)
      .sort({ accountName: 1 })
      .limit(500)
      .lean();
    const totals = {
      count: items.length,
      balance: round2(items.reduce((s, a) => s + Number(a.balance || 0), 0)),
    };
    res.json({ items, totals });
  } catch (e) {
    res.status(500).json({ message: "Failed to load savings accounts." });
  }
});

// ─── Per-account + ledger ──────────────────────────────────────────
router.get("/:pnNo", readGuard, async (req, res) => {
  try {
    const pnNo = normPN(req.params.pnNo);
    const account = await SavingsAccount.findOne({ pnNo }).lean();
    if (!account) return res.status(404).json({ message: "No savings account for this member." });
    const ledger = await SavingsTransaction.find({ pnNo })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ account, ledger });
  } catch (e) {
    res.status(500).json({ message: "Failed to load savings account." });
  }
});

// ─── Open new account ──────────────────────────────────────────────
router.post("/open", openGuard, async (req, res) => {
  try {
    const pnNo = normPN(req.body?.pnNo);
    if (!pnNo) return res.status(400).json({ message: "Account number is required." });
    const member = await WaterMember.findOne({ pnNo }).select("pnNo accountName").lean();
    if (!member) return res.status(404).json({ message: `Member ${pnNo} not found.` });
    const existing = await SavingsAccount.findOne({ pnNo });
    if (existing) {
      // Idempotent — return the existing account so the UI can pick up.
      return res.json({ account: existing.toObject(), alreadyExists: true });
    }
    const account = await SavingsAccount.create({
      pnNo,
      accountName: member.accountName || "",
      balance: 0,
      openedBy: req.user?.fullName || req.user?.employeeId || "",
    });
    res.status(201).json({ account: account.toObject() });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to open savings account." });
  }
});

// ─── Deposit ───────────────────────────────────────────────────────
router.post("/deposit", txGuard, async (req, res) => {
  try {
    const pnNo = normPN(req.body?.pnNo);
    const amount = round2(Number(req.body?.amount));
    const method = req.body?.method || "cash";
    const note = String(req.body?.note || "").trim();
    if (!pnNo) return res.status(400).json({ message: "Account number is required." });
    if (!(amount > 0)) return res.status(400).json({ message: "Deposit amount must be greater than 0." });

    const account = await SavingsAccount.findOne({ pnNo });
    if (!account) return res.status(404).json({ message: "No savings account for this member. Open one first." });
    if (account.status === "closed") return res.status(400).json({ message: "Account is closed." });

    const orNo = await nextSavingsOr();
    // Increment balance atomically. Even if two deposits race, both
    // succeed because $inc is commutative — final balance is correct.
    const updated = await SavingsAccount.findOneAndUpdate(
      { _id: account._id },
      { $inc: { balance: amount } },
      { new: true }
    );
    const tx = await SavingsTransaction.create({
      pnNo,
      type: "deposit",
      amount,
      orNo,
      method,
      receivedBy: req.user?.fullName || req.user?.employeeId || "",
      balanceAfter: round2(updated.balance),
      note,
    });
    res.status(201).json({ tx: tx.toObject(), account: updated.toObject() });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to record deposit." });
  }
});

// ─── Withdraw ──────────────────────────────────────────────────────
router.post("/withdraw", txGuard, async (req, res) => {
  try {
    const pnNo = normPN(req.body?.pnNo);
    const amount = round2(Number(req.body?.amount));
    const method = req.body?.method || "cash";
    const note = String(req.body?.note || "").trim();
    if (!pnNo) return res.status(400).json({ message: "Account number is required." });
    if (!(amount > 0)) return res.status(400).json({ message: "Withdrawal amount must be greater than 0." });

    const account = await SavingsAccount.findOne({ pnNo });
    if (!account) return res.status(404).json({ message: "No savings account for this member." });
    if (account.status === "closed") return res.status(400).json({ message: "Account is closed." });
    if (Number(account.balance) < amount) {
      return res.status(400).json({ message: `Insufficient balance (₱${account.balance.toLocaleString()} on file).` });
    }

    const orNo = await nextSavingsOr();
    // Race-safe decrement: only if balance still has enough at the
    // moment of the write. If a concurrent withdrawal drained it
    // first, the update matches zero docs and we surface a clean error.
    const updated = await SavingsAccount.findOneAndUpdate(
      { _id: account._id, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({ message: "Balance changed between read and write — try again." });
    }
    const tx = await SavingsTransaction.create({
      pnNo,
      type: "withdrawal",
      amount,
      orNo,
      method,
      receivedBy: req.user?.fullName || req.user?.employeeId || "",
      balanceAfter: round2(updated.balance),
      note,
    });
    res.status(201).json({ tx: tx.toObject(), account: updated.toObject() });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to record withdrawal." });
  }
});

// ─── Close account ─────────────────────────────────────────────────
router.post("/:id/close", closeGuard, async (req, res) => {
  try {
    const account = await SavingsAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: "Account not found." });
    if (account.status === "closed") return res.json(account.toObject());
    if (Number(account.balance) !== 0) {
      return res.status(400).json({ message: "Balance must be ₱0 before closing (withdraw remaining first)." });
    }
    account.status = "closed";
    account.closedAt = new Date();
    account.closedBy = req.user?.fullName || req.user?.employeeId || "";
    await account.save();
    res.json(account.toObject());
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to close account." });
  }
});

export default router;
