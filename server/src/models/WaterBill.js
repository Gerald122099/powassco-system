// server/src/models/WaterBill.js
import mongoose from "mongoose";

const WaterBillSchema = new mongoose.Schema(
  {
    pnNo: { type: String, required: true, trim: true },
    accountName: { type: String, default: "" },
    addressText: { type: String, default: "" },
    classification: { type: String, default: "" },

    periodCovered: { type: String, required: true, trim: true },
    periodKey: { type: String, default: "" }, // "YYYY-MM"

    previousReading: { type: Number, required: true, min: 0 },
    presentReading: { type: Number, required: true, min: 0 },
    consumed: { type: Number, required: true, min: 0 },

    rateUsed: { type: Number, required: true, default: 0 },
    amount: { type: Number, required: true, default: 0 }, // base amount

    penaltyApplied: { type: Number, required: true, default: 0 },
    totalDue: { type: Number, required: true, default: 0 },

    dueDate: { type: Date, required: true },

    // ✅ snapshot rules used at bill creation time
    dueDayUsed: { type: Number, default: 15 },
    graceDaysUsed: { type: Number, default: 0 },
    penaltyTypeUsed: { type: String, enum: ["flat", "percent"], default: "flat" },
    penaltyValueUsed: { type: Number, default: 0 },
    penaltyComputedAt: { type: Date },

    status: { type: String, enum: ["unpaid", "overdue", "paid"], default: "unpaid" },
    paidAt: { type: Date },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

// prevent duplicates: one bill per member per period
WaterBillSchema.index({ pnNo: 1, periodCovered: 1 }, { unique: true });

export default mongoose.model("WaterBill", WaterBillSchema);
