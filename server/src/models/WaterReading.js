// models/WaterReading.js
import mongoose from "mongoose";

const WaterReadingSchema = new mongoose.Schema(
  {
    periodKey: { type: String, required: true, trim: true }, // YYYY-MM
    pnNo: { type: String, required: true, trim: true, uppercase: true, index: true },

    // multi-meter key
    meterNumber: { type: String, required: true, trim: true, uppercase: true, index: true },

    previousReading: { type: Number, required: true, min: 0 },
    presentReading: { type: Number, required: true, min: 0 },

    // ✅ keep raw and billed separately
    rawConsumed: { type: Number, required: true, min: 0, default: 0 },
    consumptionMultiplier: { type: Number, required: true, min: 0.0001, default: 1 },
    consumed: { type: Number, required: true, min: 0, default: 0 }, // billed consumed (raw * multiplier)

    readAt: { type: Date, default: Date.now },
    readBy: { type: String, default: "" },

    readingType: {
      type: String,
      enum: ["manual", "mobile_app", "auto_meter", "estimated"],
      default: "manual",
    },
    readingStatus: {
      type: String,
      enum: ["pending", "verified", "disputed", "corrected"],
      default: "verified",
    },

    isEstimated: { type: Boolean, default: false },
    estimatedReason: { type: String, default: "" },
    validationNotes: { type: String, default: "" },

    meterSnapshot: {
      meterNumber: { type: String, default: "" },
      meterBrand: { type: String, default: "" },
      meterModel: { type: String, default: "" },
      meterCondition: {
        type: String,
        enum: ["good", "needs_repair", "replaced", "defective", "tampered"],
        default: "good",
      },
      notes: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

// prevent duplicates per meter per month
WaterReadingSchema.index({ periodKey: 1, pnNo: 1, meterNumber: 1 }, { unique: true });

// ✅ compute rawConsumed + consumed(billed)
WaterReadingSchema.pre("validate", function (next) {
  const prev = Number(this.previousReading ?? 0);
  const pres = Number(this.presentReading ?? 0);
  const mult = Number(this.consumptionMultiplier ?? 1);

  const raw = Math.max(0, pres - prev);
  this.rawConsumed = raw;
  this.consumed = raw * (mult > 0 ? mult : 1);

  next();
});

export default mongoose.model("WaterReading", WaterReadingSchema);
