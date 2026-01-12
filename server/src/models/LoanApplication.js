import mongoose from "mongoose";

function makeLoanId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LN-${yyyy}${mm}-${rand}`;
}

const LoanApplicationSchema = new mongoose.Schema(
  {
    loanId: { type: String, unique: true, index: true },

    // Borrower link (PN No from WaterMember)
    borrowerPnNo: { type: String, required: true, index: true },
    borrowerName: { type: String, required: true }, // snapshot
    borrowerStatus: { type: String, default: "active" }, // snapshot

    // Loan details
    loanType: { type: String, default: "personal" }, // you can extend
    purpose: { type: String, default: "" },

    principal: { type: Number, required: true, min: 0 },
    interestRate: { type: Number, required: true, min: 0 }, // percent per term (simple)
    termMonths: { type: Number, required: true, min: 1 },

    // computed/snapshots
    interestAmount: { type: Number, default: 0 },
    totalPayable: { type: Number, default: 0 },
    monthlyAmortization: { type: Number, default: 0 },

    // status flow
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "released", "closed"],
      default: "pending",
      index: true,
    },

    remarks: { type: String, default: "" },

    // release / tracking
    releasedAt: { type: Date },
    maturityDate: { type: Date },

    // audit
    createdBy: { type: String, default: "" },
    approvedBy: { type: String, default: "" },
    releasedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

LoanApplicationSchema.pre("save", function (next) {
  if (!this.loanId) this.loanId = makeLoanId();

  // Simple interest (you can adjust later)
  const principal = Number(this.principal || 0);
  const rate = Number(this.interestRate || 0) / 100;
  const interestAmount = principal * rate;
  const totalPayable = principal + interestAmount;

  this.interestAmount = Number(interestAmount.toFixed(2));
  this.totalPayable = Number(totalPayable.toFixed(2));

  const term = Math.max(1, Number(this.termMonths || 1));
  this.monthlyAmortization = Number((totalPayable / term).toFixed(2));

  next();
});

export default mongoose.model("LoanApplication", LoanApplicationSchema);
