import mongoose from "mongoose";

function rand(n) {
  return Math.random().toString(36).slice(2, 2 + n).toUpperCase();
}
function makeLoanId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `LN-${yyyy}${mm}-${rand(4)}`;
}
function makeRefCode() {
  return rand(8);
}

const PersonSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    homeAddress: { type: String, default: "" },
    dateOfBirth: { type: String, default: "" },
    tin: { type: String, default: "" },
    telNo: { type: String, default: "" },
    cellNo: { type: String, default: "" },
    civilStatus: { type: String, default: "" },
    dependents: { type: Number, default: 0 },
    spouseName: { type: String, default: "" },
    contactNo: { type: String, default: "" },
  },
  { _id: false }
);

const IncomeSchema = new mongoose.Schema(
  {
    source: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    frequency: { type: String, default: "monthly" },
  },
  { _id: false }
);

const CoopInfoSchema = new mongoose.Schema(
  {
    shareCapital: { type: Number, default: 0 },
    savings: { type: Number, default: 0 },
    loanBalance: { type: Number, default: 0 },
  },
  { _id: false }
);

const ChargeItemSchema = new mongoose.Schema(
  {
    key: String,
    label: String,
    type: String,
    value: Number,
    amount: Number,
  },
  { _id: false }
);

const ScheduleRowSchema = new mongoose.Schema(
  {
    period: Number,
    payment: Number,
    principal: Number,
    interest: Number,
    balance: Number,
    dueDate: Date,
  },
  { _id: false }
);

const LoanApplicationSchema = new mongoose.Schema(
  {
    loanId: { type: String, unique: true, index: true },
    referenceCode: { type: String, index: true },

    // Borrower link (PN No from WaterMember)
    borrowerPnNo: { type: String, required: true, index: true },
    borrowerName: { type: String, required: true }, // snapshot
    borrowerAddress: { type: String, default: "" },
    borrowerStatus: { type: String, default: "active" },

    loanType: { type: String, default: "regular" },
    purpose: { type: String, default: "" },
    collateral: { type: String, default: "" },
    modeOfPayment: { type: String, enum: ["monthly", "semi-monthly"], default: "monthly" },

    principal: { type: Number, required: true, min: 0 }, // amount applied / granted
    interestRatePerMonth: { type: Number, default: 2.5 },
    termMonths: { type: Number, required: true, min: 1 },

    // computed (fixed diminishing balance)
    monthlyPayment: { type: Number, default: 0 },
    totalPayment: { type: Number, default: 0 },
    totalInterest: { type: Number, default: 0 },
    amortizationSchedule: { type: [ScheduleRowSchema], default: [] },

    // charges / disclosure
    charges: { type: [ChargeItemSchema], default: [] },
    totalCharges: { type: Number, default: 0 },
    netProceeds: { type: Number, default: 0 },

    // people / income / cooperative info (for the printable forms)
    applicant: { type: PersonSchema, default: () => ({}) },
    coMaker: { type: PersonSchema, default: () => ({}) },
    sourceOfIncome: { type: [IncomeSchema], default: [] },
    cooperative: {
      applicant: { type: CoopInfoSchema, default: () => ({}) },
      coMaker: { type: CoopInfoSchema, default: () => ({}) },
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "released", "closed"],
      default: "pending",
      index: true,
    },
    remarks: { type: String, default: "" },

    // dates
    appliedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date },
    releasedAt: { type: Date }, // disbursing date
    firstPaymentDate: { type: Date },
    maturityDate: { type: Date }, // final due date

    // payment tracking
    totalPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },

    createdBy: { type: String, default: "" },
    approvedBy: { type: String, default: "" },
    releasedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

LoanApplicationSchema.pre("validate", function (next) {
  if (!this.loanId) this.loanId = makeLoanId();
  if (!this.referenceCode) this.referenceCode = makeRefCode();
  next();
});

export default mongoose.model("LoanApplication", LoanApplicationSchema);
