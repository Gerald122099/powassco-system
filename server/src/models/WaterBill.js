import mongoose from "mongoose";

/** =========================
 *  Subschemas
 *  ========================= */
const TariffUsedSchema = new mongoose.Schema(
  {
    tier: { type: String, required: true },
    ratePerCubic: { type: Number, required: true },
    minConsumption: { type: Number, required: true },
    maxConsumption: { type: Number, required: true },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const MemberSnapshotSchema = new mongoose.Schema(
  {
    isSeniorCitizen: { type: Boolean, default: false },
    seniorId: { type: String, default: "" },
    seniorDiscountRate: { type: Number, default: 0 },
    hasPWD: { type: Boolean, default: false },
    pwdDiscountRate: { type: Number, default: 0 },
    discountApplicableTiers: { type: [String], default: [] },
  },
  { _id: false }
);

const MeterReadingLineSchema = new mongoose.Schema(
  {
    meterNumber: { type: String, required: true },
    previousReading: { type: Number, default: 0 },
    presentReading: { type: Number, default: 0 },
    rawConsumed: { type: Number, default: 0 },
    multiplier: { type: Number, default: 1 },
    consumed: { type: Number, default: 0 },
  },
  { _id: false }
);

const MeterSnapshotSchema = new mongoose.Schema(
  {
    meterNumber: { type: String, trim: true, uppercase: true },
    meterBrand: { type: String, default: "" },
    meterModel: { type: String, default: "" },
    meterSize: { type: String, default: "" },
    meterCondition: { type: String, default: "" },
    location: { type: Object, default: null }, // keep flexible
  },
  { _id: false }
);

/** =========================
 *  Main Schema
 *  ========================= */
const WaterBillSchema = new mongoose.Schema(
  {
    pnNo: { type: String, required: true, index: true },
    periodKey: { type: String, required: true, index: true }, // "YYYY-MM"
    periodCovered: { type: String, required: true },

    accountName: { type: String, default: "" },
    classification: { type: String, default: "residential" },
    addressText: { type: String, default: "" },

    // ✅ Option C identity
    meterNumber: { type: String, required: true, index: true },

    previousReading: { type: Number, default: 0 },
    presentReading: { type: Number, default: 0 },
    consumed: { type: Number, default: 0 },

    meterReadings: { type: [MeterReadingLineSchema], default: [] },
    meterSnapshot: { type: Object, default: null },

    amount: { type: Number, default: 0 },
    baseAmount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountReason: { type: String, default: "" },
    tariffUsed: { type: Object, default: null },

    penaltyTypeUsed: { type: String, default: "flat" },
    penaltyValueUsed: { type: Number, default: 0 },
    dueDayUsed: { type: Number, default: 15 },
    graceDaysUsed: { type: Number, default: 0 },

    penaltyApplied: { type: Number, default: 0 },
    totalDue: { type: Number, default: 0 },
    dueDate: { type: Date, default: null },

    // ✅ IMPORTANT: include overdue
    status: { type: String, enum: ["unpaid", "overdue", "paid"], default: "unpaid" },

    readingDate: { type: Date, default: null },
    readerId: { type: String, default: "" },
    remarks: { type: String, default: "" },
    createdBy: { type: String, default: "" },

    memberSnapshot: { type: Object, default: null },
    needsTariffReview: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ✅ Option C unique index
WaterBillSchema.index({ pnNo: 1, periodKey: 1, meterNumber: 1 }, { unique: true });

// helpful indexes
WaterBillSchema.index({ status: 1 });
WaterBillSchema.index({ classification: 1 });
WaterBillSchema.index({ meterNumber: 1 });
WaterBillSchema.index({ periodKey: 1 });

export default mongoose.model("WaterBill", WaterBillSchema);
