import mongoose from "mongoose";

const LoanPaymentSchema = new mongoose.Schema(
  {
    loanId: { type: String, required: true, index: true }, // LN-...
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "LoanApplication", required: true },

    borrowerPnNo: { type: String, required: true, index: true },

    orNo: { type: String, required: true, unique: true, index: true },
    method: { type: String, enum: ["cash", "gcash", "bank", "other"], default: "cash" },
    amountPaid: { type: Number, required: true, min: 0 },

    paidAt: { type: Date, default: Date.now },
    receivedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("LoanPayment", LoanPaymentSchema);
