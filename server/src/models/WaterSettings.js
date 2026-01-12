// server/models/WaterSettings.js
import mongoose from "mongoose";

const WaterSettingsSchema = new mongoose.Schema(
  {
    ratePerCubic: { type: Number, required: true, default: 0 },
    penaltyType: { type: String, enum: ["flat", "percent"], default: "flat" },
    penaltyValue: { type: Number, required: true, default: 0 },

    dueDayOfMonth: { type: Number, default: 15, min: 1, max: 31 },
    graceDays: { type: Number, default: 0, min: 0, max: 60 },

    // ✅ NEW (meter reading schedule)
    readingStartDayOfMonth: { type: Number, default: 1, min: 1, max: 31 },
    readingWindowDays: { type: Number, default: 7, min: 1, max: 31 },
  },
  { timestamps: true }
);

export default mongoose.model("WaterSettings", WaterSettingsSchema);
