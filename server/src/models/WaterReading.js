// server/models/WaterReading.js
import mongoose from "mongoose";

const WaterReadingSchema = new mongoose.Schema(
  {
    periodKey: { type: String, required: true, trim: true }, // "YYYY-MM"
    pnNo: { type: String, required: true, trim: true, index: true },

    previousReading: { type: Number, required: true, min: 0 },
    presentReading: { type: Number, required: true, min: 0 },
    consumed: { type: Number, required: true, min: 0 },

    readAt: { type: Date, default: Date.now },
    readBy: { type: String, default: "" }, // employeeId
  },
  { timestamps: true }
);

WaterReadingSchema.index({ periodKey: 1, pnNo: 1 }, { unique: true });

export default mongoose.model("WaterReading", WaterReadingSchema);
