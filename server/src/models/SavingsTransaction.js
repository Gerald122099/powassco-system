// Ledger row for a single savings deposit or withdrawal.
// Balance reconciliation: sum(amount where type=deposit) -
// sum(amount where type=withdrawal) must equal SavingsAccount.balance
// for the same pnNo. The cashier route maintains this atomically.

import mongoose from "mongoose";

const SavingsTransactionSchema = new mongoose.Schema(
  {
    pnNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    type: { type: String, enum: ["deposit", "withdrawal"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    orNo: { type: String, required: true, unique: true, index: true },
    method: { type: String, enum: ["cash", "check", "bank", "gcash", "other"], default: "cash" },
    paidAt: { type: Date, default: Date.now },
    receivedBy: { type: String, default: "" },
    balanceAfter: { type: Number, default: 0 },
    note: { type: String, default: "" },
    // When a savings deposit is collected as part of a multi-component
    // payment (water + CBU + savings on one OR), this links it to the
    // parent water/loan payment so the bookkeeper can reconcile.
    bundledWithOr: { type: String, default: "" },
    // Client-supplied dedupe key (double-click / flaky-network retry).
    // Sparse index: only deposits that send a key pay the index cost.
    idempotencyKey: { type: String, default: undefined },
  },
  { timestamps: true }
);

SavingsTransactionSchema.index({ idempotencyKey: 1 }, { sparse: true });
SavingsTransactionSchema.index({ pnNo: 1, createdAt: -1 });

export default mongoose.model("SavingsTransaction", SavingsTransactionSchema);
