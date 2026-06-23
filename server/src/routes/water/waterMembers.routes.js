import express from "express";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/WaterBill.js";
import { requireAuth, requireRole, requireAdminAuthz } from "../../middleware/auth.js";
import WaterSettings from "../../models/WaterSettings.js";
import MemberFeeRequest from "../../models/MemberFeeRequest.js";

const router = express.Router();

// 6-char alphanumeric pnNo for new accounts. Skips 0/O/1/I to avoid OCR
// + handwriting confusion in field receipts. ~30^6 = 729M possible
// values; retries until it finds an unused one. Re-keys the meter
// numbers as <5-digit base>#N for new meters under the same account.
const PN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomPnNo() {
  let s = "";
  for (let i = 0; i < 6; i++) s += PN_CHARS[Math.floor(Math.random() * PN_CHARS.length)];
  return s;
}
async function generateUniquePnNo() {
  for (let i = 0; i < 50; i++) {
    const candidate = randomPnNo();
    // eslint-disable-next-line no-await-in-loop
    const dupe = await WaterMember.findOne({ pnNo: candidate }).select("_id").lean();
    if (!dupe) return candidate;
  }
  throw new Error("Could not allocate a unique pnNo after 50 tries.");
}
function randomMeterBase() {
  return String(10000 + Math.floor(Math.random() * 90000));
}

// Apply auto-generation to a meters array. Meters arrive from the
// client without numbers (the form no longer asks the officer to
// invent one); we assign <base>#N where N is the meter's billing
// sequence + 1. The base is shared per account so 12345#1 and 12345#2
// always belong to the same PN. Returns the SAME array (mutated).
function assignAutoMeterNumbers(meters, sharedBase) {
  meters.forEach((m, i) => {
    const provided = String(m.meterNumber || "").trim();
    if (provided) {
      m.meterNumber = provided.toUpperCase();
    } else {
      m.meterNumber = `${sharedBase}#${i + 1}`;
    }
  });
  return meters;
}
const guard = [requireAuth, requireRole(["admin", "manager", "water_bill_officer", "meter_reader"])];
// Edits + deletes go through dual-control: admin role passes; everyone else
// must present a fresh X-Admin-Authz token (an admin entered their own
// password + 2FA code on the officer's screen).
const editGuard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader"]), requireAdminAuthz];

// GET /api/water/members?q=&page=&limit=&classification=&status=&sitio=&existing=&arCategory=
router.get("/", ...guard, async (req, res) => {
  const q = (req.query.q || "").trim();
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "12", 10)));
  const classification = (req.query.classification || "").trim();
  const status = (req.query.status || "").trim();
  const sitio = (req.query.sitio || "").trim();
  const existing = (req.query.existing || "").trim(); // "true" | "false" | ""
  const arCategory = (req.query.arCategory || "").trim();
  const skip = (page - 1) * limit;

  const filter = {};
  if (classification) filter["billing.classification"] = classification;
  if (status) filter.accountStatus = status;
  if (sitio) filter["address.streetSitioPurok"] = sitio;
  if (existing === "true") filter.isExistingMember = true;
  else if (existing === "false") filter.isExistingMember = { $ne: true };
  if (arCategory) filter.arCategory = arCategory;

  if (q) {
    filter.$or = [
      { pnNo: { $regex: q, $options: "i" } },
      { accountName: { $regex: q, $options: "i" } },
      { "personal.fullName": { $regex: q, $options: "i" } },
      { "meters.meterNumber": { $regex: q, $options: "i" } },
      { "address.barangay": { $regex: q, $options: "i" } },
      { "address.streetSitioPurok": { $regex: q, $options: "i" } },
    ];
  }

  try {
    const [items, total] = await Promise.all([
      WaterMember.find(filter)
        .sort({ pnNo: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WaterMember.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (error) {
    console.error("Error fetching members:", error);
    res.status(500).json({ message: "Failed to fetch members" });
  }
});

// GET /api/water/members/map?periodKey=YYYY-MM
// Returns every active meter that has GPS coordinates, decorated with
// the data the Meter Map UI needs (owner, status flags, current-period
// bill state, consumption). Powers the "Meter Map" tab in the Water
// Bill Officer + Admin dashboards.
router.get("/map", ...guard, async (req, res) => {
  try {
    const periodKey = (req.query.periodKey || new Date().toISOString().slice(0, 7)).trim();

    const members = await WaterMember.find({ accountStatus: { $ne: "inactive" } })
      .select("pnNo accountName personal billing meters arCategory address")
      .lean();

    // Pull the current-period bills + readings in one go so each marker
    // can answer "have I been read this period?" and "am I unpaid?".
    const [periodBills, periodReadings] = await Promise.all([
      WaterBill.find({ periodKey })
        .select("pnNo meterNumber status totalDue consumed")
        .lean(),
      // We only need to know whether (pn, meter) has a reading this
      // period; selecting just the keys keeps the payload tiny.
      (await import("../../models/WaterReading.js")).default
        .find({ periodKey })
        .select("pnNo meterNumber consumed")
        .lean(),
    ]);

    const billByKey = new Map();
    for (const b of periodBills) {
      billByKey.set(`${b.pnNo}__${String(b.meterNumber).toUpperCase().trim()}`, b);
    }
    const readingByKey = new Map();
    for (const r of periodReadings) {
      readingByKey.set(`${r.pnNo}__${String(r.meterNumber).toUpperCase().trim()}`, r);
    }

    const pins = [];
    for (const m of members) {
      const isSeniorAccount = !!m.personal?.isSeniorCitizen;
      const meters = (m.meters || []).filter(
        (mt) => mt.meterStatus === "active" && mt.isBillingActive
      );
      for (const mt of meters) {
        const lat = Number(mt.location?.coordinates?.latitude);
        const lng = Number(mt.location?.coordinates?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const key = `${m.pnNo}__${String(mt.meterNumber).toUpperCase().trim()}`;
        const bill = billByKey.get(key);
        const reading = readingByKey.get(key);
        pins.push({
          pnNo: m.pnNo,
          accountName: m.accountName,
          meterNumber: mt.meterNumber,
          subName: mt.subName || "",
          lat,
          lng,
          // status flags the marker uses to pick its icon
          isSenior: isSeniorAccount || !!mt.isDiscountMeter,
          isSubjectForDisconnection: !!mt.disconnectionRemarks || mt.meterStatus === "disconnected",
          meterStatus: mt.meterStatus,
          // current-period state
          hasReading: !!reading,
          consumed: reading?.consumed ?? bill?.consumed ?? 0,
          billStatus: bill?.status || (reading ? "unpaid" : "none"),
          totalDue: bill?.totalDue ?? 0,
          classification: m.billing?.classification || "residential",
          sitio: m.address?.streetSitioPurok || "",
          arCategory: m.arCategory || "",
        });
      }
    }

    res.json({ periodKey, pins, total: pins.length });
  } catch (error) {
    console.error("Error fetching meter map:", error);
    res.status(500).json({ message: "Failed to fetch meter map" });
  }
});

// GET /api/water/members/sitios — distinct sitio + AR-category lists.
// Powers the two filter dropdowns in the Members panel.
router.get("/sitios", ...guard, async (req, res) => {
  try {
    const [sitios, arCategories] = await Promise.all([
      WaterMember.distinct("address.streetSitioPurok", {
        "address.streetSitioPurok": { $nin: [null, ""] },
      }),
      WaterMember.distinct("arCategory", { arCategory: { $nin: [null, ""] } }),
    ]);
    res.json({ sitios: sitios.sort(), arCategories: arCategories.sort() });
  } catch (error) {
    console.error("Error fetching sitios:", error);
    res.status(500).json({ message: "Failed to fetch sitios" });
  }
});

// GET /api/water/members/pn/:pnNo
// Wider read guard than the module default: the cashier Savings panel,
// loan officer's Savings tab, bookkeeper's product-loan apply form,
// and the admin/bookkeeper Adjustments panel all use this single-member
// lookup to confirm an account name before acting. These roles already
// see the same member data through /cashier/water, so this leaks
// nothing new — it just stops the 403 noise (and the Adjustments
// panel, which has no fallback path, actually breaking).
router.get("/pn/:pnNo", requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader", "cashier", "loan_officer", "bookkeeper"]), async (req, res) => {
  try {
    const member = await WaterMember.findOne({ 
      pnNo: req.params.pnNo.toUpperCase() 
    });

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    res.json(member);
  } catch (error) {
    console.error("Error fetching member:", error);
    res.status(500).json({ message: "Failed to fetch member" });
  }
});

// GET /api/water/members/:id
router.get("/:id", ...guard, async (req, res) => {
  try {
    const member = await WaterMember.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }
    res.json(member);
  } catch (error) {
    console.error("Error fetching member:", error);
    res.status(500).json({ message: "Failed to fetch member" });
  }
});

// POST /api/water/members
router.post("/", ...guard, async (req, res) => {
  try {
    const {
      pnNo,
      accountName,
      accountType,
      accountStatus,
      personal,
      address,
      contact,
      billing,
      meters,
      emergencyContacts,
      documents,
      notes,
      isExempted,
      exemptionReason
    } = req.body;

    const isExisting = req.body.isExistingMember === true;

    // Validation. Existing (migrated) members can have minimal info —
    // accountName is the only hard requirement; everything else is
    // filled in by the officer later through the UI.
    if (!accountName) {
      return res.status(400).json({ message: "Account name is required" });
    }
    if (!isExisting) {
      if (!contact?.mobileNumber || !personal?.fullName) {
        return res.status(400).json({
          message: "Missing required fields: mobileNumber, fullName",
        });
      }
    }

    // pnNo: auto-generate a 6-char alphanumeric account number when the
    // officer doesn't supply one. New-flow path (always auto-gen) and
    // legacy-flow path (use what's posted) both work — the officer can
    // override by typing a value in the form.
    let finalPnNo = (pnNo || "").trim().toUpperCase();
    if (!finalPnNo) {
      finalPnNo = await generateUniquePnNo();
      // Avoid colliding with a HELD (unpaid) member draft on a fee request.
      let guard = 0;
      while (guard++ < 10 && await MemberFeeRequest.findOne({ pnNo: finalPnNo, status: "pending", memberDraft: { $ne: null } }).select("_id").lean()) {
        finalPnNo = await generateUniquePnNo();
      }
    } else {
      const existingMember = await WaterMember.findOne({ pnNo: finalPnNo });
      if (existingMember) {
        return res.status(409).json({ message: `Account number ${finalPnNo} already exists` });
      }
      const heldDraft = await MemberFeeRequest.findOne({ pnNo: finalPnNo, status: "pending", memberDraft: { $ne: null } }).select("_id").lean();
      if (heldDraft) {
        return res.status(409).json({ message: `Account number ${finalPnNo} is held pending fee payment.` });
      }
    }

    // Validate meters
    if (!meters || !Array.isArray(meters) || meters.length === 0) {
      return res.status(400).json({ message: "At least one meter is required" });
    }

    // Auto-number meters when the client doesn't supply one. Shared
    // 5-digit base; per-meter "#N" suffix matches billing sequence.
    assignAutoMeterNumbers(meters, randomMeterBase());

    // FIXED: Clean coordinates before saving
    const cleanAddress = {
      ...address,
      coordinates: (address?.coordinates?.latitude && address?.coordinates?.longitude)
        ? address.coordinates
        : undefined
    };

    const cleanMeters = meters.map((meter, index) => ({
      ...meter,
      meterNumber: meter.meterNumber.toUpperCase().trim(),
      meterBrand: (meter.meterBrand || "").trim(),
      meterModel: (meter.meterModel || "").trim(),
      installationDate: meter.installationDate ? new Date(meter.installationDate) : new Date(),
      lastCalibration: meter.lastCalibration ? new Date(meter.lastCalibration) : null,
      nextCalibration: meter.nextCalibration ? new Date(meter.nextCalibration) : null,
      lastMaintenance: meter.lastMaintenance ? new Date(meter.lastMaintenance) : null,
      meterCondition: meter.meterCondition || "good",
      meterStatus: meter.meterStatus || "active",
      location: {
        description: (meter.location?.description || "").trim(),
        placement: meter.location?.placement || "front_yard",
        // Only save coordinates if both lat and long are valid
        coordinates: (meter.location?.coordinates?.latitude && meter.location?.coordinates?.longitude)
          ? meter.location.coordinates
          : undefined,
        accessNotes: (meter.location?.accessNotes || "").trim(),
        visibility: meter.location?.visibility || "good",
        safetyNotes: (meter.location?.safetyNotes || "").trim()
      },
      meterReaderNotes: (meter.meterReaderNotes || "").trim(),
      serialNumber: (meter.serialNumber || "").trim(),
      initialReading: parseFloat(meter.initialReading) || 0,
      lastReading: parseFloat(meter.lastReading) || 0,
      lastReadingDate: meter.lastReadingDate ? new Date(meter.lastReadingDate) : null,
      photoUrl: (meter.photoUrl || "").trim(),
      documents: meter.documents || [],
      isBillingActive: meter.isBillingActive !== false,
      billingSequence: meter.billingSequence || index,
      consumptionMultiplier: parseFloat(meter.consumptionMultiplier) || 1,
      createdBy: req.user?.employeeId || req.user?.username || "system",
      updatedBy: req.user?.employeeId || req.user?.username || "system",
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    // Build the member payload (saved now, or held on the fee request until
    // the cashier collects the membership fee — see holdForFee below).
    const memberPayload = {
      pnNo: finalPnNo,
      accountName: accountName.trim(),
      accountType: accountType || "individual",
      accountStatus: accountStatus || "active",
      isExistingMember: isExisting,
      personal: {
        fullName: (personal?.fullName || accountName).trim(),
        gender: personal?.gender || "other",
        birthdate: personal?.birthdate || "",
        dateRegistered: personal?.dateRegistered ? new Date(personal.dateRegistered) : new Date(),
        isSeniorCitizen: personal?.isSeniorCitizen || false,
        seniorId: (personal?.seniorId || "").trim(),
        seniorDiscountRate: parseFloat(personal?.seniorDiscountRate) || 5,
        spouseName: (personal?.spouseName || "").trim(),
        spouseIsSenior: personal?.spouseIsSenior || false,
        spouseSeniorId: (personal?.spouseSeniorId || "").trim(),
      },
      address: cleanAddress,
      contact: {
        mobileNumber: (contact?.mobileNumber || "").trim(),
        mobileNumber2: (contact?.mobileNumber2 || "").trim(),
        email: (contact?.email || "").trim(),
        email2: (contact?.email2 || "").trim(),
      },
      billing: {
        classification: billing?.classification || "residential",
        hasSeniorDiscount: personal?.isSeniorCitizen || false,
        hasPWD: billing?.hasPWD || false,
        pwdId: (billing?.pwdId || "").trim(),
        pwdDiscountRate: parseFloat(billing?.pwdDiscountRate) || 0,
        discountApplicableTiers: Array.isArray(billing?.discountApplicableTiers) 
          ? billing.discountApplicableTiers 
          : ["31-40", "41+"],
        tierSpecificDiscounts: billing?.tierSpecificDiscounts || [],
        billingCycle: billing?.billingCycle || "monthly",
        paperlessBilling: billing?.paperlessBilling || false,
        autoDeduct: billing?.autoDeduct || false,
        connectionType: billing?.connectionType || "standard",
        meterSize: billing?.meterSize || "5/8",
        waterSource: billing?.waterSource || "main_line",
        usageType: billing?.usageType || "domestic",
        averageMonthlyConsumption: 0,
        lastPaymentDate: null,
        lastPaymentAmount: 0
      },
      meters: cleanMeters,
      emergencyContacts: emergencyContacts || [],
      documents: documents || [],
      notes: (notes || "").trim(),
      history: [{
        date: new Date(),
        action: "created",
        description: "Member account created",
        performedBy: req.user?.employeeId || req.user?.username || "system"
      }],
      isExempted: isExempted || false,
      exemptionReason: (exemptionReason || "").trim(),
      hasArrears: false,
      arrearsAmount: 0,
      createdBy: req.user?.employeeId || req.user?.username || "system",
      updatedBy: req.user?.employeeId || req.user?.username || "system",
    };

    // Membership + tapping fee due for a NEW member (migrated/existing never owe).
    const ws = await WaterSettings.findOne().lean();
    const membershipFee = Number(ws?.membershipFee || 0);
    const includeTapping = req.body.includeTappingFee !== false;
    const tappingFee = includeTapping ? Number(ws?.tappingFee || 0) : 0;
    const feeTotal = Math.round((membershipFee + tappingFee) * 100) / 100;

    // PAY-BEFORE-ENROLL: a new member with a fee is NOT inserted yet — the
    // draft rides on a pending fee request and is enrolled automatically when
    // the cashier collects the fee. (Migrated members + zero-fee members are
    // inserted immediately.) Pass holdForFee:false to force an immediate save.
    const holdForFee = !isExisting && feeTotal > 0 && req.body.holdForFee !== false;
    if (holdForFee) {
      const feeRequest = await MemberFeeRequest.create({
        pnNo: finalPnNo,
        accountName: memberPayload.accountName,
        membershipFee, tappingFee, total: feeTotal,
        status: "pending",
        memberDraft: memberPayload,
        requestedBy: req.user?.fullName || req.user?.employeeId || "",
      });
      return res.status(202).json({
        pending: true,
        feeRequest,
        pnNo: finalPnNo,
        message: `Member held — collect ₱${feeTotal} membership fee at the cashier to enroll.`,
      });
    }

    // Immediate enrollment.
    const member = new WaterMember(memberPayload);
    await member.save();
    let feeRequest = null;
    if (!isExisting && feeTotal > 0) {
      try {
        feeRequest = await MemberFeeRequest.create({
          pnNo: member.pnNo, accountName: member.accountName,
          membershipFee, tappingFee, total: feeTotal,
          requestedBy: req.user?.fullName || req.user?.employeeId || "",
        });
      } catch (feeErr) {
        console.error("member fee request failed (member still created):", feeErr.message);
      }
    }
    res.status(201).json({ ...member.toObject(), feeRequest });
  } catch (error) {
    console.error("Error creating member:", error);
    
    if (error.code === 11000) {
      return res.status(409).json({ 
        message: "Account Number already exists. Please use a unique Account Number." 
      });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        message: "Member validation failed", 
        errors: messages 
      });
    }
    
    res.status(500).json({ 
      message: "Failed to create member",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});
// PUT /api/water/members/:id
router.put("/:id", ...editGuard, async (req, res) => {
  try {
    const {
      accountName,
      accountType,
      accountStatus,
      personal,
      address,
      contact,
      billing,
      meters,
      emergencyContacts,
      documents,
      notes,
      isExempted,
      exemptionReason,
      statusReason
    } = req.body;

    const member = await WaterMember.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Update fields
    if (accountName !== undefined) member.accountName = accountName.trim();
    if (accountType !== undefined) member.accountType = accountType;
    if (accountStatus !== undefined) {
      member.accountStatus = accountStatus;
      member.statusDate = new Date();
      if (statusReason) member.statusReason = statusReason.trim();
    }
    
    if (personal) {
      member.personal = {
        ...member.personal,
        fullName: personal.fullName?.trim() || member.personal.fullName,
        gender: personal.gender || member.personal.gender,
        birthdate: personal.birthdate || member.personal.birthdate,
        dateRegistered: personal.dateRegistered ? new Date(personal.dateRegistered) : member.personal.dateRegistered,
        isSeniorCitizen: personal.isSeniorCitizen !== undefined ? personal.isSeniorCitizen : member.personal.isSeniorCitizen,
        seniorId: (personal.seniorId || "").trim(),
        seniorDiscountRate: parseFloat(personal.seniorDiscountRate) || member.personal.seniorDiscountRate,
        spouseName: (personal.spouseName || "").trim(),
        spouseIsSenior: personal.spouseIsSenior || false,
        spouseSeniorId: (personal.spouseSeniorId || "").trim(),
      };
    }
    
    if (address) {
      member.address = {
        ...member.address,
        houseLotNo: (address.houseLotNo || "").trim(),
        streetSitioPurok: (address.streetSitioPurok || "").trim(),
        barangay: (address.barangay || "").trim(),
        municipalityCity: (address.municipalityCity || "").trim(),
        province: (address.province || "").trim(),
        zone: (address.zone || "").trim(),
        subdivision: (address.subdivision || "").trim(),
        landmark: (address.landmark || "").trim(),
        coordinates: address.coordinates || member.address.coordinates
      };
    }
    
    if (contact) {
      member.contact = {
        ...member.contact,
        mobileNumber: contact.mobileNumber?.trim() || member.contact.mobileNumber,
        mobileNumber2: (contact.mobileNumber2 || "").trim(),
        email: (contact.email || "").trim(),
        email2: (contact.email2 || "").trim(),
      };
    }
    
    if (billing) {
      member.billing = {
        ...member.billing,
        classification: billing.classification || member.billing.classification,
        hasSeniorDiscount: personal?.isSeniorCitizen !== undefined ? personal.isSeniorCitizen : member.billing.hasSeniorDiscount,
        hasPWD: billing.hasPWD !== undefined ? billing.hasPWD : member.billing.hasPWD,
        pwdId: (billing.pwdId || "").trim(),
        pwdDiscountRate: parseFloat(billing.pwdDiscountRate) || member.billing.pwdDiscountRate,
        discountApplicableTiers: Array.isArray(billing.discountApplicableTiers) 
          ? billing.discountApplicableTiers 
          : member.billing.discountApplicableTiers,
        tierSpecificDiscounts: billing.tierSpecificDiscounts || member.billing.tierSpecificDiscounts,
        billingCycle: billing.billingCycle || member.billing.billingCycle,
        paperlessBilling: billing.paperlessBilling !== undefined ? billing.paperlessBilling : member.billing.paperlessBilling,
        autoDeduct: billing.autoDeduct !== undefined ? billing.autoDeduct : member.billing.autoDeduct,
        connectionType: billing.connectionType || member.billing.connectionType,
        meterSize: billing.meterSize || member.billing.meterSize,
        waterSource: billing.waterSource || member.billing.waterSource,
        usageType: billing.usageType || member.billing.usageType,
        // Don't overwrite these from billing object
        averageMonthlyConsumption: member.billing.averageMonthlyConsumption,
        lastPaymentDate: member.billing.lastPaymentDate,
        lastPaymentAmount: member.billing.lastPaymentAmount
      };
    }
    
    // Update meters if provided
    if (meters && Array.isArray(meters)) {
      if (meters.length === 0) {
        return res.status(400).json({ 
          message: "At least one meter is required" 
        });
      }
      
      for (const meter of meters) {
        if (!meter.meterNumber || !meter.meterNumber.trim()) {
          return res.status(400).json({ 
            message: "Each meter must have a meter number" 
          });
        }
      }
      
      // Update existing meters or add new ones
      const now = new Date();
      member.meters = meters.map((meterData, index) => {
        // Check if this meter already exists
        const existingMeter = member.meters.find(
          m => m.meterNumber === meterData.meterNumber.toUpperCase().trim()
        );
        
        if (existingMeter) {
          // Update existing meter
          return {
            ...existingMeter,
            meterBrand: (meterData.meterBrand || "").trim(),
            meterModel: (meterData.meterModel || "").trim(),
            meterSize: meterData.meterSize || existingMeter.meterSize,
            installationDate: meterData.installationDate ? new Date(meterData.installationDate) : existingMeter.installationDate,
            lastCalibration: meterData.lastCalibration ? new Date(meterData.lastCalibration) : existingMeter.lastCalibration,
            nextCalibration: meterData.nextCalibration ? new Date(meterData.nextCalibration) : existingMeter.nextCalibration,
            lastMaintenance: meterData.lastMaintenance ? new Date(meterData.lastMaintenance) : existingMeter.lastMaintenance,
            meterCondition: meterData.meterCondition || existingMeter.meterCondition,
            meterStatus: meterData.meterStatus || existingMeter.meterStatus,
            location: {
              ...existingMeter.location,
              description: (meterData.location?.description || "").trim(),
              placement: meterData.location?.placement || existingMeter.location.placement,
              coordinates: meterData.location?.coordinates || existingMeter.location.coordinates,
              accessNotes: (meterData.location?.accessNotes || "").trim(),
              visibility: meterData.location?.visibility || existingMeter.location.visibility,
              safetyNotes: (meterData.location?.safetyNotes || "").trim()
            },
            meterReaderNotes: (meterData.meterReaderNotes || "").trim(),
            serialNumber: (meterData.serialNumber || "").trim(),
            isBillingActive: meterData.isBillingActive !== undefined ? meterData.isBillingActive : existingMeter.isBillingActive,
            billingSequence: meterData.billingSequence || index,
            consumptionMultiplier: parseFloat(meterData.consumptionMultiplier) || existingMeter.consumptionMultiplier,
            updatedBy: req.user?.employeeId || req.user?.username || "system",
            updatedAt: now
          };
        } else {
          // Add new meter
          return {
            meterNumber: meterData.meterNumber.toUpperCase().trim(),
            meterBrand: (meterData.meterBrand || "").trim(),
            meterModel: (meterData.meterModel || "").trim(),
            meterSize: meterData.meterSize || "5/8",
            installationDate: meterData.installationDate ? new Date(meterData.installationDate) : now,
            lastCalibration: meterData.lastCalibration ? new Date(meterData.lastCalibration) : null,
            nextCalibration: meterData.nextCalibration ? new Date(meterData.nextCalibration) : null,
            lastMaintenance: meterData.lastMaintenance ? new Date(meterData.lastMaintenance) : null,
            meterCondition: meterData.meterCondition || "good",
            meterStatus: meterData.meterStatus || "active",
            location: {
              description: (meterData.location?.description || "").trim(),
              placement: meterData.location?.placement || "front_yard",
              coordinates: meterData.location?.coordinates || {
                latitude: null,
                longitude: null,
                accuracy: null
              },
              accessNotes: (meterData.location?.accessNotes || "").trim(),
              visibility: meterData.location?.visibility || "good",
              safetyNotes: (meterData.location?.safetyNotes || "").trim()
            },
            meterReaderNotes: (meterData.meterReaderNotes || "").trim(),
            serialNumber: (meterData.serialNumber || "").trim(),
            initialReading: parseFloat(meterData.initialReading) || 0,
            lastReading: parseFloat(meterData.lastReading) || 0,
            lastReadingDate: meterData.lastReadingDate ? new Date(meterData.lastReadingDate) : null,
            photoUrl: (meterData.photoUrl || "").trim(),
            documents: meterData.documents || [],
            isBillingActive: meterData.isBillingActive !== false,
            billingSequence: meterData.billingSequence || index,
            consumptionMultiplier: parseFloat(meterData.consumptionMultiplier) || 1,
            createdBy: req.user?.employeeId || req.user?.username || "system",
            updatedBy: req.user?.employeeId || req.user?.username || "system",
            createdAt: now,
            updatedAt: now
          };
        }
      });
    }
    
    if (emergencyContacts !== undefined) member.emergencyContacts = emergencyContacts;
    if (documents !== undefined) member.documents = documents;
    if (notes !== undefined) member.notes = notes.trim();
    if (isExempted !== undefined) member.isExempted = isExempted;
    if (exemptionReason !== undefined) member.exemptionReason = exemptionReason.trim();
    
    // Add to history
    member.history.push({
      date: new Date(),
      action: "updated",
      description: "Member information updated",
      performedBy: req.user?.employeeId || req.user?.username || "system"
    });
    
    member.updatedBy = req.user?.employeeId || req.user?.username || "system";
    member.updatedAt = new Date();
    
    await member.save();
    res.json(member);
  } catch (error) {
    console.error("Error updating member:", error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        message: "Member validation failed", 
        errors: messages 
      });
    }
    
    res.status(500).json({ 
      message: "Failed to update member",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// POST /api/water/members/:id/meters
// Append a single meter to an existing member. Intentionally uses the
// regular `guard` (no requireAdminAuthz) so a water_bill_officer or
// meter_reader can register a new physical connection on an existing PN
// without dual-control. Editing an existing meter still goes through the
// full PUT /api/water/members/:id (admin-authz protected).
router.post("/:id/meters", ...guard, async (req, res) => {
  try {
    const member = await WaterMember.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const md = req.body || {};

    // Auto-generate meter number when the officer doesn't supply one.
    // Reuses the 5-digit base prefix from the account's existing meters
    // so all meters on one PN share an identifier — only the "#N"
    // suffix changes.
    let meterNumber;
    if (md.meterNumber && String(md.meterNumber).trim()) {
      meterNumber = String(md.meterNumber).toUpperCase().trim();
    } else {
      const existingBase = (() => {
        for (const m of member.meters) {
          const match = String(m.meterNumber || "").match(/^(\d{5})#\d+$/);
          if (match) return match[1];
        }
        return null;
      })();
      const base = existingBase || randomMeterBase();
      // Find the next free "#N" suffix on this account.
      const usedSuffixes = new Set(
        member.meters
          .map((m) => String(m.meterNumber || "").match(/^\d{5}#(\d+)$/))
          .filter(Boolean)
          .map((m) => parseInt(m[1], 10))
      );
      let nextSuffix = 1;
      while (usedSuffixes.has(nextSuffix)) nextSuffix++;
      meterNumber = `${base}#${nextSuffix}`;
    }

    if (member.meters.some((m) => m.meterNumber === meterNumber)) {
      return res.status(409).json({ message: "That meter number is already on this account" });
    }

    const now = new Date();
    const who = req.user?.employeeId || req.user?.username || "system";

    member.meters.push({
      meterNumber,
      meterBrand: (md.meterBrand || "").trim(),
      meterModel: (md.meterModel || "").trim(),
      meterSize: md.meterSize || "5/8",
      installationDate: md.installationDate ? new Date(md.installationDate) : now,
      meterCondition: md.meterCondition || "good",
      meterStatus: md.meterStatus || "active",
      location: {
        description: (md.location?.description || "").trim(),
        placement: md.location?.placement || "front_yard",
        coordinates: md.location?.coordinates || { latitude: null, longitude: null, accuracy: null },
        accessNotes: (md.location?.accessNotes || "").trim(),
        visibility: md.location?.visibility || "good",
        safetyNotes: (md.location?.safetyNotes || "").trim(),
      },
      serialNumber: (md.serialNumber || "").trim(),
      initialReading: parseFloat(md.initialReading) || 0,
      lastReading: parseFloat(md.initialReading) || 0,
      isBillingActive: md.isBillingActive !== false,
      billingSequence: member.meters.length,
      consumptionMultiplier: parseFloat(md.consumptionMultiplier) || 1,
      createdBy: who,
      updatedBy: who,
      createdAt: now,
      updatedAt: now,
    });

    member.history.push({
      date: now,
      action: "meter_added",
      description: `Added meter ${meterNumber}`,
      performedBy: who,
    });

    member.updatedBy = who;
    member.updatedAt = now;

    await member.save();
    res.json(member);
  } catch (error) {
    console.error("Error adding meter:", error);
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: "Meter validation failed", errors: messages });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: "That meter number is already in use" });
    }
    res.status(500).json({
      message: "Failed to add meter",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// DELETE /api/water/members/:id
router.delete("/:id", ...editGuard, async (req, res) => {
  try {
    const member = await WaterMember.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Check if member has bills
    const billCount = await WaterBill.countDocuments({ pnNo: member.pnNo });
    if (billCount > 0) {
      return res.status(400).json({ 
        message: "Cannot delete member with existing bills. Delete bills first." 
      });
    }

    await member.deleteOne();
    res.json({ 
      message: "Member deleted successfully",
      pnNo: member.pnNo
    });
  } catch (error) {
    console.error("Error deleting member:", error);
    res.status(500).json({ 
      message: "Failed to delete member",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET /api/water/members/:id/bills
router.get("/:id/bills", ...guard, async (req, res) => {
  try {
    const member = await WaterMember.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const bills = await WaterBill.find({ pnNo: member.pnNo })
      .sort({ periodCovered: -1 })
      .limit(12);

    res.json({
      pnNo: member.pnNo,
      accountName: member.accountName,
      bills: bills,
      totalBills: bills.length
    });
  } catch (error) {
    console.error("Error fetching member bills:", error);
    res.status(500).json({ 
      message: "Failed to fetch member bills",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET /api/water/members/:id/payments
router.get("/:id/payments", ...guard, async (req, res) => {
  try {
    const member = await WaterMember.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Get bills first, then payments
    const bills = await WaterBill.find({ pnNo: member.pnNo }).select('_id');
    const billIds = bills.map(bill => bill._id);

    // This would require a WaterPayment model with billId references
    // For now, return basic payment info from bills
    const paidBills = await WaterBill.find({
      pnNo: member.pnNo,
      status: "paid"
    }).sort({ paidAt: -1 }).limit(10);

    res.json({
      pnNo: member.pnNo,
      accountName: member.accountName,
      payments: paidBills.map(bill => ({
        period: bill.periodCovered,
        amount: bill.totalDue,
        paidAt: bill.paidAt,
        orNo: bill.orNo,
        status: bill.status
      })),
      totalPayments: paidBills.length
    });
  } catch (error) {
    console.error("Error fetching member payments:", error);
    res.status(500).json({ 
      message: "Failed to fetch member payments",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

// GET /api/water/members/stats/summary
router.get("/stats/summary", ...guard, async (req, res) => {
  try {
    const stats = await WaterMember.aggregate([
      {
        $group: {
          _id: null,
          totalMembers: { $sum: 1 },
          activeMembers: { 
            $sum: { $cond: [{ $eq: ["$accountStatus", "active"] }, 1, 0] } 
          },
          seniorCitizens: { 
            $sum: { $cond: [{ $eq: ["$personal.isSeniorCitizen", true] }, 1, 0] } 
          },
          byClassification: {
            $push: {
              classification: "$billing.classification",
              count: 1
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalMembers: 1,
          activeMembers: 1,
          seniorCitizens: 1,
          classificationSummary: {
            $arrayToObject: {
              $map: {
                input: "$byClassification",
                as: "item",
                in: {
                  k: { $ifNull: ["$$item.classification", "unknown"] },
                  v: "$$item.count"
                }
              }
            }
          }
        }
      }
    ]);

    res.json(stats[0] || {
      totalMembers: 0,
      activeMembers: 0,
      seniorCitizens: 0,
      classificationSummary: {}
    });
  } catch (error) {
    console.error("Error fetching member stats:", error);
    res.status(500).json({ 
      message: "Failed to fetch member statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

export default router;