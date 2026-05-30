// Capital Build-Up (CBU) ledger entries.
//
// One row per CBU movement. Created automatically when the cashier records
// a payment with amountReceived > amountDue (excess auto-posts as a credit).
// Bookkeeper can also create manual adjustments later (debit / credit) when
// applying CBU against a product loan, refunding, or correcting an error.

import mongoose from "mongoose";

const CbuTransactionSchema = new mongoose.Schema(
  {
    pnNo: { type: String, required: true, index: true, uppercase: true, trim: true },
    accountName: { type: String, default: "" },

    type: {
      type: String,
      enum: ["credit", "debit"], // credit = added (e.g. excess payment); debit = used (e.g. product loan)
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, default: 0 },

    // What caused this entry. "water_overpay" / "loan_overpay" = auto from
    // the cashier; "manual_adjust" / "product_loan_charge" = bookkeeper.
    source: {
      type: String,
      enum: ["water_overpay", "loan_overpay", "manual_adjust", "product_loan_charge", "withdrawal"],
      required: true,
      index: true,
    },

    // Cross-references (any of these may apply).
    refOrNo: { type: String, default: "", index: true },     // OR no. of the payment
    waterPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: "WaterPayment", default: null },
    loanPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: "LoanPayment", default: null },
    productLoanId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductLoan", default: null },

    note: { type: String, default: "" },
    postedBy: { type: String, default: "" }, // employeeId / fullName
  },
  { timestamps: true }
);

CbuTransactionSchema.index({ pnNo: 1, createdAt: -1 });

export default mongoose.model("CbuTransaction", CbuTransactionSchema);
