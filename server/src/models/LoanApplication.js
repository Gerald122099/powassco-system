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
    // Drives the default term (6 months for members, 12 for
    // employees) and lets reports separate the two pools. Officer
    // can flip this at any time from the loan detail view if a
    // borrower's status changes.
    borrowerType: { type: String, enum: ["member", "employee"], default: "member", index: true },
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
      // Phase 7 chain: pending → manager_approved (manager signs) →
      // approved (bookkeeper signs) → for_disbursement (loan officer
      // releases) → released (cashier hands net proceeds over, drawer
      // checked). Legacy rows keep their existing statuses untouched.
      enum: ["pending", "manager_approved", "approved", "rejected", "for_disbursement", "released", "closed"],
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
    managerApprovedBy: { type: String, default: "" },
    managerApprovedAt: { type: Date },
    approvedBy: { type: String, default: "" },      // bookkeeper sign-off
    releasedBy: { type: String, default: "" },      // loan officer (sends to cashier)
    disbursedBy: { type: String, default: "" },     // cashier who paid out
    disbursedAt: { type: Date },
    disbursementOr: { type: String, default: "" },
    // How the net proceeds were released: cash (drawer) | bank | check.
    disbursementMethod: { type: String, enum: ["cash", "bank", "check"], default: "cash" },
    disbursementBank: { type: String, default: "" },  // "BankName ····1234" snapshot
    disbursementCheque: { type: String, default: "" }, // cheque number when method=check
  },
  { timestamps: true }
);

LoanApplicationSchema.pre("validate", function (next) {
  if (!this.loanId) this.loanId = makeLoanId();
  if (!this.referenceCode) this.referenceCode = makeRefCode();
  next();
});

export default mongoose.model("LoanApplication", LoanApplicationSchema);
