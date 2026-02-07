// routes/water/waterReadings.routes.js
import express from "express";
import WaterReading from "../../models/WaterReading.js";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/WaterBill.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { upsertWaterBill } from "../../utils/waterBillUpsert.js";

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
      .select("pnNo accountName billing address meters")
      .sort({ pnNo: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const pnNos = members.map((m) => m.pnNo);

    const readings = await WaterReading.find({ periodKey, pnNo: { $in: pnNos } })
      .select("pnNo meterNumber presentReading previousReading")
      .lean();

    const readingsByPn = new Map();
    for (const r of readings) {
      if (!readingsByPn.has(r.pnNo)) readingsByPn.set(r.pnNo, []);
      readingsByPn.get(r.pnNo).push(r);
    }

    const items = members.map((m) => {
      const activeBillingMeters = (m.meters || []).filter(
        (x) => x.meterStatus === "active" && x.isBillingActive === true
      );

      const memberReadings = readingsByPn.get(m.pnNo) || [];
      const readMeterSet = new Set(memberReadings.map((r) => String(r.meterNumber || "").toUpperCase().trim()));

      const hasAnyReading = activeBillingMeters.some((meter) => readMeterSet.has(String(meter.meterNumber || "").toUpperCase().trim()));

      const hasReading =
        activeBillingMeters.length > 0 &&
        activeBillingMeters.every((meter) => readMeterSet.has(String(meter.meterNumber || "").toUpperCase().trim()));

      return {
        pnNo: m.pnNo,
        accountName: m.accountName,
        billing: m.billing,
        address: m.address,
        meters: m.meters,
        addressText: buildAddressText(m.address),

        // ✅ both for UI
        hasReading,      // complete (all meters read)
        hasAnyReading,   // partial if true but hasReading is false
      };
    });

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
 * POST /water/readings
 * Body:
 * {
 *   periodKey,
 *   pnNo,
 *   meterReadings: [{ meterNumber, previousReading, presentReading, consumptionMultiplier }],
 *   generateBill: true,
 *   remarks: ""
 * }
 *
 * ✅ NOW: generates one bill per meter (Option C)
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

    // prevent duplicates per meter per period
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

    // create reading docs
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

    // update member meters lastReading
    const now = new Date();
    for (const r of normalized) {
      const idx = member.meters.findIndex((m) => normMeter(m.meterNumber) === r.meterNumber);
      if (idx >= 0) {
        member.meters[idx].lastReading = r.presentReading;
        member.meters[idx].lastReadingDate = now;
      }
    }
    await member.save();

    // ✅ BILL PER METER
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
      bills, // ✅ array of bills (one per meter)
      totalConsumption,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save readings" });
  }
});

export default router;
