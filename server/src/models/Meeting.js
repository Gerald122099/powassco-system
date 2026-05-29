import mongoose from "mongoose";

const MeetingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["meeting", "event", "training", "holiday", "deadline", "other"], default: "meeting" },
    datetime: { type: Date, required: true },
    location: { type: String, default: "", trim: true }, // venue
    notes: { type: String, default: "", trim: true }, // agenda / details
    // Who should see it on their dashboard. "all" = every role.
    audience: {
      type: String,
      enum: ["all", "admin", "water_bill_officer", "loan_officer", "meter_reader"],
      default: "all",
    },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

MeetingSchema.index({ datetime: 1 });

export default mongoose.model("Meeting", MeetingSchema);
