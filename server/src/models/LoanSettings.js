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
    defaultTermMonths: { type: Number, default: 6 },           // members (6 months)
    defaultTermMonthsEmployee: { type: Number, default: 12 },   // employees (12 months)

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

    // Product transactions — per-category default term in DAYS, and
    // the per-day late-return penalty for rentals. Empty by default;
    // admin fills these in via the Loan Settings panel before the
    // cashier UI can compute due dates / penalties.
    productTerms: {
      frozen_goods: { type: Number, default: 0, min: 0 },  // e.g. 7
      rice:         { type: Number, default: 0, min: 0 },  // e.g. 30
      materials:    { type: Number, default: 0, min: 0 },
      rental:       { type: Number, default: 0, min: 0 },  // e.g. 14
      appliance:    { type: Number, default: 0, min: 0 },
      construction: { type: Number, default: 0, min: 0 },
      other:        { type: Number, default: 0, min: 0 },
      rentalLatePenaltyPerDay: { type: Number, default: 0, min: 0 },
    },

    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("LoanSettings", LoanSettingsSchema);
