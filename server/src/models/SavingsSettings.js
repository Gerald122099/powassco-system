// Cooperative-wide savings policy. Single document (the first / only
// row in the collection). Edited by admin, read by every route that
// touches deposits / withdrawals / opening / interest accrual.

import mongoose from "mongoose";

const SavingsSettingsSchema = new mongoose.Schema(
  {
    // Interest applied to the running balance on a periodic schedule.
    // 0 = no interest accrual (the default until admin configures).
    interestRatePerPeriod: { type: Number, default: 0, min: 0 }, // % per period
    interestFrequency: { type: String, enum: ["monthly", "annually"], default: "annually" },
    interestLastRunAt: { type: Date, default: null },

    // Minimum balance the member must keep on file. Withdrawals that
    // would drop below this are rejected unless the account is being
    // CLOSED (which allows draining to zero).
    minimumBalance: { type: Number, default: 0, min: 0 },

    // One-time fee charged when a new savings account is opened.
    // The cashier collects it as part of the open transaction; the
    // fee posts to CBU / income (TBD per coop policy) — for now it
    // is just deducted at open and recorded in the OR notes.
    openingFee: { type: Number, default: 0, min: 0 },

    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("SavingsSettings", SavingsSettingsSchema);
