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
    meterNumber: { type: String, trim: true, uppercase: true },
    previousReading: { type: Number, default: 0 },
    presentReading: { type: Number, default: 0 },
    rawConsumed: { type: Number, default: 0 }, // present - previous
    multiplier: { type: Number, default: 1 },
    consumed: { type: Number, default: 0 }, // rawConsumed * multiplier
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
    pnNo: { type: String, required: true, trim: true, uppercase: true },
    accountName: { type: String, default: "" },
    addressText: { type: String, default: "" },
    classification: { type: String, default: "" },

    // optional but useful for printing/tracking
    billNumber: { type: String, default: "" },

    // periods
    periodCovered: { type: String, required: true, trim: true }, // "YYYY-MM"
    periodKey: { type: String, default: "", trim: true },        // "YYYY-MM" (same)

    // single-meter legacy fields (keep so your old UI still works)
    previousReading: { type: Number, required: true, min: 0, default: 0 },
    presentReading: { type: Number, required: true, min: 0, default: 0 },
    consumed: { type: Number, required: true, min: 0, default: 0 },

    // multi-meter support
    meterReadings: { type: [MeterReadingLineSchema], default: [] },

    // for quick display/filtering (BillsPanel column)
    meterNumber: { type: String, default: "", trim: true, uppercase: true },

    // snapshot of the chosen meter (optional)
    meterSnapshot: { type: MeterSnapshotSchema, default: null },

    // tariff computation
    tariffUsed: { type: TariffUsedSchema, default: null },
    baseAmount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountReason: { type: String, default: "" },
    amount: { type: Number, required: true, default: 0 }, // final after discount

    // member snapshot (discount eligibility)
    memberSnapshot: { type: MemberSnapshotSchema, default: null },

    // penalties and totals
    penaltyApplied: { type: Number, required: true, default: 0 },
    totalDue: { type: Number, required: true, default: 0 },

    // dates
    readingDate: { type: Date, default: null },
    dueDate: { type: Date, required: true },

    // settings snapshot
    dueDayUsed: { type: Number, default: 15 },
    graceDaysUsed: { type: Number, default: 0 },
    penaltyTypeUsed: { type: String, enum: ["flat", "percent"], default: "flat" },
    penaltyValueUsed: { type: Number, default: 0 },
    penaltyComputedAt: { type: Date },

    // payment
    status: { type: String, enum: ["unpaid", "overdue", "paid"], default: "unpaid" },
    paidAt: { type: Date },
    orNo: { type: String, default: "" },

    // audit
    createdBy: { type: String, default: "" },
    readerId: { type: String, default: "" },
    remarks: { type: String, default: "" },

    needsTariffReview: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/** =========================
 *  Indexes
 *  ========================= */
// One bill per member per period
WaterBillSchema.index({ pnNo: 1, periodKey: 1 }, { unique: true });

// fast filters
WaterBillSchema.index({ status: 1 });
WaterBillSchema.index({ classification: 1 });
WaterBillSchema.index({ meterNumber: 1 });
WaterBillSchema.index({ periodKey: 1 });

export default mongoose.model("WaterBill", WaterBillSchema);
