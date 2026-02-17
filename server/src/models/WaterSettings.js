
import mongoose from "mongoose";

// Tariff tier schema (UPDATED: supports flat minimum charge OR per-cubic)
const TariffTierSchema = new mongoose.Schema(
  {
    tier: { type: String, required: true },
    minConsumption: { type: Number, required: true, min: 0 },
    maxConsumption: { type: Number, required: true, min: 0 },

    // NEW: tariff type
    chargeType: { type: String, enum: ["flat", "per_cubic"], default: "per_cubic" },

    // per-cubic rate (used when chargeType = per_cubic)
    ratePerCubic: { type: Number, default: 0, min: 0 },

    // flat minimum amount (used when chargeType = flat)
    flatAmount: { type: Number, default: 0, min: 0 },

    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true }
  },
  { _id: true }
);

// Senior discount settings
const SeniorDiscountSchema = new mongoose.Schema(
  {
    discountRate: { type: Number, default: 5, min: 0, max: 100 },
    applicableTiers: { type: [String], default: ["31-40", "41+"] } // updated
  },
  { _id: false }
);

const WaterSettingsSchema = new mongoose.Schema(
  {
    // BASIC BILLING SETTINGS
    penaltyType: { type: String, enum: ["flat", "percent"], default: "flat" },
    penaltyValue: { type: Number, required: true, default: 0 },

    // DUE DATE SETTINGS
    dueDayOfMonth: { type: Number, default: 15, min: 1, max: 31 },
    graceDays: { type: Number, default: 0, min: 0, max: 60 },

    // METER READING SCHEDULE
    readingStartDayOfMonth: { type: Number, default: 1, min: 1, max: 31 },
    readingWindowDays: { type: Number, default: 7, min: 1, max: 31 },

    // TARIFF SETTINGS
    tariffs: {
      residential: [TariffTierSchema],
      commercial: [TariffTierSchema]
    },

    // SENIOR CITIZEN DISCOUNT SETTINGS
    seniorDiscount: { type: SeniorDiscountSchema, default: () => ({}) }
  },
  { timestamps: true }
);

// Indexes
WaterSettingsSchema.index({ "tariffs.residential.isActive": 1 });
WaterSettingsSchema.index({ "tariffs.commercial.isActive": 1 });

export default mongoose.model("WaterSettings", WaterSettingsSchema);