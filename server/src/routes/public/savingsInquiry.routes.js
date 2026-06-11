// Public savings inquiry — member-facing "Check Balance" widget.
// Member enters Account Number + 4-digit PIN; we return their savings
// balance, CBU balance, and recent debit/credit history for both.
// No auth required (it's behind /api/public); rate limited by the
// public limiter mounted in index.js.

import express from "express";
import bcrypt from "bcryptjs";
import SavingsAccount from "../../models/SavingsAccount.js";
import SavingsTransaction from "../../models/SavingsTransaction.js";
import CbuTransaction from "../../models/CbuTransaction.js";
import WaterMember from "../../models/WaterMember.js";

const router = express.Router();
const normPN = (s) => String(s || "").toUpperCase().trim();

// Single endpoint: POST /api/public/savings-inquiry { pnNo, pin }
router.post("/", async (req, res) => {
  try {
    const pnNo = normPN(req.body?.pnNo);
    const pin = String(req.body?.pin || "");
    if (!pnNo || !/^[0-9]{4}$/.test(pin)) {
      return res.status(400).json({ message: "Account number and 4-digit PIN are required." });
    }
    const account = await SavingsAccount.findOne({ pnNo });
    // Same generic error for missing-account vs wrong-PIN — prevents
    // an attacker enumerating which pnNos have a savings account.
    if (!account || !account.pinHash) {
      return res.status(401).json({ message: "Account or PIN is incorrect." });
    }
    // Per-account lockout: 5 consecutive failures → 30-minute lock.
    // The global /api/public IP limiter still applies on top; this
    // closes the distributed-IP brute-force hole (4-digit keyspace).
    if (account.pinLockedUntil && account.pinLockedUntil > new Date()) {
      return res.status(429).json({ message: "Too many wrong attempts. Try again later or ask the cooperative to reset your PIN." });
    }
    const ok = await bcrypt.compare(pin, account.pinHash);
    if (!ok) {
      const fails = (account.pinFailedAttempts || 0) + 1;
      const update = { pinFailedAttempts: fails };
      if (fails >= 5) {
        update.pinLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        update.pinFailedAttempts = 0; // counter restarts after the lock window
      }
      await SavingsAccount.updateOne({ _id: account._id }, { $set: update });
      return res.status(401).json({ message: "Account or PIN is incorrect." });
    }
    // Correct PIN clears any stale failure count.
    if (account.pinFailedAttempts || account.pinLockedUntil) {
      await SavingsAccount.updateOne(
        { _id: account._id },
        { $set: { pinFailedAttempts: 0, pinLockedUntil: null } }
      );
    }

    // Pull the member's CBU balance from WaterMember; the ledger comes
    // from CbuTransaction. Cap each ledger at 50 rows so the public
    // payload stays small.
    const [member, savingsLedger, cbuLedger] = await Promise.all([
      WaterMember.findOne({ pnNo }).select("pnNo accountName cbuBalance").lean(),
      SavingsTransaction.find({ pnNo }).sort({ createdAt: -1 }).limit(50)
        .select("type amount orNo method paidAt balanceAfter note createdAt")
        .lean(),
      CbuTransaction.find({ pnNo }).sort({ createdAt: -1 }).limit(50)
        .select("type amount refOrNo source balanceAfter note createdAt")
        .lean(),
    ]);

    res.json({
      account: {
        pnNo: account.pnNo,
        accountName: account.accountName,
        balance: account.balance,
        status: account.status,
        openedAt: account.openedAt,
      },
      cbu: {
        balance: Number(member?.cbuBalance) || 0,
      },
      savingsLedger,
      cbuLedger,
    });
  } catch (e) {
    res.status(500).json({ message: "Inquiry failed." });
  }
});

export default router;
