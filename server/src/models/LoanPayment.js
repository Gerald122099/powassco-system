import mongoose from "mongoose";

const LoanPaymentSchema = new mongoose.Schema(
  {
    loanId: { type: String, required: true, index: true }, // LN-...
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "LoanApplication", required: true },

    borrowerPnNo: { type: String, required: true, index: true },

    orNo: { type: String, required: true, unique: true, index: true },
    method: { type: String, enum: ["cash", "gcash", "bank", "online", "other"], default: "cash" },
    // amountPaid    = total applied to balance (covers one or more periods)
    // amountReceived = cashier received (≥ amountPaid); excess → CBU
    // periodsCovered = how many scheduled periods this payment covered (1 = current, 2 = +advance, etc.)
    amountPaid: { type: Number, required: true, min: 0 },
    amountReceived: { type: Number, default: 0 },
    cbuExcess: { type: Number, default: 0 },
    // Capital (principal) vs interest split of amountPaid, summed from the
    // amortization-schedule rows this payment settled. Lets the receipt +
    // ledger show how much of the diminishing-balance payment went to
    // capital vs interest. 0 on legacy rows.
    principalPaid: { type: Number, default: 0 },
    interestPaid: { type: Number, default: 0 },
    periodsCovered: { type: Number, default: 1, min: 1 },
    // Specific period numbers (1-based) this payment was applied to.
    // Empty array on legacy rows that pre-date this field — the UI
    // falls back to the count-based logic when displaying those.
    periodsPaid: { type: [Number], default: [] },

    paidAt: { type: Date, default: Date.now },
    receivedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("LoanPayment", LoanPaymentSchema);
