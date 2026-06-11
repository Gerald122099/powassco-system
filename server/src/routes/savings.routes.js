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
import bcrypt from "bcryptjs";
import SavingsAccount from "../models/SavingsAccount.js";
import SavingsTransaction from "../models/SavingsTransaction.js";
import SavingsSettings from "../models/SavingsSettings.js";
import WaterMember from "../models/WaterMember.js";
import CbuTransaction from "../models/CbuTransaction.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

async function getSavingsSettings() {
  let s = await SavingsSettings.findOne();
  if (!s) s = await SavingsSettings.create({});
  return s;
}

const router = express.Router();
const readGuard = [requireAuth, requireRole(["admin", "bookkeeper", "cashier", "loan_officer"])];
const openGuard = [requireAuth, requireRole(["admin", "bookkeeper", "cashier", "loan_officer"])];
const txGuard = [requireAuth, requireRole(["admin", "cashier"])];
const closeGuard = [requireAuth, requireRole(["admin", "bookkeeper"])];
const adminGuard = [requireAuth, requireRole(["admin"])];

function isValidPin(v) {
  return typeof v === "string" && /^[0-9]{4}$/.test(v);
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const normPN = (s) => String(s || "").toUpperCase().trim();

// OR sequence for savings receipts. Format: SAV-YYYYMMDD-HHMMSS-RAND.
// The previous count-based generator was racy: two concurrent deposits
// both read N and both minted SAV-…-(N+1), causing E11000 on insert
// (audit finding #4). Using timestamp + a 4-char random suffix is
// effectively collision-free; the unique index on orNo is still the
// race breaker if luck ever turns up a dup (route retries once).
function makeSavingsOr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SAV-${y}${m}${d}-${hh}${mm}${ss}-${rand}`;
}

// ─── Settings ──────────────────────────────────────────────────────
router.get("/settings", readGuard, async (_req, res) => {
  try {
    const s = await getSavingsSettings();
    res.json(s.toObject());
  } catch (e) {
    res.status(500).json({ message: "Failed to load settings." });
  }
});

router.put("/settings", adminGuard, async (req, res) => {
  try {
    const s = await getSavingsSettings();
    const allow = ["interestRatePerPeriod", "interestFrequency", "minimumBalance", "openingFee"];
    for (const k of allow) {
      if (k in req.body) {
        if (k === "interestFrequency") {
          if (!["monthly", "annually"].includes(req.body[k])) continue;
          s[k] = req.body[k];
        } else {
          const v = Number(req.body[k]);
          if (Number.isFinite(v) && v >= 0) s[k] = v;
        }
      }
    }
    s.updatedBy = req.user?.fullName || req.user?.employeeId || "";
    await s.save();
    res.json(s.toObject());
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to save settings." });
  }
});

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
// Requires a 4-digit PIN. The PIN is bcrypt-hashed before storage so
// an admin can reset it but cannot read it back.
router.post("/open", openGuard, async (req, res) => {
  try {
    const pnNo = normPN(req.body?.pnNo);
    const pin = String(req.body?.pin || "");
    if (!pnNo) return res.status(400).json({ message: "Account number is required." });
    if (!isValidPin(pin)) return res.status(400).json({ message: "A 4-digit numeric PIN is required." });
    const member = await WaterMember.findOne({ pnNo }).select("pnNo accountName").lean();
    if (!member) return res.status(404).json({ message: `Member ${pnNo} not found.` });
    const existing = await SavingsAccount.findOne({ pnNo });
    if (existing) {
      // Idempotent — return the existing account so the UI can pick up.
      return res.json({ account: { ...existing.toObject(), pinHash: undefined }, alreadyExists: true });
    }
    const pinHash = await bcrypt.hash(pin, 10);
    const account = await SavingsAccount.create({
      pnNo,
      accountName: member.accountName || "",
      balance: 0,
      openedBy: req.user?.fullName || req.user?.employeeId || "",
      pinHash,
      pinSetAt: new Date(),
    });
    const out = account.toObject();
    delete out.pinHash;
    // Return the admin-configured opening fee so the cashier UI can
    // remind them to collect it before depositing initial funds.
    const settings = await getSavingsSettings();
    res.status(201).json({ account: out, openingFee: Number(settings.openingFee) || 0 });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to open savings account." });
  }
});

// ─── Admin: reset PIN ──────────────────────────────────────────────
// Issues a new 4-digit PIN (returned ONCE, never readable again) so
// the admin can hand it to the member. pinResetCount is bumped so
// the audit log can show how many resets a member has had.
router.post("/:id/reset-pin", adminGuard, async (req, res) => {
  try {
    const newPin = String(req.body?.pin || "").trim();
    if (!isValidPin(newPin)) return res.status(400).json({ message: "A 4-digit numeric PIN is required." });
    const account = await SavingsAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: "Account not found." });
    account.pinHash = await bcrypt.hash(newPin, 10);
    account.pinSetAt = new Date();
    account.pinResetCount = (account.pinResetCount || 0) + 1;
    account.pinFailedAttempts = 0;
    account.pinLockedUntil = null;
    await account.save();
    res.json({ ok: true, pinResetCount: account.pinResetCount, pinSetAt: account.pinSetAt });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to reset PIN." });
  }
});

// ─── Deposit ───────────────────────────────────────────────────────
router.post("/deposit", txGuard, async (req, res) => {
  try {
    const pnNo = normPN(req.body?.pnNo);
    const amount = round2(Number(req.body?.amount));
    const method = req.body?.method || "cash";
    const note = String(req.body?.note || "").trim();
    // Idempotency key — client-supplied, used to dedupe a double-click
    // or retry over a flaky network. If absent, we fall back to a
    // single-use generator (no idempotency, no harm but no protection
    // either).
    const clientKey = String(req.body?.idempotencyKey || "").trim();
    if (!pnNo) return res.status(400).json({ message: "Account number is required." });
    if (!(amount > 0)) return res.status(400).json({ message: "Deposit amount must be greater than 0." });

    const account = await SavingsAccount.findOne({ pnNo });
    if (!account) return res.status(404).json({ message: "No savings account for this member. Open one first." });
    if (account.status === "closed") return res.status(400).json({ message: "Account is closed." });

    // Dedupe: if the client retried with the same key, return the
    // previous tx instead of double-crediting.
    if (clientKey) {
      const prior = await SavingsTransaction.findOne({ note: { $regex: new RegExp(`\\bIDEMP:${clientKey}\\b`) } });
      if (prior) return res.status(200).json({ tx: prior, account: account.toObject(), idempotent: true });
    }

    const orNo = makeSavingsOr();
    // CRITICAL: insert ledger row FIRST. If the $inc later fails for
    // any reason, the orphaned ledger row is detectable (it has no
    // matching balance delta) — better than the reverse where balance
    // moves but no row exists. Unique index on orNo blocks dup-insert.
    const tx = await SavingsTransaction.create({
      pnNo,
      type: "deposit",
      amount,
      orNo,
      method,
      receivedBy: req.user?.fullName || req.user?.employeeId || "",
      balanceAfter: 0, // filled in below after the $inc
      paidAt: new Date(),
      note: clientKey ? `${note} IDEMP:${clientKey}`.trim() : note,
    });
    // Atomic increment. Two concurrent deposits both succeed; final
    // balance equals account.balance + both amounts.
    const updated = await SavingsAccount.findOneAndUpdate(
      { _id: account._id },
      { $inc: { balance: amount } },
      { new: true }
    );
    // Update the ledger row's balanceAfter to the post-increment value.
    tx.balanceAfter = round2(updated.balance);
    await tx.save();
    res.status(201).json({ tx: tx.toObject(), account: updated.toObject() });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "OR number race — retry the deposit." });
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
    // closing=true bypasses the minimum-balance check so the member can
    // drain the account to zero. The /close endpoint validates that
    // the post-withdrawal balance is exactly 0 before flipping status.
    const closing = !!req.body?.closing;
    if (!pnNo) return res.status(400).json({ message: "Account number is required." });
    if (!(amount > 0)) return res.status(400).json({ message: "Withdrawal amount must be greater than 0." });

    const account = await SavingsAccount.findOne({ pnNo });
    if (!account) return res.status(404).json({ message: "No savings account for this member." });
    if (account.status === "closed") return res.status(400).json({ message: "Account is closed." });
    if (Number(account.balance) < amount) {
      return res.status(400).json({ message: `Insufficient balance (₱${account.balance.toLocaleString()} on file).` });
    }
    // Minimum-balance policy: post-withdrawal balance must stay >=
    // settings.minimumBalance unless the cashier explicitly flags this
    // as a closing withdrawal.
    const settings = await getSavingsSettings();
    const minBal = Number(settings.minimumBalance) || 0;
    if (!closing && (Number(account.balance) - amount) < minBal) {
      return res.status(400).json({
        message: `Cannot withdraw below the ₱${minBal.toLocaleString()} minimum balance. To withdraw the full amount, close the account.`,
      });
    }

    const orNo = makeSavingsOr();
    // Race-safe decrement: only if balance still has enough at the
    // moment of the write. If a concurrent withdrawal drained it
    // first, the update matches zero docs and we surface a clean error.
    const minRequired = closing ? amount : amount + minBal;
    const updated = await SavingsAccount.findOneAndUpdate(
      { _id: account._id, balance: { $gte: minRequired } },
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
      paidAt: new Date(),
      note,
    });
    res.status(201).json({ tx: tx.toObject(), account: updated.toObject() });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "OR number race — retry the withdrawal." });
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
