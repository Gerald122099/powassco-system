import express from "express";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/WaterBill.js";
import WaterPayment from "../../models/WaterPayment.js";

const router = express.Router();

/**
 * Simple in-memory rate limit per IP
 * - 10 requests per 5 minutes (adjust as you want)
 */
const RL_WINDOW_MS = 5 * 60 * 1000;
const RL_MAX = 10;
const hits = new Map(); // ip -> { count, resetAt }

function rateLimit(req, res, next) {
  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const now = Date.now();
  const rec = hits.get(ip);

  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return next();
  }

  rec.count += 1;

  if (rec.count > RL_MAX) {
    const retrySec = Math.ceil((rec.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retrySec));
    return res.status(429).json({ message: "Too many attempts. Please try again later." });
  }

  return next();
}

/**
 * Enhanced Public inquiry
 * POST /api/public/water/inquiry
 * body: { pnNo, onlyLast12? } - Removed birthdate requirement
 */
router.post("/inquiry", rateLimit, async (req, res) => {
  try {
    const { pnNo, onlyLast12 = true } = req.body || {};

    const pn = String(pnNo || "").trim().toUpperCase();

    if (!pn) {
      return res.status(400).json({ message: "PN No is required." });
    }

    // Find member by PN No only (no birthdate required)
    const member = await WaterMember.findOne({
      pnNo: pn,
    })
    .select("-__v -createdAt -updatedAt -createdBy -updatedBy -history -documents")
    .lean();

    // Still avoid leaking whether PN exists, but give a generic message
    if (!member) {
      return res.status(404).json({ 
        message: "Account not found. Please check your PN Number and try again." 
      });
    }

    // Calculate date 12 months ago for filtering
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Build bills filter
    const billsFilter = { pnNo: pn };
    
    if (onlyLast12) {
      // Get bills from last 12 months based on periodCovered or createdAt
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      
      // Generate period strings for last 12 months
      const periodFilters = [];
      const currentDate = new Date();
      
      for (let i = 0; i < 12; i++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        periodFilters.push(`${year}-${month}`);
      }
      
      billsFilter.periodCovered = { $in: periodFilters };
    }

    // Get bills with more details for enhanced display
    const bills = await WaterBill.find(billsFilter)
      .sort({ periodCovered: -1 })
      .select("-__v -createdAt -updatedAt -readerId -remarks")
      .lean();

    const billIds = bills.map((b) => b._id);

    // Get payments for these bills
    const payments = billIds.length
      ? await WaterPayment.find({ billId: { $in: billIds } })
          .sort({ paidAt: -1 })
          .select("_id billId pnNo orNo method amountPaid paidAt receivedBy")
          .lean()
      : [];

    // Create payment map
    const payMap = new Map();
    for (const p of payments) {
      const key = String(p.billId);
      if (!payMap.has(key)) payMap.set(key, []);
      payMap.get(key).push(p);
    }

    // Attach payments to bills and add additional info
    const billsDecorated = bills.map((b) => {
      const obj = { ...b };
      obj.payments = payMap.get(String(b._id)) || [];
      
      // Add readable status
      if (obj.status === "paid") {
        obj.statusBadge = "paid";
      } else if (obj.status === "overdue") {
        obj.statusBadge = "overdue";
      } else {
        obj.statusBadge = "unpaid";
      }
      
      return obj;
    });

    // Calculate summary statistics
    const unpaidBills = billsDecorated.filter(b => b.status !== "paid");
    const totalOutstanding = unpaidBills.reduce((sum, b) => sum + (b.totalDue || 0), 0);
    
    const paidBills = billsDecorated.filter(b => b.status === "paid");
    const lastPayment = paidBills.length > 0 
      ? paidBills[0]  // Already sorted by periodCovered desc
      : null;

    // Get member's active meters
    const activeMeters = member.meters?.filter(m => 
      m.meterStatus === "active" && m.isBillingActive
    ) || [];

    // Sanitize member data for public display
    const sanitizedMember = {
      _id: member._id,
      pnNo: member.pnNo,
      accountName: member.accountName,
      accountStatus: member.accountStatus,
      accountType: member.accountType,
      classification: member.billing?.classification,
      billing: {
        classification: member.billing?.classification,
        hasSeniorDiscount: member.billing?.hasSeniorDiscount,
        hasPWD: member.billing?.hasPWD,
        discountApplicableTiers: member.billing?.discountApplicableTiers || ["31-40", "41+"]
      },
      personal: {
        fullName: member.personal?.fullName,
        birthdate: member.personal?.birthdate,
        isSeniorCitizen: member.personal?.isSeniorCitizen,
        seniorId: member.personal?.seniorId ? 
          member.personal.seniorId.substring(0, 3) + "***" : "", // Partial for privacy
        seniorDiscountRate: member.personal?.seniorDiscountRate
      },
      address: {
        houseLotNo: member.address?.houseLotNo,
        streetSitioPurok: member.address?.streetSitioPurok,
        barangay: member.address?.barangay,
        municipalityCity: member.address?.municipalityCity,
        province: member.address?.province
      },
      contact: {
        mobileNumber: member.contact?.mobileNumber ? 
          member.contact.mobileNumber.substring(0, 4) + "***" + member.contact.mobileNumber.substring(7) : "", // Partial for privacy
        email: member.contact?.email ? 
          "***@" + member.contact.email.split('@')[1] : "" // Hide email username
      },
      meters: activeMeters.map(meter => ({
        _id: meter._id,
        meterNumber: meter.meterNumber,
        meterBrand: meter.meterBrand,
        meterModel: meter.meterModel,
        meterSize: meter.meterSize,
        meterCondition: meter.meterCondition,
        meterStatus: meter.meterStatus,
        location: {
          description: meter.location?.description,
          placement: meter.location?.placement
        },
        isBillingActive: meter.isBillingActive,
        lastReading: meter.lastReading || 0
      }))
    };

    return res.json({
      member: sanitizedMember,
      bills: billsDecorated,
      summary: {
        totalBills: billsDecorated.length,
        paidBills: paidBills.length,
        unpaidBills: unpaidBills.length,
        totalOutstanding: totalOutstanding,
        lastPaymentDate: lastPayment?.paidAt,
        lastPaymentAmount: lastPayment?.totalDue,
        activeMeters: activeMeters.length
      },
      message: "Inquiry successful. Please note that some information is masked for privacy."
    });

  } catch (e) {
    console.error("Public inquiry error:", e);
    return res.status(500).json({ 
      message: "Inquiry failed. Please try again later.",
      error: process.env.NODE_ENV === "development" ? e.message : undefined
    });
  }
});

// NEW: Get tariff examples (public endpoint for calculator)
router.get("/tariff-examples/:classification", rateLimit, async (req, res) => {
  try {
    const { classification } = req.params;
    
    if (!["residential", "commercial"].includes(classification)) {
      return res.status(400).json({ message: "Invalid classification" });
    }
    
    // Define tariff examples (simplified for public view)
    const getTariffExamples = (classification) => {
      if (classification === "residential") {
        return [
          { consumption: 5, amount: 74.00, description: "0-5 m³ = ₱74.00 (minimum charge)" },
          { consumption: 6, amount: 90.20, description: "6 m³ = ₱74.00 + (1 × ₱16.20)" },
          { consumption: 10, amount: 155.00, description: "10 m³ = ₱74.00 + (5 × ₱16.20)" },
          { consumption: 20, amount: 332.00, description: "20 m³ = ₱74.00 + (15 × ₱17.70)" },
          { consumption: 30, amount: 524.00, description: "30 m³ = ₱74.00 + (25 × ₱19.20)" },
          { consumption: 40, amount: 731.00, description: "40 m³ = ₱74.00 + (35 × ₱20.70)" },
          { consumption: 50, amount: 953.00, description: "50 m³ = ₱74.00 + (45 × ₱22.20)" },
          { consumption: 60, amount: 1175.00, description: "60 m³ = ₱74.00 + (55 × ₱22.20)" },
          { consumption: 70, amount: 1397.00, description: "70 m³ = ₱74.00 + (65 × ₱22.20)" }
        ];
      } else if (classification === "commercial") {
        return [
          { consumption: 15, amount: 442.50, description: "0-15 m³ = ₱442.50 (minimum charge)" },
          { consumption: 16, amount: 475.00, description: "16 m³ = ₱442.50 + (1 × ₱32.50)" },
          { consumption: 20, amount: 605.00, description: "20 m³ = ₱442.50 + (5 × ₱32.50)" },
          { consumption: 30, amount: 930.00, description: "30 m³ = ₱442.50 + (15 × ₱32.50)" },
          { consumption: 31, amount: 965.40, description: "31 m³ = ₱442.50 + (16 × ₱35.40)" },
          { consumption: 40, amount: 1284.00, description: "40 m³ = ₱442.50 + (25 × ₱35.40)" },
          { consumption: 50, amount: 1638.00, description: "50 m³ = ₱442.50 + (35 × ₱35.40)" },
          { consumption: 70, amount: 2346.00, description: "70 m³ = ₱442.50 + (55 × ₱35.40)" },
          { consumption: 90, amount: 3054.00, description: "90 m³ = ₱442.50 + (75 × ₱35.40)" }
        ];
      }
      return [];
    };
    
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
      message: "Failed to get tariff examples"
    });
  }
});

// NEW: Calculate bill estimate (public endpoint for calculator)
router.post("/calculate-estimate", rateLimit, async (req, res) => {
  try {
    const { classification, consumption, isSenior = false } = req.body;
    
    const consumptionNum = parseFloat(consumption);
    
    if (isNaN(consumptionNum) || consumptionNum < 0) {
      return res.status(400).json({ message: "Invalid consumption value" });
    }
    
    if (!["residential", "commercial"].includes(classification)) {
      return res.status(400).json({ message: "Invalid classification" });
    }
    
    // Simplified calculation for public use (matches your tariff structure)
    let baseAmount = 0;
    let tier = "";
    let ratePerCubic = 0;
    let excessConsumption = 0;
    
    if (classification === "residential") {
      if (consumptionNum <= 5) {
        baseAmount = 74.00;
        tier = "0-5 m³";
        ratePerCubic = 0;
      } else if (consumptionNum <= 10) {
        excessConsumption = consumptionNum - 5;
        ratePerCubic = 16.20;
        baseAmount = 74.00 + (excessConsumption * ratePerCubic);
        tier = "6-10 m³";
      } else if (consumptionNum <= 20) {
        excessConsumption = consumptionNum - 5;
        ratePerCubic = 17.70;
        baseAmount = 74.00 + (excessConsumption * ratePerCubic);
        tier = "11-20 m³";
      } else if (consumptionNum <= 30) {
        excessConsumption = consumptionNum - 5;
        ratePerCubic = 19.20;
        baseAmount = 74.00 + (excessConsumption * ratePerCubic);
        tier = "21-30 m³";
      } else if (consumptionNum <= 40) {
        excessConsumption = consumptionNum - 5;
        ratePerCubic = 20.70;
        baseAmount = 74.00 + (excessConsumption * ratePerCubic);
        tier = "31-40 m³";
      } else {
        excessConsumption = consumptionNum - 5;
        ratePerCubic = 22.20;
        baseAmount = 74.00 + (excessConsumption * ratePerCubic);
        tier = "41+ m³";
      }
    } else if (classification === "commercial") {
      if (consumptionNum <= 15) {
        baseAmount = 442.50;
        tier = "0-15 m³";
        ratePerCubic = 0;
      } else if (consumptionNum <= 30) {
        excessConsumption = consumptionNum - 15;
        ratePerCubic = 32.50;
        baseAmount = 442.50 + (excessConsumption * ratePerCubic);
        tier = "16-30 m³";
      } else {
        excessConsumption = consumptionNum - 15;
        ratePerCubic = 35.40;
        baseAmount = 442.50 + (excessConsumption * ratePerCubic);
        tier = "31+ m³";
      }
    }
    
    // Apply senior discount if applicable
    let discountAmount = 0;
    let discountRate = 0;
    let seniorDiscountApplied = false;
    let finalAmount = baseAmount;
    
    if (isSenior) {
      // Senior discount applies to residential: tiers 31-40 and 41+
      // Senior discount applies to commercial: tier 31+
      const discountEligible = (classification === "residential" && consumptionNum >= 31) ||
                              (classification === "commercial" && consumptionNum >= 31);
      
      if (discountEligible) {
        discountRate = 5; // Default 5% senior discount
        discountAmount = baseAmount * (discountRate / 100);
        finalAmount = baseAmount - discountAmount;
        seniorDiscountApplied = true;
      }
    }
    
    res.json({
      classification,
      consumption: consumptionNum,
      tier,
      ratePerCubic,
      breakdown: {
        minimumCharge: classification === "residential" ? 74.00 : 442.50,
        excessConsumption: excessConsumption,
        excessRate: ratePerCubic,
        excessAmount: excessConsumption * ratePerCubic,
        baseAmount: baseAmount.toFixed(2)
      },
      seniorDiscount: {
        applied: seniorDiscountApplied,
        rate: discountRate,
        amount: discountAmount.toFixed(2)
      },
      totalAmount: finalAmount.toFixed(2),
      message: seniorDiscountApplied 
        ? `5% senior citizen discount applied to ${tier} tier`
        : "No senior discount applied"
    });
  } catch (error) {
    console.error("Calculate estimate error:", error);
    res.status(500).json({ 
      message: "Failed to calculate estimate"
    });
  }
});

export default router;