// New-member fee request (Phase 9). Filed automatically when a water
// member is registered; the cashier collects membership + tapping fee
// on one OR. Paying writes a drawer-IN treasury row.
import mongoose from "mongoose";

const MemberFeeRequestSchema = new mongoose.Schema(
  {
    pnNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    accountName: { type: String, default: "" },
    membershipFee: { type: Number, default: 0, min: 0 },
    tappingFee: { type: Number, default: 0, min: 0 }, // 0 when officer excluded it
    total: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["pending", "paid", "waived"], default: "pending", index: true },
    requestedBy: { type: String, default: "" },
    orNo: { type: String, default: "" },
    paidBy: { type: String, default: "" },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);
MemberFeeRequestSchema.index({ status: 1, createdAt: -1 });
export default mongoose.model("MemberFeeRequest", MemberFeeRequestSchema);
