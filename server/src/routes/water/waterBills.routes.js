// routes/water/waterBills.routes.js (UPDATED for Option C: separate bill per meter)
// ✅ Fixes:
// - Duplicate bill check is now { pnNo, periodKey, meterNumber }
// - Uses periodKey consistently (periodKey = periodCovered "YYYY-MM")
// - "overdue" supported (make sure schema enum includes it)
// - Reads meter.lastReading to update only selected meter

import express from "express";
import WaterBill from "../../models/waterbill.js";
import WaterPayment from "../../models/WaterPayment.js";
import WaterMember from "../../models/WaterMember.js";
import WaterSettings from "../../models/WaterSettings.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { isPastDue } from "../../utils/waterPeriod.js";
import { calculateWaterBill } from "../../utils/waterBillingNew.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader"])];

function toMoney(n) {
  return Number((Number(n || 0)).toFixed(2));
}

function computePenalty(amount, penaltyTypeUsed, penaltyValueUsed) {
  const base = Number(amount || 0);
  const type = penaltyTypeUsed || "flat";
  const val = Number(penaltyValueUsed || 0);

  let p = 0;
  if (type === "percent") p = base * (val / 100);
  else p = val;

  return toMoney(Math.max(0, p));
}

async function ensureOverdueAndPenalty(bill, now = new Date()) {
  if (!bill) return bill;
  if (bill.status === "paid") return bill;

  const pastDue = isPastDue(bill.dueDate, now);
  if (!pastDue) return bill;

  if (bill.status === "unpaid") bill.status = "overdue";

  const penaltyShouldBe = computePenalty(bill.amount, bill.penaltyTypeUsed, bill.penaltyValueUsed);
  const totalShouldBe = toMoney(Number(bill.amount || 0) + penaltyShouldBe);

  if (Number(bill.penaltyApplied || 0) !== penaltyShouldBe || Number(bill.totalDue || 0) !== totalShouldBe) {
    bill.penaltyApplied = penaltyShouldBe;
    bill.totalDue = totalShouldBe;
    bill.penaltyComputedAt = new Date();
  }

  await bill.save();
  return bill;
}

// due date based on settings
function calculateDueDate(periodKey, settings) {
  const [year, month] = periodKey.split("-").map(Number);
  const dueDay = settings?.dueDayOfMonth || 15;
  const graceDays = settings?.graceDays || 0;

  const due = new Date(year, month, 1); // next month (month is 1-based input for Date)
  const day = Math.min(31, Math.max(1, Number(dueDay)));
  due.setDate(day);

  const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
  due.setDate(Math.min(due.getDate(), lastDay));

  if (graceDays > 0) due.setDate(due.getDate() + graceDays);
  return due;
}

// CREATE NEW BILL (Option C: per meter)
router.post("/", ...guard, async (req, res) => {
  try {
    const { pnNo, periodCovered, previousReading, presentReading, readingDate, readerId, remarks, meterNumber } = req.body;

    if (!pnNo || !periodCovered || previousReading === undefined || presentReading === undefined) {
      return res.status(400).json({
        message: "Missing required fields: pnNo, periodCovered, previousReading, presentReading",
      });
    }

    const pn = String(pnNo).toUpperCase().trim();
    const periodKey = String(periodCovered).trim(); // "YYYY-MM"
    const meterNo = String(meterNumber || "").toUpperCase().trim();

    const member = await WaterMember.findOne({ pnNo: pn });
    if (!member) return res.status(404).json({ message: "Member not found" });

    if (member.accountStatus !== "active") {
      return res.status(400).json({ message: `Account is ${member.accountStatus}. Cannot generate bill.` });
    }

    // ✅ Must specify meter for Option C
    if (!meterNo) {
      return res.status(400).json({ message: "meterNumber is required for Option C (separate bill per meter)" });
    }

    const specificMeter = member.getMeter(meterNo);
    if (!specificMeter) return res.status(404).json({ message: "Meter not found for this account" });

    if (specificMeter.meterStatus !== "active" || !specificMeter.isBillingActive) {
      return res.status(400).json({ message: "Specified meter is not active for billing" });
    }

    const prev = Number(previousReading);
    const pres = Number(presentReading);
    if (!Number.isFinite(prev) || !Number.isFinite(pres)) {
      return res.status(400).json({ message: "Invalid readings" });
    }
    if (pres < prev) {
      return res.status(400).json({ message: "Present reading cannot be less than previous reading" });
    }

    const raw = Math.max(0, pres - prev);
    const mult = Number(specificMeter.consumptionMultiplier || 1);
    const consumption = raw * mult;

    const classification = member.billing?.classification || "residential";
    const waterSettings = await WaterSettings.findOne();
    if (!waterSettings) return res.status(404).json({ message: "Water settings not found" });

    const dueDate = calculateDueDate(periodKey, waterSettings);

    // ✅ Option C uniqueness: pnNo + periodKey + meterNumber
    const existingBill = await WaterBill.findOne({
      pnNo: pn,
      periodKey,
      meterNumber: meterNo,
    });
    if (existingBill) {
      return res.status(409).json({ message: "Bill already exists for this meter and period", existingBill });
    }

    const billComputation = await calculateWaterBill(consumption, classification, member);

    const newBill = await WaterBill.create({
      pnNo: pn,
      accountName: member.accountName,
      classification,
      addressText: member.fullAddress || "",
      periodCovered: periodKey,
      periodKey,

      // identity
      meterNumber: meterNo,

      previousReading: prev,
      presentReading: pres,
      consumed: toMoney(consumption),

      // keep line array for compatibility (single line in Option C)
      meterReadings: [
        {
          meterNumber: meterNo,
          previousReading: prev,
          presentReading: pres,
          rawConsumed: raw,
          multiplier: mult,
          consumed: consumption,
        },
      ],

      meterSnapshot: {
        meterNumber: specificMeter.meterNumber,
        meterBrand: specificMeter.meterBrand || "",
        meterModel: specificMeter.meterModel || "",
        meterSize: specificMeter.meterSize || "",
        meterCondition: specificMeter.meterCondition || "",
        location: specificMeter.location || null,
      },

      amount: toMoney(billComputation.amount),
      baseAmount: toMoney(billComputation.baseAmount),
      discount: toMoney(billComputation.discount),
      discountReason: billComputation.discountReason || "",
      tariffUsed: billComputation.tariffUsed || null,

      penaltyTypeUsed: waterSettings.penaltyType || "flat",
      penaltyValueUsed: waterSettings.penaltyValue || 0,
      penaltyApplied: 0,

      dueDayUsed: waterSettings.dueDayOfMonth || 15,
      graceDaysUsed: waterSettings.graceDays || 0,

      totalDue: toMoney(billComputation.amount),
      readingDate: readingDate ? new Date(readingDate) : new Date(),
      dueDate,

      status: "unpaid",
      readerId: readerId || req.user?.employeeId || "",
      remarks: remarks || "",
      createdBy: req.user?.employeeId || req.user?.username || "",

      memberSnapshot: {
        isSeniorCitizen: member.personal?.isSeniorCitizen || false,
        seniorId: member.personal?.seniorId || "",
        seniorDiscountRate: member.personal?.seniorDiscountRate || 0,
        hasPWD: member.billing?.hasPWD || false,
        pwdDiscountRate: member.billing?.pwdDiscountRate || 0,
        discountApplicableTiers: member.billing?.discountApplicableTiers || [],
      },

      needsTariffReview: !billComputation?.tariffUsed,
    });

    // ✅ update only THIS meter lastReading
    const meterIndex = member.meters.findIndex((m) => String(m.meterNumber || "").toUpperCase().trim() === meterNo);
    if (meterIndex !== -1) {
      member.meters[meterIndex].lastReading = pres;
      member.meters[meterIndex].lastReadingDate = new Date();
      member.markModified("meters");
      await member.save();
    }

    // optional avg consumption update
    if (member.billing) {
      const prevAvg = member.billing.averageMonthlyConsumption || 0;
      const newAvg = prevAvg > 0 ? (prevAvg + consumption) / 2 : consumption;
      member.billing.averageMonthlyConsumption = toMoney(newAvg);
      await member.save();
    }

    res.status(201).json({
      message: "Bill created successfully",
      bill: newBill,
      computation: billComputation,
    });
  } catch (error) {
    console.error("Error creating bill:", error);
    res.status(400).json({
      message: error.message || "Failed to create bill",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// PREVIEW (Option C - requires meterNumber)
router.post("/preview", ...guard, async (req, res) => {
  try {
    const { pnNo, previousReading, presentReading, meterNumber } = req.body;

    if (!pnNo || previousReading === undefined || presentReading === undefined || !meterNumber) {
      return res.status(400).json({
        message: "Missing required fields: pnNo, previousReading, presentReading, meterNumber",
      });
    }

    const pn = String(pnNo).toUpperCase().trim();
    const mn = String(meterNumber).toUpperCase().trim();

    const member = await WaterMember.findOne({ pnNo: pn });
    if (!member) return res.status(404).json({ message: "Member not found" });

    const selectedMeter = member.getMeter(mn);
    if (!selectedMeter) return res.status(404).json({ message: "Meter not found for this account" });

    const prev = Number(previousReading);
    const pres = Number(presentReading);
    if (!Number.isFinite(prev) || !Number.isFinite(pres)) {
      return res.status(400).json({ message: "Invalid readings" });
    }
    if (pres < prev) {
      return res.status(400).json({ message: "Present reading cannot be less than previous reading" });
    }

    const raw = Math.max(0, pres - prev);
    const mult = Number(selectedMeter.consumptionMultiplier || 1);
    const consumption = raw * mult;

    const classification = member.billing?.classification || "residential";
    const settings = await WaterSettings.findOne();
    if (!settings) return res.status(404).json({ message: "Water settings not found" });

    const computation = await calculateWaterBill(consumption, classification, member);

    res.json({
      pnNo: pn,
      accountName: member.accountName,
      classification,
      meterNumber: mn,
      previousReading: prev,
      presentReading: pres,
      consumption,
      preview: computation,
      member: {
        isSeniorCitizen: member.personal?.isSeniorCitizen || false,
        seniorId: member.personal?.seniorId || "",
        discountEligibleTiers: member.billing?.discountApplicableTiers || ["31-40", "41+"],
      },
    });
  } catch (error) {
    console.error("Error generating preview:", error);
    res.status(500).json({
      message: "Failed to generate bill preview",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// GET LIST (supports overdue)
router.get("/", ...guard, async (req, res) => {
  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();
  const classification = (req.query.classification || "").trim();
  const month = req.query.month;
  const year = req.query.year;
  const periodKey = req.query.periodKey;
  const pnNos = req.query.pnNos ? req.query.pnNos.split(',') : [];
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "12", 10)));
  const skip = (page - 1) * limit;

  const filter = {};
  
  // Filter by periodKey if provided (used by MeterReadingsPanel)
  if (periodKey) {
    filter.periodKey = periodKey;
  } else if (month && year) {
    // Legacy filtering for BillsPanel
    const periodPattern = `${year}-${String(month).padStart(2, "0")}`;
    filter.periodCovered = { $regex: `^${periodPattern}` };
  } else if (year) {
    filter.periodCovered = { $regex: `^${year}` };
  }

  // Filter by multiple PN Nos if provided (used by MeterReadingsPanel)
  if (pnNos.length > 0) {
    filter.pnNo = { $in: pnNos };
  }

  if (status) filter.status = status;
  if (classification) filter.classification = classification;

  if (q) {
    filter.$or = [
      { pnNo: { $regex: q, $options: "i" } },
      { accountName: { $regex: q, $options: "i" } },
      { periodCovered: { $regex: q, $options: "i" } },
      { "tariffUsed.tier": { $regex: q, $options: "i" } },
      { meterNumber: { $regex: q, $options: "i" } },
    ];
  }

  // mark unpaid as overdue when dueDate passed
  await WaterBill.updateMany({ status: "unpaid", dueDate: { $lte: new Date() } }, { $set: { status: "overdue" } });

  const [items, total] = await Promise.all([
    WaterBill.find(filter).sort({ periodCovered: -1, createdAt: -1 }).skip(skip).limit(limit),
    WaterBill.countDocuments(filter),
  ]);

  const now = new Date();
  for (const b of items) {
    if (b.status !== "paid" && isPastDue(b.dueDate, now)) {
      await ensureOverdueAndPenalty(b, now);
    }
  }

  const refreshed = await WaterBill.find(filter).sort({ periodCovered: -1, createdAt: -1 }).skip(skip).limit(limit);

  const summary = {
    totalBills: total,
    totalAmount: 0,
    totalDiscount: 0,
    totalPenalty: 0,
    byClassification: {},
    withoutTariff: 0,
  };

  refreshed.forEach((bill) => {
    summary.totalAmount += bill.totalDue || 0;
    summary.totalDiscount += bill.discount || 0;
    summary.totalPenalty += bill.penaltyApplied || 0;

    const cls = bill.classification || "unknown";
    summary.byClassification[cls] = (summary.byClassification[cls] || 0) + 1;

    if (!bill.tariffUsed) summary.withoutTariff += 1;
  });

  summary.totalAmount = toMoney(summary.totalAmount);
  summary.totalDiscount = toMoney(summary.totalDiscount);
  summary.totalPenalty = toMoney(summary.totalPenalty);

  res.json({ items: refreshed, total, page, limit, summary });
});

// PAY (unchanged except: allow overdue in UI + schema)
router.post("/:id/pay", ...guard, async (req, res) => {
  try {
    const { orNo, method } = req.body;

    if (!orNo || !method) {
      return res.status(400).json({ message: "OR Number and payment method are required" });
    }

    const trimmedOrNo = orNo.trim();
    const trimmedMethod = method.trim();

    const bill = await WaterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    if (bill.status === "paid") return res.status(400).json({ message: "Bill is already paid" });
    if (bill.totalDue <= 0) return res.status(400).json({ message: "Bill amount must be greater than 0" });

    const existingPayment = await WaterPayment.findOne({ orNo: trimmedOrNo });
    if (existingPayment) return res.status(409).json({ message: `OR Number ${trimmedOrNo} already used for another payment` });

    const payment = await WaterPayment.create({
      billId: bill._id,
      pnNo: bill.pnNo,
      orNo: trimmedOrNo,
      method: trimmedMethod,
      amountPaid: bill.totalDue,
      discountApplied: bill.discount || 0,
      penaltyApplied: bill.penaltyApplied || 0,
      classification: bill.classification,
      receivedBy: req.user?.employeeId || req.user?.username || "system",
      paidAt: new Date(),
      notes: `Payment for ${bill.periodCovered} bill`,
    });

    bill.status = "paid";
    bill.paidAt = new Date();
    bill.orNo = trimmedOrNo;
    await bill.save();

    const member = await WaterMember.findOne({ pnNo: bill.pnNo });
    if (member && member.billing) {
      member.billing.lastPaymentDate = new Date();
      member.billing.lastPaymentAmount = bill.totalDue;

      const prevAvg = member.billing.averageMonthlyConsumption || 0;
      const newAvg = prevAvg > 0 ? (prevAvg + (bill.consumed || 0)) / 2 : (bill.consumed || 0);
      member.billing.averageMonthlyConsumption = toMoney(newAvg);

      await member.save();
    }

    res.json({
      message: "Payment recorded successfully",
      payment: {
        _id: payment._id,
        orNo: payment.orNo,
        method: payment.method,
        amountPaid: payment.amountPaid,
        paidAt: payment.paidAt,
        receivedBy: payment.receivedBy,
      },
      bill: {
        _id: bill._id,
        pnNo: bill.pnNo,
        periodCovered: bill.periodCovered,
        meterNumber: bill.meterNumber,
        status: bill.status,
        paidAt: bill.paidAt,
        orNo: bill.orNo,
      },
    });
  } catch (error) {
    console.error("Payment processing error:", error);
    if (error.code === 11000) return res.status(409).json({ message: "OR Number already exists. Please use a unique OR Number." });
    res.status(500).json({ message: "Failed to process payment", error: process.env.NODE_ENV === "development" ? error.message : undefined });
  }
});

router.get("/:id/payments", ...guard, async (req, res) => {
  try {
    const bill = await WaterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    const payments = await WaterPayment.find({ billId: bill._id }).sort({ paidAt: -1 });
    res.json({ billId: bill._id, pnNo: bill.pnNo, periodCovered: bill.periodCovered, totalDue: bill.totalDue, status: bill.status, payments });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch payment history" });
  }
});

router.get("/:id", ...guard, async (req, res) => {
  try {
    const bill = await WaterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    if (bill.status !== "paid" && isPastDue(bill.dueDate)) await ensureOverdueAndPenalty(bill);
    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch bill" });
  }
});

router.delete("/:id", ...guard, async (req, res) => {
  try {
    const bill = await WaterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    const hasPayments = await WaterPayment.exists({ billId: bill._id });
    if (hasPayments) return res.status(400).json({ message: "Cannot delete bill with existing payments. Void payment first." });

    await bill.deleteOne();
    res.json({ message: "Bill deleted successfully", billId: req.params.id });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete bill" });
  }
});

export default router;