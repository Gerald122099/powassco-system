import mongoose from "mongoose";

const ChargeRuleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ["flat", "percent"], default: "flat" },
    value: { type: Number, default: 0 },
  },
  { _id: false }
);

const LoanSettingsSchema = new mongoose.Schema(
  {
    interestRatePerMonth: { type: Number, default: 2.5 }, // diminishing balance
    penaltyRatePerMonth: { type: Number, default: 12 }, // on delayed/unpaid installments
    defaultTermMonths: { type: Number, default: 6 },

    // Add-on charges deducted from principal to get net proceeds
    charges: { type: [ChargeRuleSchema], default: [] },

    // optional due-day scheduling
    dueDayOfMonth: { type: Number, default: 15, min: 1, max: 28 },
    graceDays: { type: Number, default: 0, min: 0, max: 60 },

    penaltyType: { type: String, enum: ["none", "flat", "percent"], default: "percent" },
    penaltyValue: { type: Number, default: 12 },
    penaltyFrequency: { type: String, enum: ["once", "monthly"], default: "monthly" },

    // Minimum Capital Build-Up balance the borrower must hold on their
    // water account before a loan can be approved. Editable from the
    // admin Loan Settings panel; default ₱3,000 per co-op policy.
    minCbuForLoan: { type: Number, default: 3000, min: 0 },

    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("LoanSettings", LoanSettingsSchema);
