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
  },
  { timestamps: true }
);

export default mongoose.model("Payroll", PayrollSchema);
