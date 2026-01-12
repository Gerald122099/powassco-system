import mongoose from "mongoose";

const WaterPaymentSchema = new mongoose.Schema(
  {
    billId: { type: mongoose.Schema.Types.ObjectId, ref: "WaterBill", required: true },
    pnNo: { type: String, required: true, index: true },
    orNo: { type: String, required: true, trim: true },
    method: { type: String, required: true, trim: true }, // cash/gcash/bank etc
    amountPaid: { type: Number, required: true },
    receivedBy: { type: String, default: "" }, // employeeId
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

WaterPaymentSchema.index({ orNo: 1 }, { unique: true }); // OR No unique

export default mongoose.model("WaterPayment", WaterPaymentSchema);
