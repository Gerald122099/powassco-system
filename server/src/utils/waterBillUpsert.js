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
 * Upsert ONE bill per account per period (multi-meter supported)
 *
 * @param member - WaterMember doc (already loaded)
 * @param periodCovered - "YYYY-MM"
 * @param meterReadings - [{ meterNumber, previousReading, presentReading, multiplier }]
 */
export async function upsertWaterBill({
  member,
  periodCovered,          // "YYYY-MM"
  meterReadings,          // required
  readingDate = new Date(),
  readerId = "",
  remarks = "",
  createdBy = "",
}) {
  if (!member) throw new Error("Member is required");
  if (!periodCovered) throw new Error("periodCovered is required");
  if (!Array.isArray(meterReadings) || meterReadings.length === 0) {
    throw new Error("meterReadings is required");
  }

  const settings = await WaterSettings.findOne();
  if (!settings) throw new Error("Water settings not found");

  const classification = member.billing?.classification || "residential";

  // Normalize + validate readings
  const breakdown = meterReadings.map((r) => {
    const meterNo = String(r.meterNumber || "").toUpperCase().trim();
    const prev = Number(r.previousReading ?? 0);
    const pres = Number(r.presentReading ?? 0);
    const mult = Number(r.multiplier ?? 1);

    if (!meterNo) throw new Error("meterNumber is required in meterReadings[]");
    if (Number.isNaN(prev) || Number.isNaN(pres) || Number.isNaN(mult)) {
      throw new Error(`Invalid reading values for meter ${meterNo}`);
    }
    if (pres < prev) {
      throw new Error(`Present reading must be >= previous reading for meter ${meterNo}`);
    }
    if (mult <= 0) {
      throw new Error(`Multiplier must be > 0 for meter ${meterNo}`);
    }

    const rawConsumed = Math.max(0, pres - prev);
    const consumed = rawConsumed * mult;

    return {
      meterNumber: meterNo,
      previousReading: prev,
      presentReading: pres,
      rawConsumed,
      multiplier: mult,
      consumed,
    };
  });

  const totalConsumed = breakdown.reduce((sum, x) => sum + x.consumed, 0);

  // Compute tariff + discounts using your existing logic (already supports member discounts)
  const computation = await calculateWaterBill(totalConsumed, classification, member);

  const dueDate = calculateDueDate(periodCovered, settings);

  // ✅ Match your schema unique index: { pnNo, periodKey }
  const filter = { pnNo: member.pnNo, periodKey: periodCovered };

  // If already paid, do not change it
  const existing = await WaterBill.findOne(filter);
  if (existing && existing.status === "paid") {
    return { bill: existing, computation, totalConsumed, breakdown };
  }

  // Choose a display meterNumber for UI:
  // - if only one meter => that meter
  // - if multiple => show first meter (or join, but keep short)
  const displayMeterNumber =
    breakdown.length === 1 ? breakdown[0].meterNumber : breakdown[0].meterNumber;

  // Optional: meterSnapshot for single-meter (or first meter)
  // Pull from member.meters if exists
  const meterDoc = (member.meters || []).find(
    (m) => String(m.meterNumber || "").toUpperCase().trim() === displayMeterNumber
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

  const update = {
    pnNo: member.pnNo,
    accountName: member.accountName,
    classification,
    addressText: member.fullAddress || "",
    periodCovered,
    periodKey: periodCovered,

    // ✅ required numeric fields (keep simple + consistent)
    // For multi-meter bills, these legacy fields are informational only.
    previousReading: toMoney(breakdown.reduce((s, x) => s + x.previousReading, 0)),
    presentReading: toMoney(breakdown.reduce((s, x) => s + x.presentReading, 0)),
    consumed: toMoney(totalConsumed),

    // ✅ multi-meter lines
    meterReadings: breakdown,

    // ✅ for UI table column
    meterNumber: displayMeterNumber,

    // ✅ meter snapshot (optional but helpful)
    meterSnapshot,

    // ✅ bill computation snapshot
    amount: toMoney(computation.amount),
    baseAmount: toMoney(computation.baseAmount),
    discount: toMoney(computation.discount),
    discountReason: computation.discountReason || "",
    tariffUsed: computation.tariffUsed || null,

    // ✅ settings snapshot
    penaltyTypeUsed: settings.penaltyType || "flat",
    penaltyValueUsed: settings.penaltyValue || 0,
    dueDayUsed: settings.dueDayOfMonth || 15,
    graceDaysUsed: settings.graceDays || 0,

    // ✅ totals
    penaltyApplied: 0,
    totalDue: toMoney(computation.amount),
    dueDate,

    // ✅ dates & meta
    readingDate: readingDate ? new Date(readingDate) : new Date(),
    readerId,
    remarks,
    createdBy,

    // ✅ member snapshot (discount eligibility)
    memberSnapshot: {
      isSeniorCitizen: member.personal?.isSeniorCitizen || false,
      seniorId: member.personal?.seniorId || "",
      seniorDiscountRate: member.personal?.seniorDiscountRate || 0,
      hasPWD: member.billing?.hasPWD || false,
      pwdDiscountRate: member.billing?.pwdDiscountRate || 0,
      discountApplicableTiers: member.billing?.discountApplicableTiers || [],
    },

    // If compute didn't return a tariffUsed, mark for review
    needsTariffReview: !computation?.tariffUsed,
  };

  const bill = await WaterBill.findOneAndUpdate(
    filter,
    { $set: update, $setOnInsert: { status: "unpaid" } },
    { new: true, upsert: true }
  );

  return { bill, computation, totalConsumed, breakdown };
}
