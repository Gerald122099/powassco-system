import mongoose from "mongoose";

const LoanSettingsSchema = new mongoose.Schema(
  {
    // optional: if you later want due-day based scheduling
    dueDayOfMonth: { type: Number, default: 15, min: 1, max: 28 },
    graceDays: { type: Number, default: 0, min: 0, max: 60 },

    // penalty rules for overdue installments
    penaltyType: { type: String, enum: ["none", "flat", "percent"], default: "flat" },
    penaltyValue: { type: Number, default: 0 }, // flat pesos OR percent
    penaltyFrequency: { type: String, enum: ["once", "monthly"], default: "monthly" },

    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("LoanSettings", LoanSettingsSchema);
