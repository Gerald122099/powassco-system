import mongoose from "mongoose";

const WaterPaymentSchema = new mongoose.Schema(
  {
    billId: { type: mongoose.Schema.Types.ObjectId, ref: "WaterBill", required: true },
    pnNo: { type: String, required: true, index: true },
    orNo: { type: String, required: true, trim: true },
    method: { type: String, required: true, trim: true }, // cash/gcash/bank etc
    amountPaid: { type: Number, required: true },
    
    // NEW: Track discount and penalty in payment
    discountApplied: { type: Number, default: 0 },
    penaltyApplied: { type: Number, default: 0 },
    
    // NEW: Classification for reporting
    classification: { type: String, default: "" },
    
    receivedBy: { type: String, default: "" }, // employeeId
    paidAt: { type: Date, default: Date.now },
    
    // NEW: Payment details
    notes: { type: String, default: "" },
    verified: { type: Boolean, default: false },
    verifiedBy: { type: String, default: "" },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

WaterPaymentSchema.index({ orNo: 1 }, { unique: true }); // OR No unique
WaterPaymentSchema.index({ pnNo: 1, paidAt: -1 });
WaterPaymentSchema.index({ classification: 1 });
WaterPaymentSchema.index({ method: 1 });

export default mongoose.model("WaterPayment", WaterPaymentSchema);