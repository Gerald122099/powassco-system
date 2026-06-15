// Records each bill reminder push that went out, so the daily job is
// idempotent: at most ONE reminder per bill per calendar day (Manila).
//
// The unique compound index { billId, dateKey } is the dedupe guard —
// the job tries to create the log BEFORE sending; a duplicate-key error
// means "already reminded today, skip." dateKey is "YYYY-MM-DD" in
// Asia/Manila so a day rolls over at local midnight, not UTC.
import mongoose from "mongoose";

const ReminderLogSchema = new mongoose.Schema(
  {
    billId: { type: mongoose.Schema.Types.ObjectId, ref: "WaterBill", required: true },
    pnNo: { type: String, required: true, uppercase: true, trim: true },
    meterNumber: { type: String, default: "", uppercase: true, trim: true },
    periodKey: { type: String, default: "" },
    // 'bill_ready' | 'collection_soon' | 'due_soon' | 'overdue'
    type: { type: String, required: true },
    dateKey: { type: String, required: true }, // "YYYY-MM-DD" (Asia/Manila)
    devicesSent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One reminder per bill per day, regardless of type.
ReminderLogSchema.index({ billId: 1, dateKey: 1 }, { unique: true });
// Aging / cleanup convenience.
ReminderLogSchema.index({ createdAt: 1 });

export default mongoose.model("ReminderLog", ReminderLogSchema);
