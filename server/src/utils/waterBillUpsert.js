// utils/waterBillUpsert.js
import WaterBill from "../models/WaterBill.js";
import WaterSettings from "../models/WaterSettings.js";
import { calculateWaterBill } from "./waterBilling.js";

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
  periodCovered,
  meterReading,
  readingDate = new Date(),
  readerId = "",
  remarks = "",
  createdBy = "",
  forceUpdate = false, // Add this parameter
}) {
  if (!member) throw new Error("Member is required");
  if (!periodCovered) throw new Error("periodCovered is required");
  if (!meterReading) throw new Error("meterReading is required");

  const settings = await WaterSettings.findOne();
  if (!settings) throw new Error("Water settings not found");

  const classification = member.billing?.classification || "residential";

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

  const computation = await calculateWaterBill(consumed, classification, member, meterNo);

  const dueDate = calculateDueDate(periodCovered, settings);

  const filter = { pnNo: member.pnNo, periodKey: periodCovered, meterNumber: meterNo };

  // Check existing bill
  const existing = await WaterBill.findOne(filter);
  
  // If bill is paid and not forcing update, don't change it
  if (existing && existing.status === "paid" && !forceUpdate) {
    return { bill: existing, computation, consumed, breakdown: existing.meterReadings || [] };
  }

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

  // If bill exists and is unpaid, update it
  // If forceUpdate is true, update regardless of status
  const bill = await WaterBill.findOneAndUpdate(
    filter,
    { $set: update, $setOnInsert: { status: "unpaid" } },
    { new: true, upsert: true }
  );

  return { bill, computation, consumed, breakdown };
}

/**
 * Bulk variant of upsertWaterBill — loads settings once, fetches every
 * existing bill in one query, builds the upserts in memory, and runs a
 * single WaterBill.bulkWrite at the end. Used by field-sync's
 * /import-readings so 50 new readings produce 50 bills in roughly the
 * same time it takes to make a single roundtrip to MongoDB.
 *
 * @param items - array of { member, periodCovered, meterReading, readingDate, readerId, remarks, createdBy, forceUpdate }
 * @returns { written, skipped, errors }
 */
export async function upsertWaterBillsBulk(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { written: 0, skipped: 0, errors: [] };
  }

  const settings = await WaterSettings.findOne();
  if (!settings) throw new Error("Water settings not found");

  // Pre-fetch every existing bill for the (pn, period, meter) tuples
  // we'll be touching. We need this both to honour "don't overwrite
  // paid bills" and to know whether to $setOnInsert the status field.
  const pnNosForFetch = [...new Set(items.map((i) => i.member.pnNo))];
  const periodsForFetch = [...new Set(items.map((i) => i.periodCovered))];
  const existingBills = await WaterBill.find({
    pnNo: { $in: pnNosForFetch },
    periodKey: { $in: periodsForFetch },
  })
    .select("pnNo periodKey meterNumber status")
    .lean();
  const existingByKey = new Map();
  for (const b of existingBills) {
    const k = `${b.pnNo}__${b.periodKey}__${String(b.meterNumber).toUpperCase().trim()}`;
    existingByKey.set(k, b);
  }

  const ops = [];
  const errors = [];
  let skipped = 0;

  for (const it of items) {
    try {
      const { member, periodCovered, meterReading, readingDate, readerId, remarks, createdBy, forceUpdate } = it;
      const meterNo = String(meterReading.meterNumber || "").toUpperCase().trim();
      const prev = Number(meterReading.previousReading ?? 0);
      const pres = Number(meterReading.presentReading ?? 0);
      const mult = Number(meterReading.multiplier ?? 1);

      if (!meterNo) throw new Error("meterNumber is required");
      if (Number.isNaN(prev) || Number.isNaN(pres) || Number.isNaN(mult)) {
        throw new Error(`Invalid reading values for meter ${meterNo}`);
      }
      if (pres < prev) throw new Error(`Present reading must be >= previous for meter ${meterNo}`);
      if (mult <= 0) throw new Error(`Multiplier must be > 0 for meter ${meterNo}`);

      const key = `${member.pnNo}__${periodCovered}__${meterNo}`;
      const existing = existingByKey.get(key);
      if (existing && existing.status === "paid" && !forceUpdate) {
        skipped++;
        continue;
      }

      const rawConsumed = Math.max(0, pres - prev);
      const consumed = rawConsumed * mult;
      const classification = member.billing?.classification || "residential";
      const computation = await calculateWaterBill(consumed, classification, member, meterNo);
      const dueDate = calculateDueDate(periodCovered, settings);

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

      const update = {
        pnNo: member.pnNo,
        accountName: member.accountName,
        classification,
        addressText: member.fullAddress || "",
        periodCovered,
        periodKey: periodCovered,
        meterNumber: meterNo,
        previousReading: toMoney(prev),
        presentReading: toMoney(pres),
        consumed: toMoney(consumed),
        meterReadings: [
          { meterNumber: meterNo, previousReading: prev, presentReading: pres, rawConsumed, multiplier: mult, consumed },
        ],
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
        readerId: readerId || "",
        remarks: remarks || "",
        createdBy: createdBy || "",
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

      ops.push({
        updateOne: {
          filter: { pnNo: member.pnNo, periodKey: periodCovered, meterNumber: meterNo },
          update: { $set: update, $setOnInsert: { status: "unpaid" } },
          upsert: true,
        },
      });
    } catch (e) {
      errors.push({ pnNo: it?.member?.pnNo, meterNumber: it?.meterReading?.meterNumber, message: e.message });
    }
  }

  if (ops.length > 0) {
    await WaterBill.bulkWrite(ops, { ordered: false });
  }
  return { written: ops.length, skipped, errors };
}