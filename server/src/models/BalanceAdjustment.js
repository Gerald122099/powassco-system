// Dual-control balance adjustment for CBU (Share Capital) and
// voluntary Savings. Admin REQUESTS an adjustment; bookkeeper REVIEWS
// and approves/rejects. Only on approval does the balance move — at
// which point the apply step writes the normal ledger row
// (CbuTransaction / SavingsTransaction) so the running ledgers stay
// the single source of truth.
//
// Why dual-control: a single admin shouldn't be able to silently move
// member money. The requester and approver are different roles, and
// the full request → review → apply trail is kept on this document
// forever (plus the global AuditLog rows for each step).

import mongoose from "mongoose";

const BalanceAdjustmentSchema = new mongoose.Schema(
  {
    module: { type: String, enum: ["cbu", "savings", "loan"], required: true, index: true },
    pnNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    accountName: { type: String, default: "" }, // snapshot at request time
    // For module="loan": the LoanApplication.loanId being adjusted.
    refId: { type: String, default: "" },

    // credit = add to the member's balance; debit = subtract.
    type: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    reason: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    requestedBy: { type: String, default: "" },
    requestedAt: { type: Date, default: Date.now },

    reviewedBy: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },

    // Filled at apply time so the document is a self-contained record.
    balanceBefore: { type: Number, default: null },
    balanceAfter: { type: Number, default: null },
    appliedRefOrNo: { type: String, default: "" }, // ADJ-... reference
  },
  { timestamps: true }
);

BalanceAdjustmentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("BalanceAdjustment", BalanceAdjustmentSchema);
