
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
    // Legacy penalty (kept for backwards compatibility; the new engine below
    // takes precedence when penaltyDailyAmount > 0).
    penaltyType: { type: String, enum: ["flat", "percent"], default: "flat" },
    penaltyValue: { type: Number, required: true, default: 0 },

    // NEW: daily-flat penalty engine. See utils/penalty.js for the rule.
    //   • penaltyDailyAmount  — per-day flat (₱) added each working day past due
    //   • penaltyGraceDays    — working days of grace (Sundays excluded)
    //   • penaltyAfterGraceAmount — one-shot amount after grace; account is
    //                               then flagged for disconnection.
    penaltyDailyAmount: { type: Number, default: 10, min: 0 },
    penaltyGraceDays: { type: Number, default: 5, min: 0, max: 30 },
    penaltyAfterGraceAmount: { type: Number, default: 200, min: 0 },

    // NEW-MEMBER FEES (Phase 9) — collected by the cashier when a new
    // member registers. Editable in admin Water Settings.
    membershipFee: { type: Number, default: 0, min: 0 },
    tappingFee: { type: Number, default: 200, min: 0 },

    // DUE DATE SETTINGS — default to the 17th per coop policy.
    dueDayOfMonth: { type: Number, default: 17, min: 1, max: 31 },
    graceDays: { type: Number, default: 0, min: 0, max: 60 },

    // COLLECTION DAY — the coop's scheduled collection date (day of the
    // month AFTER the billed period). Drives the "collection is coming"
    // reminders. Separate from dueDayOfMonth on purpose.
    collectionDayOfMonth: { type: Number, default: 17, min: 1, max: 31 },

    // BILL REMINDER (push) ENGINE — see jobs/billReminders.js.
    //   • enabled            — master switch
    //   • sendHour           — local (Asia/Manila) hour the daily pass fires
    //   • dueSoonDays        — start due-date reminders this many days before due
    //   • collectionLeadDays — start collection reminders this many days before
    //   • overdueDaily       — keep nagging daily once overdue (until paid)
    // The job sends at most ONE reminder per bill per day (most urgent wins)
    // and never reminds a bill whose meter is disconnected or whose account
    // is suspended.
    billReminders: {
      enabled: { type: Boolean, default: true },
      sendHour: { type: Number, default: 8, min: 0, max: 23 },
      dueSoonDays: { type: Number, default: 3, min: 0, max: 30 },
      collectionLeadDays: { type: Number, default: 2, min: 0, max: 30 },
      overdueDaily: { type: Boolean, default: true },
    },
    // Atomic per-day claim ("YYYY-MM-DD" in Asia/Manila) so the hourly tick
    // only runs the reminder pass once a day even across server instances.
    reminderLastRunDate: { type: String, default: "" },

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