// models/WaterBill.js
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
    pnNo: { type: String, required: true }, // REMOVED index:true from here
    periodKey: { type: String, required: true }, // REMOVED index:true from here
    periodCovered: { type: String, required: true },

    accountName: { type: String, default: "" },
    classification: { type: String, default: "residential" },
    addressText: { type: String, default: "" },

    // ✅ Option C identity
    meterNumber: { type: String, required: true }, // REMOVED index:true from here

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
    // Full tariff context this bill was PRICED with — { tariffs: { <class>: [...tiers] }, seniorDiscount }.
    // A later Water Settings tariff change never re-prices this bill: any
    // recompute (e.g. a reading correction) reuses this snapshot, so old
    // bills stay on the old tariff and only NEW bills use the new one.
    tariffSnapshot: { type: Object, default: null },

    penaltyTypeUsed: { type: String, default: "flat" },
    penaltyValueUsed: { type: Number, default: 0 },
    dueDayUsed: { type: Number, default: 15 },
    graceDaysUsed: { type: Number, default: 0 },

    penaltyApplied: { type: Number, default: 0 },
    totalDue: { type: Number, default: 0 },
    dueDate: { type: Date, default: null },

    // Disconnection signals — set by ensureOverdueAndPenalty when grace runs
    // out so the disconnection queue can join on them.
    daysOverdue: { type: Number, default: 0 },
    subjectForDisconnection: { type: Boolean, default: false, index: true },

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

// ✅ KEEP THIS - it creates the unique compound index
WaterBillSchema.index({ pnNo: 1, periodKey: 1, meterNumber: 1 }, { unique: true });

// REMOVE these duplicate single-field indexes since they're covered by the compound index
// WaterBillSchema.index({ status: 1 });
// WaterBillSchema.index({ classification: 1 });
// WaterBillSchema.index({ meterNumber: 1 });
// WaterBillSchema.index({ periodKey: 1 });

// IF you frequently query by status alone, you might want to keep this one:
// IF you frequently query by status alone, you might want to keep this one:
WaterBillSchema.index({ status: 1 }); // Keep this if you often filter by status only
// Period-wide queries (analytics, reports, period exports) — the unique index
// above starts with pnNo, so a period-only filter can't use it.
WaterBillSchema.index({ periodKey: 1, status: 1 });
// "latest paid bill per (pn, meter)" — fallback for /my-batch when
// a meter has no dedicated reading row yet. Index-only scan + limit 1
// instead of a collection scan filtered by status.
WaterBillSchema.index({ pnNo: 1, status: 1, periodKey: -1 });
// "member bills, newest first" — the member detail screen and the
// cashier dues lookup both query this exact shape.
WaterBillSchema.index({ pnNo: 1, periodKey: -1 });
// Prior-unsettled scan in /my-batch — currently a collection-wide
// status+periodKey filter; this gives us an index path scoped per PN.
WaterBillSchema.index({ pnNo: 1, status: 1, periodKey: 1 });

const WaterBill =
  mongoose.models.WaterBill ||
  mongoose.model("WaterBill", WaterBillSchema);

export default WaterBill;
