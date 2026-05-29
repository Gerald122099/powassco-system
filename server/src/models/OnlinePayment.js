import mongoose from "mongoose";

// A consumer-submitted online (QR PH) payment awaiting officer verification.
const OnlinePaymentSchema = new mongoose.Schema(
  {
    module: { type: String, enum: ["water", "loan"], required: true, index: true },

    // Water
    billId: { type: mongoose.Schema.Types.ObjectId, ref: "WaterBill" },
    pnNo: { type: String, default: "" },
    meterNumber: { type: String, default: "" },
    periodKey: { type: String, default: "" },
    accountName: { type: String, default: "" },

    // Loan
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "LoanApplication" },
    loanId: { type: String, default: "" },
    borrowerName: { type: String, default: "" },

    amountDue: { type: Number, default: 0 }, // rounded-up peso amount applied to the bill/loan
    fee: { type: Number, default: 0 }, // online convenience fee (payer-shouldered)
    amountToPay: { type: Number, default: 0 }, // amountDue + fee (what the payer transfers)

    referenceId: { type: String, required: true, unique: true, index: true }, // GCash/Maya/bank ref no. — one record per real transaction
    amountPaid: { type: Number, default: 0 }, // what the payer says they paid
    payerName: { type: String, default: "" },
    payerPhone: { type: String, default: "" },

    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
    orNo: { type: String, default: "" },
    verifiedBy: { type: String, default: "" },
    verifiedAt: { type: Date },
    rejectionReason: { type: String, default: "" },
  },
  { timestamps: true }
);

OnlinePaymentSchema.index({ createdAt: -1 });

export default mongoose.model("OnlinePayment", OnlinePaymentSchema);
