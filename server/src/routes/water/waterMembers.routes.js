import express from "express";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/waterbill.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader"])];

// GET /api/water/members?q=&page=&limit=&classification=&status=
router.get("/", ...guard, async (req, res) => {
  const q = (req.query.q || "").trim();
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "12", 10)));
  const classification = (req.query.classification || "").trim();
  const status = (req.query.status || "").trim();
  const skip = (page - 1) * limit;

  const filter = {};
  if (classification) filter["billing.classification"] = classification;
  if (status) filter.accountStatus = status;

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
        .limit(limit),
      WaterMember.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (error) {
    console.error("Error fetching members:", error);
    res.status(500).json({ message: "Failed to fetch members" });
  }
});

// GET /api/water/members/pn/:pnNo
router.get("/pn/:pnNo", ...guard, async (req, res) => {
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

    // Validation
    if (!pnNo || !accountName || !contact?.mobileNumber || !personal?.fullName) {
      return res.status(400).json({ 
        message: "Missing required fields: pnNo, accountName, mobileNumber, fullName" 
      });
    }

    // Check for duplicate PN No
    const existingMember = await WaterMember.findOne({ pnNo: pnNo.toUpperCase() });
    if (existingMember) {
      return res.status(409).json({ 
        message: `PN Number ${pnNo} already exists` 
      });
    }

    // Validate meters
    if (!meters || !Array.isArray(meters) || meters.length === 0) {
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

    // Create member
    const member = new WaterMember({
      pnNo: pnNo.toUpperCase().trim(),
      accountName: accountName.trim(),
      accountType: accountType || "individual",
      accountStatus: accountStatus || "active",
      personal: {
        fullName: personal.fullName.trim(),
        gender: personal.gender || "other",
        birthdate: personal.birthdate,
        dateRegistered: personal.dateRegistered ? new Date(personal.dateRegistered) : new Date(),
        isSeniorCitizen: personal.isSeniorCitizen || false,
        seniorId: (personal.seniorId || "").trim(),
        seniorDiscountRate: parseFloat(personal.seniorDiscountRate) || 5,
        spouseName: (personal.spouseName || "").trim(),
        spouseIsSenior: personal.spouseIsSenior || false,
        spouseSeniorId: (personal.spouseSeniorId || "").trim(),
      },
      address: cleanAddress,
      contact: {
        mobileNumber: contact.mobileNumber.trim(),
        mobileNumber2: (contact.mobileNumber2 || "").trim(),
        email: (contact.email || "").trim(),
        email2: (contact.email2 || "").trim(),
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
    });

    await member.save();
    res.status(201).json(member);
  } catch (error) {
    console.error("Error creating member:", error);
    
    if (error.code === 11000) {
      return res.status(409).json({ 
        message: "PN Number already exists. Please use a unique PN Number." 
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
router.put("/:id", ...guard, async (req, res) => {
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

// DELETE /api/water/members/:id
router.delete("/:id", ...guard, async (req, res) => {
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