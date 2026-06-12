import mongoose from "mongoose";

const LineSchema = new mongoose.Schema(
  { label: { type: String, default: "" }, amount: { type: Number, default: 0 } },
  { _id: false }
);

const PayrollSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    // snapshot at time of run
    employeeName: { type: String, default: "" },
    employeeCode: { type: String, default: "" },
    position: { type: String, default: "" },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true, index: true },
    payDate: { type: Date, default: Date.now },

    rateType: { type: String, default: "monthly" },
    rate: { type: Number, default: 0 },
    daysWorked: { type: Number, default: 0 },

    // earnings
    basicPay: { type: Number, default: 0 },
    overtimePay: { type: Number, default: 0 },
    allowances: { type: [LineSchema], default: [] },
    grossPay: { type: Number, default: 0 },

    // deductions
    sss: { type: Number, default: 0 },
    philhealth: { type: Number, default: 0 },
    pagibig: { type: Number, default: 0 },
    withholdingTax: { type: Number, default: 0 },
    otherDeductions: { type: [LineSchema], default: [] },
    totalDeductions: { type: Number, default: 0 },

    netPay: { type: Number, default: 0 },

    recordedBy: { type: String, default: "" },
    notes: { type: String, default: "" },

    // Phase 5: payroll approval chain. New runs are filed "pending",
    // the manager approves, the cashier disburses (drawer-checked).
    // Schema default is "disbursed" so LEGACY rows (no status stored)
    // read as already-paid history instead of flooding the queue;
    // the create route explicitly sets "pending" on new rows.
    type: { type: String, enum: ["regular", "cash_advance"], default: "regular", index: true },
    status: { type: String, enum: ["pending", "approved", "disbursed", "rejected"], default: "disbursed", index: true },
    approvedBy: { type: String, default: "" },
    approvedAt: { type: Date },
    disbursedBy: { type: String, default: "" },
    disbursedAt: { type: Date },
    disbursementOr: { type: String, default: "" },
    receivedBy: { type: String, default: "" }, // who signed for / received the cash
    rejectedBy: { type: String, default: "" },
    rejectNote: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Payroll", PayrollSchema);
