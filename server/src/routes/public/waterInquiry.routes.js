import express from "express";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/WaterBill.js";
import WaterPayment from "../../models/WaterPayment.js";
import LoanApplication from "../../models/LoanApplication.js";
import LoanPayment from "../../models/LoanPayment.js";
import OnlinePayment from "../../models/OnlinePayment.js";
import WaterSettings from "../../models/WaterSettings.js";
import { calculateWaterBill } from "../../utils/waterBilling.js";

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
 * Public inquiry by METER NUMBER — single-meter view.
 *
 * For households where the PN account holder rents a unit and a tenant
 * pays only their own meter. The tenant searches by their meter number
 * and sees bills, payments, and online-payment status for THAT meter
 * only, not every meter on the PN.
 *
 * POST /api/public/water/inquiry-meter
 * body: { meterNumber, onlyLast12? }
 */
router.post("/inquiry-meter", rateLimit, async (req, res) => {
  try {
    const { meterNumber, onlyLast12 = true } = req.body || {};
    const meter = String(meterNumber || "").trim().toUpperCase();
    if (!meter) return res.status(400).json({ message: "Meter number is required." });

    // Find the member that owns this meter. Match against the active list
    // so a removed/replaced meter doesn't masquerade.
    const member = await WaterMember.findOne({
      "meters.meterNumber": meter,
    })
      .select("-__v -createdAt -updatedAt -createdBy -updatedBy -history -documents")
      .lean();

    if (!member) {
      return res.status(404).json({
        message: "Meter not found. Please check your meter number and try again.",
      });
    }

    const ownMeter = (member.meters || []).find((m) => String(m.meterNumber).toUpperCase() === meter);

    // Period filter — same 12-month rolling window as the PN view.
    const billsFilter = { pnNo: member.pnNo, meterNumber: meter };
    if (onlyLast12) {
      const periods = [];
      const d = new Date();
      for (let i = 0; i < 12; i++) {
        const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
        periods.push(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`);
      }
      billsFilter.periodCovered = { $in: periods };
    }

    const bills = await WaterBill.find(billsFilter)
      .sort({ periodCovered: -1 })
      .select("-__v -createdAt -updatedAt -readerId -remarks")
      .lean();

    const billIds = bills.map((b) => b._id);
    const payments = billIds.length
      ? await WaterPayment.find({ billId: { $in: billIds } })
          .sort({ paidAt: -1 })
          .select("_id billId pnNo meterNumber orNo method amountPaid paidAt receivedBy")
          .lean()
      : [];

    const payByBill = new Map();
    for (const p of payments) {
      const k = String(p.billId);
      if (!payByBill.has(k)) payByBill.set(k, []);
      payByBill.get(k).push(p);
    }

    const pendingOnline = await OnlinePayment.find({
      status: "pending",
      module: "water",
      pnNo: member.pnNo,
      meterNumber: meter,
    })
      .select("meterNumber periodKey amountToPay referenceId createdAt")
      .lean();
    const pendingByPeriod = new Set(pendingOnline.map((o) => o.periodKey));

    const billsDecorated = bills.map((b) => ({
      ...b,
      payments: payByBill.get(String(b._id)) || [],
      onlinePending: pendingByPeriod.has(b.periodCovered),
      statusBadge: b.status,
    }));

    const unpaid = billsDecorated.filter((b) => b.status !== "paid");
    const totalOutstanding = unpaid.reduce((s, b) => s + (Number(b.totalDue) || 0), 0);

    res.json({
      scope: "meter", // tells the client this is a single-meter view
      meter: {
        meterNumber: meter,
        meterBrand: ownMeter?.meterBrand || "",
        meterModel: ownMeter?.meterModel || "",
        meterSize: ownMeter?.meterSize || "",
        meterStatus: ownMeter?.meterStatus || "active",
        lastReading: ownMeter?.lastReading || 0,
      },
      // Limited account info — never expose other meters on the PN to a
      // tenant. They get the PN (so the bill header makes sense) and the
      // account-holder display name. No contact / address / personal data.
      account: {
        pnNo: member.pnNo,
        accountName: member.accountName,
        classification: member.billing?.classification,
        barangay: member.address?.barangay,
        municipalityCity: member.address?.municipalityCity,
      },
      bills: billsDecorated,
      summary: {
        totalBills: billsDecorated.length,
        unpaidBills: unpaid.length,
        paidBills: billsDecorated.length - unpaid.length,
        totalOutstanding,
      },
      pendingOnline,
      message: "Inquiry successful. Showing this meter only.",
    });
  } catch (e) {
    console.error("Meter inquiry error:", e);
    res.status(500).json({ message: "Inquiry failed. Please try again later." });
  }
});

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
      return res.status(400).json({ message: "Account No. is required." });
    }

    // Find member by Account No. only (no birthdate required)
    const member = await WaterMember.findOne({
      pnNo: pn,
    })
    .select("-__v -createdAt -updatedAt -createdBy -updatedBy -history -documents")
    .lean();

    // Still avoid leaking whether PN exists, but give a generic message
    if (!member) {
      return res.status(404).json({ 
        message: "Account not found. Please check your Account Number and try again." 
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

    const loans = await LoanApplication.find({ borrowerPnNo: pn })
      .sort({ createdAt: -1 })
      .select(
        "loanId referenceCode principal monthlyPayment totalPayment totalPaid balance status releasedAt maturityDate firstPaymentDate termMonths interestRatePerMonth createdAt"
      )
      .lean();

    // Attach each loan's payments (for downloadable receipts).
    const loanIds = loans.map((l) => l.loanId);
    const loanPayments = loanIds.length
      ? await LoanPayment.find({ loanId: { $in: loanIds } }).sort({ paidAt: -1 }).select("loanId orNo method amountPaid paidAt").lean()
      : [];
    const lpMap = new Map();
    for (const p of loanPayments) {
      if (!lpMap.has(p.loanId)) lpMap.set(p.loanId, []);
      lpMap.get(p.loanId).push(p);
    }
    const loansWithPayments = loans.map((l) => ({ ...l, payments: lpMap.get(l.loanId) || [] }));

    // Flag bills/loans that already have a pending online payment awaiting review.
    const pendingOnline = await OnlinePayment.find({
      status: "pending",
      $or: [{ pnNo: pn }, { loanId: { $in: loanIds } }],
    }).select("module meterNumber periodKey loanId").lean();
    const pendingBillKeys = new Set();
    const pendingLoanIds = new Set();
    for (const op of pendingOnline) {
      if (op.module === "water") pendingBillKeys.add(`${String(op.meterNumber || "").toUpperCase()}|${op.periodKey}`);
      else if (op.module === "loan") pendingLoanIds.add(op.loanId);
    }
    billsDecorated.forEach((b) => {
      b.onlinePending = pendingBillKeys.has(`${String(b.meterNumber || "").toUpperCase()}|${b.periodCovered}`);
    });
    loansWithPayments.forEach((l) => {
      l.onlinePending = pendingLoanIds.has(l.loanId);
    });

    return res.json({
      member: sanitizedMember,
      bills: billsDecorated,
      loans: loansWithPayments,
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

    // Build the example table straight from the configured tariff so the
    // public guide always reflects Water Settings. Sample points: the
    // minimum bracket's ceiling, then the first + last m³ of each higher
    // tier, computed with the canonical (progressive) engine.
    const settings = await WaterSettings.findOne();
    const tiers = ((classification === "residential"
      ? settings?.tariffs?.residential
      : settings?.tariffs?.commercial) || [])
      .filter((t) => t.isActive)
      .sort((a, b) => Number(a.minConsumption) - Number(b.minConsumption));

    let examples = [];
    if (tiers.length > 0) {
      const pts = new Set();
      pts.add(Number(tiers[0].maxConsumption)); // minimum-charge ceiling
      for (let i = 1; i < tiers.length; i++) {
        pts.add(Number(tiers[i].minConsumption)); // first m³ of this tier
        const mx = Number(tiers[i].maxConsumption);
        if (mx && mx <= 200) pts.add(mx); // skip the huge open-ended cap
      }
      // A representative point inside the open-ended top tier.
      pts.add(Number(tiers[tiers.length - 1].minConsumption) + 9);

      const consumptions = [...pts].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
      for (const c of consumptions) {
        try {
          const calc = await calculateWaterBill(c, classification, null, null, settings);
          examples.push({
            consumption: c,
            amount: Number(calc.amount),
            tier: calc.tariffUsed?.tier || "",
            description: `${c} m³ = ₱${Number(calc.amount).toFixed(2)}`,
          });
        } catch { /* skip a misconfigured point */ }
      }
    }

    const minTier = tiers[0];
    const minLabel = minTier
      ? `₱${Number(minTier.flatAmount || 0).toFixed(2)} minimum for ${minTier.minConsumption}-${minTier.maxConsumption} m³, then tiered rates`
      : "Tariff not configured";

    res.json({
      classification,
      examples,
      description: `${classification === "residential" ? "Residential" : "Commercial"}: ${minLabel}`,
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

    // Compute through the SAME canonical engine that issues real bills, so
    // the public estimate follows Water Settings (progressive tiers,
    // configured senior-discount tiers/rate) exactly. A synthetic senior
    // member lets the engine apply the discount on eligible tiers only.
    const member = isSenior ? { personal: { isSeniorCitizen: true }, billing: {}, meters: [] } : null;
    const calc = await calculateWaterBill(consumptionNum, classification, member);

    const baseAmount = Number(calc.baseAmount) || 0;
    const discountAmount = Number(calc.discount) || 0;
    const seniorDiscountApplied = discountAmount > 0;
    const discountRate = seniorDiscountApplied && baseAmount > 0
      ? Math.round((discountAmount / baseAmount) * 100)
      : 0;
    const tierLabel = calc.tariffUsed?.tier ? `${calc.tariffUsed.tier} m³` : "";

    res.json({
      classification,
      consumption: consumptionNum,
      tier: tierLabel,
      ratePerCubic: calc.tariffUsed?.ratePerCubic || 0,
      breakdown: {
        minimumCharge: calc.breakdown?.minimumCharge ?? 0,
        excessConsumption: calc.breakdown?.excessConsumption ?? 0,
        excessRate: calc.breakdown?.excessRate ?? 0,
        excessAmount: calc.breakdown?.excessAmount ?? 0,
        baseAmount: baseAmount.toFixed(2),
      },
      seniorDiscount: {
        applied: seniorDiscountApplied,
        rate: discountRate,
        amount: discountAmount.toFixed(2),
      },
      totalAmount: Number(calc.amount).toFixed(2),
      message: seniorDiscountApplied
        ? `${discountRate}% senior citizen discount applied to ${tierLabel} tier`
        : (isSenior ? "Senior discount applies to higher tiers only" : "No senior discount applied"),
    });
  } catch (error) {
    console.error("Calculate estimate error:", error);
    res.status(500).json({ 
      message: "Failed to calculate estimate"
    });
  }
});

export default router;