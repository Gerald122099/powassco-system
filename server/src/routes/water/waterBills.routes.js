import express from "express";
import WaterBill from "../../models/WaterBill.js";
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

// Uses bill snapshot fields => prevents totals changing when settings change later
async function ensureOverdueAndPenalty(bill, now = new Date()) {
  if (!bill) return bill;
  if (bill.status === "paid") return bill;

  const pastDue = isPastDue(bill.dueDate, now);
  if (!pastDue) return bill;

  if (bill.status === "unpaid") bill.status = "overdue";

  const penaltyShouldBe = computePenalty(bill.amount, bill.penaltyTypeUsed, bill.penaltyValueUsed);
  const totalShouldBe = toMoney(Number(bill.amount || 0) + penaltyShouldBe);

  // apply if missing or inconsistent
  if (
    Number(bill.penaltyApplied || 0) !== penaltyShouldBe ||
    Number(bill.totalDue || 0) !== totalShouldBe
  ) {
    bill.penaltyApplied = penaltyShouldBe;
    bill.totalDue = totalShouldBe;
    bill.penaltyComputedAt = new Date();
  }

  await bill.save();
  return bill;
}

// Function to calculate due date using settings
function calculateDueDate(periodKey, settings) {
  const [year, month] = periodKey.split('-').map(Number);
  const dueDay = settings?.dueDayOfMonth || 15;
  const graceDays = settings?.graceDays || 0;
  
  // Due date is in the next month
  const due = new Date(year, month, 1); // month is 1-based, next month
  const day = Math.min(31, Math.max(1, Number(dueDay)));
  due.setDate(day);
  
  // Clamp to last day of month
  const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
  due.setDate(Math.min(due.getDate(), lastDay));
  
  // Add grace days
  if (graceDays > 0) {
    due.setDate(due.getDate() + graceDays);
  }
  
  return due;
}

// Create a new water bill with new tariff computation
router.post("/", ...guard, async (req, res) => {
  try {
    const {
      pnNo,
      periodCovered,
      previousReading,
      presentReading,
      readingDate,
      readerId,
      remarks,
      meterNumber // Optional specific meter number
    } = req.body;

    // Validate required fields
    if (!pnNo || !periodCovered || !previousReading || !presentReading) {
      return res.status(400).json({ 
        message: "Missing required fields: pnNo, periodCovered, previousReading, presentReading" 
      });
    }

    // Get member details
    const member = await WaterMember.findOne({ pnNo: pnNo.toUpperCase() });
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    if (member.accountStatus !== "active") {
      return res.status(400).json({ 
        message: `Account is ${member.accountStatus}. Cannot generate bill.` 
      });
    }

    // Validate meter if specified
    let specificMeter = null;
    if (meterNumber) {
      specificMeter = member.getMeter(meterNumber);
      if (!specificMeter) {
        return res.status(404).json({ message: "Meter not found for this account" });
      }
      if (specificMeter.meterStatus !== "active" || !specificMeter.isBillingActive) {
        return res.status(400).json({ message: "Specified meter is not active for billing" });
      }
    } else {
      // Get primary meter (first active billing meter)
      specificMeter = member.billingMeters[0];
      if (!specificMeter) {
        return res.status(400).json({ message: "No active billing meter found for this account" });
      }
    }

    // Calculate consumption
    const consumption = Math.max(0, presentReading - previousReading);
    
    // Get classification from member
    const classification = member.billing?.classification || "residential";
    
    // Get water settings
    const waterSettings = await WaterSettings.findOne();

    // Compute bill with NEW tariff and discounts
    const billComputation = await calculateWaterBill(consumption, classification, member);

    // Calculate due date using settings
    const dueDate = calculateDueDate(periodCovered, waterSettings);

    // Check if bill already exists for this period
    const existingBill = await WaterBill.findOne({ 
      pnNo: pnNo.toUpperCase(), 
      periodCovered 
    });
    
    if (existingBill) {
      return res.status(409).json({ 
        message: "Bill already exists for this period",
        existingBill 
      });
    }

    // Create new bill
    const newBill = await WaterBill.create({
      pnNo: pnNo.toUpperCase(),
      accountName: member.accountName,
      classification: classification,
      addressText: member.fullAddress,
      periodCovered,
      periodKey: periodCovered, // Store as key for filtering
      previousReading: Number(previousReading),
      presentReading: Number(presentReading),
      consumed: consumption,
      
      // Meter information
      meterNumber: specificMeter.meterNumber,
      meterSnapshot: {
        meterNumber: specificMeter.meterNumber,
        meterBrand: specificMeter.meterBrand,
        meterModel: specificMeter.meterModel,
        meterSize: specificMeter.meterSize,
        meterCondition: specificMeter.meterCondition,
        location: specificMeter.location
      },
      
      // Bill computation results
      amount: billComputation.amount,
      baseAmount: billComputation.baseAmount,
      discount: billComputation.discount,
      discountReason: billComputation.discountReason,
      tariffUsed: billComputation.tariffUsed,
      
      // Penalty settings (snapshot from water settings)
      penaltyTypeUsed: waterSettings?.penaltyType || "flat",
      penaltyValueUsed: waterSettings?.penaltyValue || 0,
      penaltyApplied: 0, // Initial - no penalty yet
      
      // Due date settings snapshot
      dueDayUsed: waterSettings?.dueDayOfMonth || 15,
      graceDaysUsed: waterSettings?.graceDays || 0,
      
      // Totals
      totalDue: billComputation.amount,
      
      // Dates
      readingDate: readingDate ? new Date(readingDate) : new Date(),
      dueDate,
      
      // Status
      status: "unpaid",
      
      // Additional info
      readerId: readerId || req.user?.employeeId || "",
      remarks: remarks || "",
      
      // Member snapshot
      memberSnapshot: {
        isSeniorCitizen: member.personal?.isSeniorCitizen || false,
        seniorId: member.personal?.seniorId || "",
        seniorDiscountRate: member.personal?.seniorDiscountRate || 0,
        hasPWD: member.billing?.hasPWD || false,
        pwdDiscountRate: member.billing?.pwdDiscountRate || 0,
        discountApplicableTiers: member.billing?.discountApplicableTiers || [],
      }
    });

    // Update meter's last reading
    const meterIndex = member.meters.findIndex(m => 
      m.meterNumber === specificMeter.meterNumber
    );
    
    if (meterIndex !== -1) {
      member.meters[meterIndex].lastReading = presentReading;
      member.meters[meterIndex].lastReadingDate = new Date();
      member.markModified('meters');
      await member.save();
    }

    // Update member's average consumption
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
      error: process.env.NODE_ENV === "development" ? error.stack : undefined 
    });
  }
});

// Compute bill preview with new tariff
router.post("/preview", ...guard, async (req, res) => {
  try {
    const { pnNo, previousReading, presentReading, meterNumber } = req.body;

    if (!pnNo || !previousReading || !presentReading) {
      return res.status(400).json({ 
        message: "Missing required fields: pnNo, previousReading, presentReading" 
      });
    }

    // Get member details
    const member = await WaterMember.findOne({ pnNo: pnNo.toUpperCase() });
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Validate meter if specified
    let selectedMeter = null;
    if (meterNumber) {
      selectedMeter = member.getMeter(meterNumber);
      if (!selectedMeter) {
        return res.status(404).json({ message: "Meter not found for this account" });
      }
    } else {
      // Use primary meter
      selectedMeter = member.billingMeters[0];
      if (!selectedMeter) {
        return res.status(400).json({ message: "No active billing meter found" });
      }
    }

    // Calculate consumption
    const consumption = Math.max(0, presentReading - previousReading);
    const classification = member.billing?.classification || "residential";

    // Get settings for tariffs
    const settings = await WaterSettings.findOne();
    if (!settings) {
      return res.status(404).json({ message: "Water settings not found" });
    }

    // Get applicable tariff for preview
    const tariffArray = classification === "residential" 
      ? (settings.tariffs?.residential || [])
      : (settings.tariffs?.commercial || []);
    
    const tariff = tariffArray.find(t => 
      t.isActive && 
      consumption >= t.minConsumption && 
      consumption <= t.maxConsumption
    );

    if (!tariff) {
      return res.status(400).json({ 
        message: `No tariff schedule found for ${consumption}m³ consumption` 
      });
    }

    // Compute preview using new calculation
    const computation = await calculateWaterBill(consumption, classification, member);

    res.json({
      pnNo,
      accountName: member.accountName,
      classification,
      meterNumber: selectedMeter.meterNumber,
      previousReading: Number(previousReading),
      presentReading: Number(presentReading),
      consumption,
      preview: computation,
      tariff: tariff,
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
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// Get tariff examples for UI display
router.get("/tariff-examples/:classification", ...guard, async (req, res) => {
  try {
    const { classification } = req.params;
    
    if (!["residential", "commercial"].includes(classification)) {
      return res.status(400).json({ message: "Invalid classification" });
    }
    
    const examples = getTariffExamples(classification);
    
    res.json({
      classification,
      examples,
      description: classification === "residential" 
        ? "Residential: ₱74.00 minimum for 0-5 m³, then tiered rates"
        : "Commercial: ₱442.50 minimum for 0-15 m³, then tiered rates"
    });
  } catch (error) {
    console.error("Error getting tariff examples:", error);
    res.status(500).json({ 
      message: "Failed to get tariff examples",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// Helper function for tariff examples
function getTariffExamples(classification) {
  if (classification === "residential") {
    return [
      { consumption: 5, amount: 74.00, description: "0-5 m³ = ₱74.00 (minimum charge)" },
      { consumption: 6, amount: 90.20, description: "6 m³ = ₱74.00 + (1 × ₱16.20) = ₱90.20" },
      { consumption: 10, amount: 155.00, description: "10 m³ = ₱74.00 + (5 × ₱16.20) = ₱155.00" },
      { consumption: 20, amount: 332.00, description: "20 m³ = ₱74.00 + (15 × ₱17.70) = ₱332.00" },
      { consumption: 30, amount: 524.00, description: "30 m³ = ₱74.00 + (25 × ₱19.20) = ₱524.00" },
      { consumption: 40, amount: 731.00, description: "40 m³ = ₱74.00 + (35 × ₱20.70) = ₱731.00" },
      { consumption: 50, amount: 953.00, description: "50 m³ = ₱74.00 + (45 × ₱22.20) = ₱953.00" },
      { consumption: 60, amount: 1175.00, description: "60 m³ = ₱74.00 + (55 × ₱22.20) = ₱1,175.00" },
      { consumption: 70, amount: 1397.00, description: "70 m³ = ₱74.00 + (65 × ₱22.20) = ₱1,397.00" },
      { consumption: 80, amount: 1619.00, description: "80 m³ = ₱74.00 + (75 × ₱22.20) = ₱1,619.00" }
    ];
  } else if (classification === "commercial") {
    return [
      { consumption: 15, amount: 442.50, description: "0-15 m³ = ₱442.50 (minimum charge)" },
      { consumption: 16, amount: 475.00, description: "16 m³ = ₱442.50 + (1 × ₱32.50) = ₱475.00" },
      { consumption: 20, amount: 605.00, description: "20 m³ = ₱442.50 + (5 × ₱32.50) = ₱605.00" },
      { consumption: 30, amount: 930.00, description: "30 m³ = ₱442.50 + (15 × ₱32.50) = ₱930.00" },
      { consumption: 31, amount: 965.40, description: "31 m³ = ₱442.50 + (16 × ₱35.40) = ₱965.40" },
      { consumption: 40, amount: 1284.00, description: "40 m³ = ₱442.50 + (25 × ₱35.40) = ₱1,284.00" },
      { consumption: 50, amount: 1638.00, description: "50 m³ = ₱442.50 + (35 × ₱35.40) = ₱1,638.00" },
      { consumption: 70, amount: 2346.00, description: "70 m³ = ₱442.50 + (55 × ₱35.40) = ₱2,346.00" },
      { consumption: 90, amount: 3054.00, description: "90 m³ = ₱442.50 + (75 × ₱35.40) = ₱3,054.00" }
    ];
  }
  
  return [];
}

// GET /api/water/bills?q=&status=&page=&limit=&classification=&month=&year=
router.get("/", ...guard, async (req, res) => {
  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();
  const classification = (req.query.classification || "").trim();
  const month = req.query.month;
  const year = req.query.year;
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "12", 10)));
  const skip = (page - 1) * limit;

  const filter = {};
  if (status) filter.status = status;
  if (classification) filter.classification = classification;

  // Filter by month/year in periodCovered
  if (month && year) {
    const periodPattern = `${year}-${month.padStart(2, '0')}`;
    filter.periodCovered = { $regex: `^${periodPattern}` };
  } else if (year) {
    filter.periodCovered = { $regex: `^${year}` };
  }

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
  await WaterBill.updateMany(
    { status: "unpaid", dueDate: { $lte: new Date() } },
    { $set: { status: "overdue" } }
  );

  const [items, total] = await Promise.all([
    WaterBill.find(filter)
      .sort({ periodCovered: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    WaterBill.countDocuments(filter),
  ]);

  // ensure penalty applied for overdue/past-due items in this page
  const now = new Date();
  for (const b of items) {
    if (b.status !== "paid" && isPastDue(b.dueDate, now)) {
      await ensureOverdueAndPenalty(b, now);
    }
  }

  // re-fetch updated page so UI receives correct totals
  const refreshed = await WaterBill.find(filter)
    .sort({ periodCovered: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Calculate summary statistics
  const summary = {
    totalBills: total,
    totalAmount: 0,
    totalDiscount: 0,
    totalPenalty: 0,
    byClassification: {},
    withoutTariff: 0,
  };

  refreshed.forEach(bill => {
    summary.totalAmount += bill.totalDue || 0;
    summary.totalDiscount += bill.discount || 0;
    summary.totalPenalty += bill.penaltyApplied || 0;
    
    const classification = bill.classification || "unknown";
    summary.byClassification[classification] = (summary.byClassification[classification] || 0) + 1;
    
    if (!bill.tariffUsed) {
      summary.withoutTariff += 1;
    }
  });

  summary.totalAmount = toMoney(summary.totalAmount);
  summary.totalDiscount = toMoney(summary.totalDiscount);
  summary.totalPenalty = toMoney(summary.totalPenalty);

  res.json({ 
    items: refreshed, 
    total, 
    page, 
    limit,
    summary 
  });
});

// PAY BILL ROUTE
router.post("/:id/pay", ...guard, async (req, res) => {
  try {
    const { orNo, method } = req.body;
    
    // Validation
    if (!orNo || !method) {
      return res.status(400).json({ 
        message: "OR Number and payment method are required" 
      });
    }

    // Trim inputs
    const trimmedOrNo = orNo.trim();
    const trimmedMethod = method.trim();

    // Find the bill
    const bill = await WaterBill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    // Check bill status
    if (bill.status === "paid") {
      return res.status(400).json({ message: "Bill is already paid" });
    }

    // Check if bill is valid for payment
    if (bill.totalDue <= 0) {
      return res.status(400).json({ message: "Bill amount must be greater than 0" });
    }

    // Check for duplicate OR number
    const existingPayment = await WaterPayment.findOne({ orNo: trimmedOrNo });
    if (existingPayment) {
      return res.status(409).json({ 
        message: `OR Number ${trimmedOrNo} already used for another payment` 
      });
    }

    // Create payment record
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

    // Update bill status
    bill.status = "paid";
    bill.paidAt = new Date();
    bill.orNo = trimmedOrNo;
    await bill.save();

    // Update member's payment history
    const member = await WaterMember.findOne({ pnNo: bill.pnNo });
    if (member && member.billing) {
      member.billing.lastPaymentDate = new Date();
      member.billing.lastPaymentAmount = bill.totalDue;
      
      // Update average consumption if needed
      if (member.billing.averageMonthlyConsumption === undefined) {
        member.billing.averageMonthlyConsumption = bill.consumed;
      } else {
        // Recalculate average
        const prevAvg = member.billing.averageMonthlyConsumption || 0;
        const newAvg = prevAvg > 0 ? (prevAvg + bill.consumed) / 2 : bill.consumed;
        member.billing.averageMonthlyConsumption = toMoney(newAvg);
      }
      
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
        status: bill.status,
        paidAt: bill.paidAt,
        orNo: bill.orNo,
      },
    });
  } catch (error) {
    console.error("Payment processing error:", error);
    
    // Handle specific errors
    if (error.code === 11000) {
      return res.status(409).json({ 
        message: "OR Number already exists. Please use a unique OR Number." 
      });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        message: "Payment validation failed", 
        errors: messages 
      });
    }
    
    res.status(500).json({ 
      message: "Failed to process payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET payment history for a specific bill
router.get("/:id/payments", ...guard, async (req, res) => {
  try {
    const bill = await WaterBill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const payments = await WaterPayment.find({ billId: bill._id }).sort({ paidAt: -1 });
    
    res.json({
      billId: bill._id,
      pnNo: bill.pnNo,
      periodCovered: bill.periodCovered,
      totalDue: bill.totalDue,
      status: bill.status,
      payments: payments,
    });
  } catch (error) {
    console.error("Error fetching bill payments:", error);
    res.status(500).json({ 
      message: "Failed to fetch payment history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET single bill by ID
router.get("/:id", ...guard, async (req, res) => {
  try {
    const bill = await WaterBill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    // Ensure penalty is up to date if bill is unpaid/overdue
    if (bill.status !== "paid" && isPastDue(bill.dueDate)) {
      await ensureOverdueAndPenalty(bill);
    }

    res.json(bill);
  } catch (error) {
    console.error("Error fetching bill:", error);
    res.status(500).json({ 
      message: "Failed to fetch bill",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// DELETE bill (with checks)
router.delete("/:id", ...guard, async (req, res) => {
  try {
    const bill = await WaterBill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    // Check if bill has payments
    const hasPayments = await WaterPayment.exists({ billId: bill._id });
    if (hasPayments) {
      return res.status(400).json({ 
        message: "Cannot delete bill with existing payments. Void payment first." 
      });
    }

    await bill.deleteOne();
    
    res.json({ 
      message: "Bill deleted successfully",
      billId: req.params.id,
    });
  } catch (error) {
    console.error("Error deleting bill:", error);
    res.status(500).json({ 
      message: "Failed to delete bill",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// Get bills by meter number
router.get("/meter/:meterNumber", ...guard, async (req, res) => {
  try {
    const { meterNumber } = req.params;
    const { limit = 12, page = 1 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const bills = await WaterBill.find({ meterNumber: meterNumber.toUpperCase() })
      .sort({ periodCovered: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await WaterBill.countDocuments({ meterNumber: meterNumber.toUpperCase() });
    
    res.json({
      meterNumber,
      bills,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error("Error fetching bills by meter:", error);
    res.status(500).json({ 
      message: "Failed to fetch bills by meter",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

export default router;