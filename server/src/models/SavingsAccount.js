// Voluntary savings account (distinct from mandatory CBU).
// Members may open ONE savings account against their water-member pnNo.
// Balance = sum(deposits) - sum(withdrawals); we keep `balance` cached
// on the account for fast read, kept in sync atomically by the route
// that posts each transaction.

import mongoose from "mongoose";

const SavingsAccountSchema = new mongoose.Schema(
  {
    pnNo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    accountName: { type: String, default: "" }, // snapshot for receipts
    balance: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["active", "closed"], default: "active" },
    openedAt: { type: Date, default: Date.now },
    openedBy: { type: String, default: "" },
    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: "" },

    // 4-digit PIN — bcrypt-hashed; never returned to the client.
    // Used by the public "Check Balance" navbar widget so the
    // member can verify their own balance without logging in.
    pinHash: { type: String, default: "" },
    pinSetAt: { type: Date, default: null },
    pinResetCount: { type: Number, default: 0 }, // grows on every admin reset
    // Per-account brute-force lockout for the public inquiry: 5
    // consecutive failures lock the PIN for 30 minutes. A correct
    // PIN or an admin reset clears the counter.
    pinFailedAttempts: { type: Number, default: 0 },
    pinLockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SavingsAccount", SavingsAccountSchema);
