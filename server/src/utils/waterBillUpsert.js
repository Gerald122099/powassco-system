// utils/waterBillUpsert.js
import WaterBill from "../models/WaterBill.js";
import WaterSettings from "../models/WaterSettings.js";
import { calculateWaterBill } from "./waterBillingNew.js";

function toMoney(n) {
  return Number((Number(n || 0)).toFixed(2));
}

function calculateDueDate(periodKey, settings) {
  const [year, month] = periodKey.split("-").map(Number);
  const dueDay = settings?.dueDayOfMonth || 15;
  const graceDays = settings?.graceDays || 0;

  // Due date is in next month
  const due = new Date(year, month, 1);
  const day = Math.min(31, Math.max(1, Number(dueDay)));
  due.setDate(day);

  const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
  due.setDate(Math.min(due.getDate(), lastDay));

  if (graceDays > 0) due.setDate(due.getDate() + graceDays);
  return due;
}

/**
 * Upsert ONE bill per METER per period
 *
 * @param member - WaterMember doc
 * @param periodCovered - "YYYY-MM"
 * @param meterReading - { meterNumber, previousReading, presentReading, multiplier }
 */
export async function upsertWaterBill({
  member,
  periodCovered,          // "YYYY-MM"
  meterReading,           // required (single)
  readingDate = new Date(),
  readerId = "",
  remarks = "",
  createdBy = "",
}) {
  if (!member) throw new Error("Member is required");
  if (!periodCovered) throw new Error("periodCovered is required");
  if (!meterReading) throw new Error("meterReading is required");

  const settings = await WaterSettings.findOne();
  if (!settings) throw new Error("Water settings not found");

  const classification = member.billing?.classification || "residential";

  // Normalize + validate
  const meterNo = String(meterReading.meterNumber || "").toUpperCase().trim();
  const prev = Number(meterReading.previousReading ?? 0);
  const pres = Number(meterReading.presentReading ?? 0);
  const mult = Number(meterReading.multiplier ?? 1);

  if (!meterNo) throw new Error("meterNumber is required");
  if (Number.isNaN(prev) || Number.isNaN(pres) || Number.isNaN(mult)) {
    throw new Error(`Invalid reading values for meter ${meterNo}`);
  }
  if (pres < prev) throw new Error(`Present reading must be >= previous reading for meter ${meterNo}`);
  if (mult <= 0) throw new Error(`Multiplier must be > 0 for meter ${meterNo}`);

  const rawConsumed = Math.max(0, pres - prev);
  const consumed = rawConsumed * mult;

  // Compute tariff/discounts based on THIS meter consumption only
  const computation = await calculateWaterBill(consumed, classification, member);

  const dueDate = calculateDueDate(periodCovered, settings);

  // ✅ NEW: one bill per meter
  const filter = { pnNo: member.pnNo, periodKey: periodCovered, meterNumber: meterNo };

  // If already paid, do not change it (paid per meter now)
  const existing = await WaterBill.findOne(filter);
  if (existing && existing.status === "paid") {
    return { bill: existing, computation, consumed, breakdown: existing.meterReadings || [] };
  }

  // meter snapshot (optional)
  const meterDoc = (member.meters || []).find(
    (m) => String(m.meterNumber || "").toUpperCase().trim() === meterNo
  );

  const meterSnapshot = meterDoc
    ? {
        meterNumber: meterDoc.meterNumber,
        meterBrand: meterDoc.meterBrand || "",
        meterModel: meterDoc.meterModel || "",
        meterSize: meterDoc.meterSize || "",
        meterCondition: meterDoc.meterCondition || "",
        location: meterDoc.location || null,
      }
    : null;

  const breakdown = [
    {
      meterNumber: meterNo,
      previousReading: prev,
      presentReading: pres,
      rawConsumed,
      multiplier: mult,
      consumed,
    },
  ];

  const update = {
    pnNo: member.pnNo,
    accountName: member.accountName,
    classification,
    addressText: member.fullAddress || "",
    periodCovered,
    periodKey: periodCovered,

    meterNumber: meterNo,

    // legacy summary fields
    previousReading: toMoney(prev),
    presentReading: toMoney(pres),
    consumed: toMoney(consumed),

    meterReadings: breakdown,
    meterSnapshot,

    amount: toMoney(computation.amount),
    baseAmount: toMoney(computation.baseAmount),
    discount: toMoney(computation.discount),
    discountReason: computation.discountReason || "",
    tariffUsed: computation.tariffUsed || null,

    penaltyTypeUsed: settings.penaltyType || "flat",
    penaltyValueUsed: settings.penaltyValue || 0,
    dueDayUsed: settings.dueDayOfMonth || 15,
    graceDaysUsed: settings.graceDays || 0,

    penaltyApplied: 0,
    totalDue: toMoney(computation.amount),
    dueDate,

    readingDate: readingDate ? new Date(readingDate) : new Date(),
    readerId,
    remarks,
    createdBy,

    memberSnapshot: {
      isSeniorCitizen: member.personal?.isSeniorCitizen || false,
      seniorId: member.personal?.seniorId || "",
      seniorDiscountRate: member.personal?.seniorDiscountRate || 0,
      hasPWD: member.billing?.hasPWD || false,
      pwdDiscountRate: member.billing?.pwdDiscountRate || 0,
      discountApplicableTiers: member.billing?.discountApplicableTiers || [],
    },

    needsTariffReview: !computation?.tariffUsed,
  };

  const bill = await WaterBill.findOneAndUpdate(
    filter,
    { $set: update, $setOnInsert: { status: "unpaid" } },
    { new: true, upsert: true }
  );

  return { bill, computation, consumed, breakdown };
}
