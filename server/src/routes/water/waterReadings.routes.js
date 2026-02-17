// routes/water/waterReadings.routes.js
import express from "express";
import WaterReading from "../../models/WaterReading.js";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/waterbill.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { upsertWaterBill } from "../../utils/waterBillUpsert.js";
import { calculateWaterBill } from "../../utils/waterBillingNew.js";

const router = express.Router();

// guards
const guard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader", "reader"])];
const adminGuard = [requireAuth, requireRole(["admin"])];
const readerGuard = [requireAuth, requireRole(["admin", "meter_reader"])];

// helpers
const normPN = (pnNo) => String(pnNo || "").toUpperCase().trim();
const normMeter = (m) => String(m || "").toUpperCase().trim();
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function buildAddressText(addr = {}) {
  return [addr.houseLotNo, addr.streetSitioPurok, addr.barangay, addr.municipalityCity, addr.province]
    .filter(Boolean)
    .join(", ");
}

/**
 * GET /water/readings - Get all readings for a period
 */
router.get("/", ...guard, async (req, res) => {
  try {
    const { periodKey, pnNo, meterNumber } = req.query;
    
    const query = {};
    if (periodKey) query.periodKey = periodKey;
    if (pnNo) query.pnNo = normPN(pnNo);
    if (meterNumber) query.meterNumber = normMeter(meterNumber);

    const readings = await WaterReading.find(query)
      .sort({ pnNo: 1, meterNumber: 1, periodKey: -1 })
      .lean();

    // Enrich with account names
    const pnNos = [...new Set(readings.map(r => r.pnNo))];
    const members = await WaterMember.find({ pnNo: { $in: pnNos } })
      .select("pnNo accountName")
      .lean();
    
    const memberMap = new Map(members.map(m => [m.pnNo, m.accountName]));

    const enriched = readings.map(r => ({
      ...r,
      accountName: memberMap.get(r.pnNo) || "",
    }));

    res.json({
      readings: enriched,
      total: enriched.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch readings" });
  }
});

/**
 * GET /water/readings/history - Get reading history for a meter
 */
router.get("/history", ...guard, async (req, res) => {
  try {
    const { pnNo, meterNumber, limit = 12 } = req.query;
    
    if (!pnNo || !meterNumber) {
      return res.status(400).json({ error: "pnNo and meterNumber are required" });
    }

    const readings = await WaterReading.find({
      pnNo: normPN(pnNo),
      meterNumber: normMeter(meterNumber),
    })
      .sort({ periodKey: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ readings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch reading history" });
  }
});

/**
 * GET /water/readings/export - Export readings as CSV data
 */
router.get("/export", ...guard, async (req, res) => {
  try {
    const { periodKey } = req.query;
    
    if (!periodKey) {
      return res.status(400).json({ error: "periodKey is required" });
    }

    const readings = await WaterReading.find({ periodKey })
      .sort({ pnNo: 1, meterNumber: 1 })
      .lean();

    // Enrich with account names
    const pnNos = [...new Set(readings.map(r => r.pnNo))];
    const members = await WaterMember.find({ pnNo: { $in: pnNos } })
      .select("pnNo accountName")
      .lean();
    
    const memberMap = new Map(members.map(m => [m.pnNo, m.accountName]));

    const enriched = readings.map(r => ({
      ...r,
      accountName: memberMap.get(r.pnNo) || "",
    }));

    res.json({ readings: enriched });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to export readings" });
  }
});

/**
 * GET /water/readings/members?periodKey=YYYY-MM&page=1&limit=10&search=...
 */
router.get("/members", ...guard, async (req, res) => {
  try {
    const { periodKey, page = 1, limit = 10, search = "" } = req.query;
    if (!periodKey) return res.status(400).json({ error: "Period key is required" });

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const searchQuery = { accountStatus: "active" };
    if (search) {
      searchQuery.$or = [
        { pnNo: { $regex: search, $options: "i" } },
        { accountName: { $regex: search, $options: "i" } },
        { "address.barangay": { $regex: search, $options: "i" } },
        { "address.streetSitioPurok": { $regex: search, $options: "i" } },
        { "meters.meterNumber": { $regex: search, $options: "i" } },
      ];
    }

    const members = await WaterMember.find(searchQuery)
      .select("pnNo accountName billing address meters personal")
      .sort({ pnNo: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const pnNos = members.map((m) => m.pnNo);

    // Get readings for the period
    const readings = await WaterReading.find({ periodKey, pnNo: { $in: pnNos } })
      .select("pnNo meterNumber presentReading previousReading consumed readAt readBy")
      .lean();

    // Get bills for the period
    const bills = await WaterBill.find({ 
      periodKey, 
      pnNo: { $in: pnNos } 
    }).select("pnNo meterNumber status totalDue baseAmount discount penaltyApplied consumed previousReading presentReading").lean();

    const readingsByPn = new Map();
    const readMetersByPn = new Map();
    
    for (const r of readings) {
      if (!readingsByPn.has(r.pnNo)) {
        readingsByPn.set(r.pnNo, []);
        readMetersByPn.set(r.pnNo, new Set());
      }
      readingsByPn.get(r.pnNo).push(r);
      readMetersByPn.get(r.pnNo).add(normMeter(r.meterNumber));
    }

    // Create bills map
    const billsByPn = new Map();
    for (const bill of bills) {
      if (!billsByPn.has(bill.pnNo)) {
        billsByPn.set(bill.pnNo, new Map());
      }
      billsByPn.get(bill.pnNo).set(normMeter(bill.meterNumber), {
        hasBill: true,
        billId: bill._id,
        status: bill.status,
        totalDue: bill.totalDue,
        baseAmount: bill.baseAmount,
        discount: bill.discount,
        penaltyApplied: bill.penaltyApplied,
        consumed: bill.consumed,
        previousReading: bill.previousReading,
        presentReading: bill.presentReading,
        hasReading: !!(bill.previousReading || bill.presentReading)
      });
    }

    // Process members with enhanced data
    const items = await Promise.all(members.map(async (m) => {
      const activeBillingMeters = (m.meters || []).filter(
        (x) => x.meterStatus === "active" && x.isBillingActive === true
      );

      const memberReadings = readingsByPn.get(m.pnNo) || [];
      const readMeterSet = readMetersByPn.get(m.pnNo) || new Set();
      const memberBills = billsByPn.get(m.pnNo) || new Map();
      
      // Find which meters are missing readings
      const missingMeters = activeBillingMeters
        .filter(meter => !readMeterSet.has(normMeter(meter.meterNumber)))
        .map(meter => meter.meterNumber);

      const hasAnyReading = memberReadings.length > 0;
      const hasReading = activeBillingMeters.length > 0 &&
        activeBillingMeters.every((meter) => 
          readMeterSet.has(normMeter(meter.meterNumber))
        );

      // Get list of meters that have readings
      const readMeters = activeBillingMeters
        .filter(meter => readMeterSet.has(normMeter(meter.meterNumber)))
        .map(meter => meter.meterNumber);

      // For each active meter, check if it has a bill
      const metersWithBill = activeBillingMeters
        .filter(meter => memberBills.has(normMeter(meter.meterNumber)))
        .map(meter => ({
          meterNumber: meter.meterNumber,
          billStatus: memberBills.get(normMeter(meter.meterNumber)).status,
          billId: memberBills.get(normMeter(meter.meterNumber)).billId,
          totalDue: memberBills.get(normMeter(meter.meterNumber)).totalDue
        }));

      // Get last actual reading for each meter (from the most recent period with a reading)
      const lastActualReadings = {};
      for (const meter of activeBillingMeters) {
        const mn = normMeter(meter.meterNumber);
        
        // Find the most recent reading for this meter (any period)
        const lastReading = await WaterReading.findOne({
          pnNo: m.pnNo,
          meterNumber: mn
        }).sort({ periodKey: -1 }).lean();
        
        if (lastReading) {
          lastActualReadings[mn] = {
            presentReading: lastReading.presentReading,
            previousReading: lastReading.previousReading,
            consumed: lastReading.consumed,
            periodKey: lastReading.periodKey,
            readAt: lastReading.readAt,
            source: "reading"
          };
        } else {
          // If no reading, try to find the most recent paid bill
          const lastBill = await WaterBill.findOne({
            pnNo: m.pnNo,
            meterNumber: mn,
            status: "paid"
          }).sort({ periodKey: -1 }).lean();
          
          if (lastBill) {
            lastActualReadings[mn] = {
              presentReading: lastBill.presentReading,
              previousReading: lastBill.previousReading,
              consumed: lastBill.consumed,
              periodKey: lastBill.periodCovered,
              readAt: lastBill.readingDate,
              source: "bill"
            };
          }
        }
      }

      return {
        pnNo: m.pnNo,
        accountName: m.accountName,
        billing: m.billing,
        address: m.address,
        meters: m.meters,
        personal: m.personal,
        addressText: buildAddressText(m.address),
        activeBillingMeters,
        hasReading,
        hasAnyReading,
        readMeters,
        missingMeters,
        billsForPeriod: metersWithBill,
        hasBillForAnyMeter: metersWithBill.length > 0,
        readingWithoutBill: hasAnyReading && memberBills.size === 0,
        billWithoutReading: memberBills.size > 0 && readMeterSet.size === 0,
        lastActualReadings // Add last actual readings data
      };
    }));

    const total = await WaterMember.countDocuments(searchQuery);
    const completeCount = items.filter((x) => x.hasReading).length;
    const anyReadCount = items.filter((x) => x.hasAnyReading).length;

    res.json({
      items,
      total,
      readCount: completeCount,
      anyReadCount,
      unreadCount: total - anyReadCount,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

/**
 * POST /water/bills/preview - Preview bill calculation
 */
router.post("/bills/preview", ...guard, async (req, res) => {
  try {
    const { pnNo, periodKey, classification, consumption, meterReadings } = req.body;

    if (!pnNo || !periodKey || !classification) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!meterReadings || !Array.isArray(meterReadings) || meterReadings.length === 0) {
      return res.status(400).json({ error: "meterReadings array is required" });
    }

    // Validate each meter reading
    for (const reading of meterReadings) {
      if (!reading.meterNumber) {
        return res.status(400).json({ error: "meterNumber is required for each reading" });
      }
      if (typeof reading.previousReading !== 'number' || typeof reading.presentReading !== 'number') {
        return res.status(400).json({ 
          error: `previousReading and presentReading must be numbers for meter ${reading.meterNumber}` 
        });
      }
    }

    const member = await WaterMember.findOne({ pnNo: normPN(pnNo) });
    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    // Calculate bill using your billing logic
    const calculation = await calculateWaterBill(consumption, classification, member);

    res.json({
      pnNo,
      accountName: member.accountName,
      classification,
      periodKey,
      consumption,
      meterReadings,
      preview: {
        baseAmount: calculation.baseAmount,
        amount: calculation.amount,
        discount: calculation.discount,
        discountReason: calculation.discountReason,
        tariffUsed: calculation.tariffUsed,
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

/**
 * POST /water/readings - Create new readings
 */
router.post("/", ...readerGuard, async (req, res) => {
  try {
    const { periodKey, pnNo, meterReadings = [], generateBill = true, remarks = "" } = req.body;
    const userId = req.user.id;

    if (!periodKey || !pnNo || !Array.isArray(meterReadings) || meterReadings.length === 0) {
      return res.status(400).json({ error: "Missing required fields (periodKey, pnNo, meterReadings[])" });
    }

    const member = await WaterMember.findOne({ pnNo: normPN(pnNo), accountStatus: "active" });
    if (!member) return res.status(404).json({ error: "Member not found or inactive" });

    const billingMeters = (member.meters || []).filter((m) => m.meterStatus === "active" && m.isBillingActive === true);
    const billingSet = new Set(billingMeters.map((m) => normMeter(m.meterNumber)));

    const normalized = meterReadings.map((r) => ({
      meterNumber: normMeter(r.meterNumber),
      previousReading: toNum(r.previousReading),
      presentReading: toNum(r.presentReading),
      consumptionMultiplier: Number.isFinite(toNum(r.consumptionMultiplier)) ? toNum(r.consumptionMultiplier) : 1,
    }));

    // Validate readings
    for (const r of normalized) {
      if (!r.meterNumber) return res.status(400).json({ error: "meterNumber is required" });
      if (!billingSet.has(r.meterNumber)) {
        return res.status(400).json({ error: `Meter ${r.meterNumber} is not an active billing meter for this account` });
      }
      if (Number.isNaN(r.previousReading) || Number.isNaN(r.presentReading)) {
        return res.status(400).json({ error: `Invalid reading values for meter ${r.meterNumber}` });
      }
      if (r.presentReading < r.previousReading) {
        return res.status(400).json({ error: `Present reading must be >= previous reading for meter ${r.meterNumber}` });
      }
      if (!Number.isFinite(r.consumptionMultiplier) || r.consumptionMultiplier <= 0) {
        return res.status(400).json({ error: `Invalid consumptionMultiplier for meter ${r.meterNumber}` });
      }
    }

    // Check for existing readings
    const existing = await WaterReading.find({
      periodKey,
      pnNo: member.pnNo,
      meterNumber: { $in: normalized.map((x) => x.meterNumber) },
    }).select("meterNumber");

    if (existing.length) {
      return res.status(400).json({
        error: "Reading already exists for some meters this period",
        meters: existing.map((x) => x.meterNumber),
      });
    }

    // Create reading docs
    const docs = normalized.map((r) => {
      const meter = member.meters.find((m) => normMeter(m.meterNumber) === r.meterNumber);

      const raw = Math.max(0, r.presentReading - r.previousReading);
      const consumed = raw * (r.consumptionMultiplier || 1);

      return {
        periodKey,
        pnNo: member.pnNo,
        meterNumber: r.meterNumber,
        previousReading: r.previousReading,
        presentReading: r.presentReading,
        rawConsumed: raw,
        consumptionMultiplier: r.consumptionMultiplier,
        consumed,
        readBy: userId,
        readingType: "manual",
        readingStatus: "verified",
        isEstimated: false,
        meterSnapshot: {
          meterNumber: r.meterNumber,
          meterBrand: meter?.meterBrand || "",
          meterModel: meter?.meterModel || "",
          meterCondition: meter?.meterCondition || "good",
        },
      };
    });

    const saved = await WaterReading.insertMany(docs);

    // Update member's last reading
    const now = new Date();
    for (const r of normalized) {
      const idx = member.meters.findIndex((m) => normMeter(m.meterNumber) === r.meterNumber);
      if (idx >= 0) {
        member.meters[idx].lastReading = r.presentReading;
        member.meters[idx].lastReadingDate = now;
      }
    }
    await member.save();

    // Generate bills
    const bills = [];
    if (generateBill) {
      for (const d of docs) {
        const billResult = await upsertWaterBill({
          member,
          periodCovered: periodKey,
          meterReading: {
            meterNumber: d.meterNumber,
            previousReading: d.previousReading,
            presentReading: d.presentReading,
            multiplier: d.consumptionMultiplier || 1,
          },
          readerId: userId,
          remarks: remarks || "",
          createdBy: userId,
        });

        if (billResult?.bill) bills.push(billResult.bill);
      }
    }

    const totalConsumption = docs.reduce((sum, d) => sum + (Number(d.consumed) || 0), 0);

    return res.status(201).json({
      message: "Readings saved successfully",
      readings: saved,
      bills,
      totalConsumption,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save readings" });
  }
});

/**
 * PUT /water/readings - Update existing readings
 */
router.put("/", ...readerGuard, async (req, res) => {
  try {
    const { periodKey, pnNo, meterReadings = [], generateBill = true, remarks = "", editMode = true } = req.body;
    const userId = req.user.id;

    if (!periodKey || !pnNo || !Array.isArray(meterReadings) || meterReadings.length === 0) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const member = await WaterMember.findOne({ pnNo: normPN(pnNo), accountStatus: "active" });
    if (!member) return res.status(404).json({ error: "Member not found or inactive" });

    const billingMeters = (member.meters || []).filter((m) => m.meterStatus === "active" && m.isBillingActive === true);
    const billingSet = new Set(billingMeters.map((m) => normMeter(m.meterNumber)));

    const normalized = meterReadings.map((r) => ({
      meterNumber: normMeter(r.meterNumber),
      previousReading: toNum(r.previousReading),
      presentReading: toNum(r.presentReading),
      consumptionMultiplier: Number.isFinite(toNum(r.consumptionMultiplier)) ? toNum(r.consumptionMultiplier) : 1,
      readingId: r.readingId,
      forceUpdate: r.forceUpdate || false,
    }));

    // Validate readings
    for (const r of normalized) {
      if (!r.meterNumber) return res.status(400).json({ error: "meterNumber is required" });
      if (!billingSet.has(r.meterNumber)) {
        return res.status(400).json({ error: `Meter ${r.meterNumber} is not an active billing meter` });
      }
      if (Number.isNaN(r.previousReading) || Number.isNaN(r.presentReading)) {
        return res.status(400).json({ error: `Invalid reading values for meter ${r.meterNumber}` });
      }
      if (!r.forceUpdate && r.presentReading < r.previousReading) {
        return res.status(400).json({ error: `Present reading must be >= previous reading for meter ${r.meterNumber}` });
      }
      if (!Number.isFinite(r.consumptionMultiplier) || r.consumptionMultiplier <= 0) {
        return res.status(400).json({ error: `Invalid consumptionMultiplier for meter ${r.meterNumber}` });
      }
    }

    const savedReadings = [];
    const now = new Date();

    for (const r of normalized) {
      const meter = member.meters.find((m) => normMeter(m.meterNumber) === r.meterNumber);
      const raw = Math.max(0, r.presentReading - r.previousReading);
      const consumed = raw * (r.consumptionMultiplier || 1);

      const readingData = {
        periodKey,
        pnNo: member.pnNo,
        meterNumber: r.meterNumber,
        previousReading: r.previousReading,
        presentReading: r.presentReading,
        rawConsumed: raw,
        consumptionMultiplier: r.consumptionMultiplier,
        consumed,
        readBy: userId,
        readingType: "manual",
        readingStatus: "corrected",
        isEstimated: false,
        meterSnapshot: {
          meterNumber: r.meterNumber,
          meterBrand: meter?.meterBrand || "",
          meterModel: meter?.meterModel || "",
          meterCondition: meter?.meterCondition || "good",
        },
      };

      // Update or insert reading
      let saved;
      if (r.readingId) {
        saved = await WaterReading.findByIdAndUpdate(
          r.readingId,
          { $set: readingData },
          { new: true }
        );
      } else {
        const existing = await WaterReading.findOne({
          periodKey,
          pnNo: member.pnNo,
          meterNumber: r.meterNumber,
        });

        if (existing) {
          saved = await WaterReading.findByIdAndUpdate(
            existing._id,
            { $set: readingData },
            { new: true }
          );
        } else {
          saved = await WaterReading.create(readingData);
        }
      }

      if (saved) savedReadings.push(saved);

      // Update member's last reading
      const idx = member.meters.findIndex((m) => normMeter(m.meterNumber) === r.meterNumber);
      if (idx >= 0) {
        member.meters[idx].lastReading = r.presentReading;
        member.meters[idx].lastReadingDate = now;
      }
    }

    await member.save();

    // Regenerate bills
    const bills = [];
    if (generateBill) {
      for (const reading of savedReadings) {
        const billResult = await upsertWaterBill({
          member,
          periodCovered: periodKey,
          meterReading: {
            meterNumber: reading.meterNumber,
            previousReading: reading.previousReading,
            presentReading: reading.presentReading,
            multiplier: reading.consumptionMultiplier || 1,
          },
          readerId: userId,
          remarks: remarks || "Edited reading",
          createdBy: userId,
        });

        if (billResult?.bill) bills.push(billResult.bill);
      }
    }

    const totalConsumption = savedReadings.reduce((sum, r) => sum + (Number(r.consumed) || 0), 0);

    return res.json({
      message: "Readings updated successfully",
      readings: savedReadings,
      bills,
      totalConsumption,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update readings" });
  }
});

/**
 * POST /water/readings/batch - Batch save multiple readings
 */
router.post("/batch", ...readerGuard, async (req, res) => {
  try {
    const { items } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    const results = {
      success: 0,
      failed: 0,
      details: [],
    };

    for (const item of items) {
      try {
        const { periodKey, pnNo, meterReadings, generateBill = true } = item;

        const member = await WaterMember.findOne({ pnNo: normPN(pnNo), accountStatus: "active" });
        if (!member) {
          results.failed++;
          results.details.push({ pnNo, success: false, message: "Member not found" });
          continue;
        }

        const savedReadings = [];
        const now = new Date();

        for (const reading of meterReadings) {
          const meter = member.meters.find(m => normMeter(m.meterNumber) === normMeter(reading.meterNumber));
          
          const raw = Math.max(0, reading.presentReading - reading.previousReading);
          const consumed = raw * (reading.consumptionMultiplier || 1);

          const readingData = {
            periodKey,
            pnNo: member.pnNo,
            meterNumber: normMeter(reading.meterNumber),
            previousReading: reading.previousReading,
            presentReading: reading.presentReading,
            rawConsumed: raw,
            consumptionMultiplier: reading.consumptionMultiplier || 1,
            consumed,
            readBy: userId,
            readingType: "manual",
            readingStatus: "verified",
            isEstimated: false,
            meterSnapshot: {
              meterNumber: reading.meterNumber,
              meterBrand: meter?.meterBrand || "",
              meterModel: meter?.meterModel || "",
              meterCondition: meter?.meterCondition || "good",
            },
          };

          // Upsert reading
          const saved = await WaterReading.findOneAndUpdate(
            {
              periodKey,
              pnNo: member.pnNo,
              meterNumber: normMeter(reading.meterNumber),
            },
            { $set: readingData },
            { new: true, upsert: true }
          );

          savedReadings.push(saved);

          // Update member's last reading
          const idx = member.meters.findIndex((m) => normMeter(m.meterNumber) === normMeter(reading.meterNumber));
          if (idx >= 0) {
            member.meters[idx].lastReading = reading.presentReading;
            member.meters[idx].lastReadingDate = now;
          }

          // Generate bill if requested
          if (generateBill) {
            await upsertWaterBill({
              member,
              periodCovered: periodKey,
              meterReading: {
                meterNumber: reading.meterNumber,
                previousReading: reading.previousReading,
                presentReading: reading.presentReading,
                multiplier: reading.consumptionMultiplier || 1,
              },
              readerId: userId,
              remarks: "Batch processed",
              createdBy: userId,
            });
          }
        }

        await member.save();

        results.success++;
        results.details.push({ 
          pnNo, 
          success: true, 
          message: `Saved ${savedReadings.length} readings` 
        });
      } catch (error) {
        results.failed++;
        results.details.push({ 
          pnNo: item.pnNo, 
          success: false, 
          message: error.message 
        });
      }
    }

    res.json(results);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Batch processing failed" });
  }
});

/**
 * DELETE /water/readings/:id - Delete a reading (admin only)
 */
router.delete("/:id", adminGuard, async (req, res) => {
  try {
    const { id } = req.params;
    
    const reading = await WaterReading.findById(id);
    if (!reading) {
      return res.status(404).json({ error: "Reading not found" });
    }

    // Also delete associated bill
    await WaterBill.deleteOne({
      periodKey: reading.periodKey,
      pnNo: reading.pnNo,
      meterNumber: reading.meterNumber,
    });

    await reading.deleteOne();

    res.json({ message: "Reading deleted successfully" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete reading" });
  }
});

export default router;