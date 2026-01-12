import express from "express";
import WaterMember from "../../models/WaterMember.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();

// Only Admin + Water Bill Officer
const guard = [requireAuth, requireRole(["admin", "water_bill_officer"])];

// GET /api/water/members?q=&page=&limit=
router.get("/", ...guard, async (req, res) => {
  const q = (req.query.q || "").trim();
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "12", 10)));
  const skip = (page - 1) * limit;

  const filter = q
    ? {
        $or: [
          { pnNo: { $regex: q, $options: "i" } },
          { accountName: { $regex: q, $options: "i" } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    WaterMember.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    WaterMember.countDocuments(filter),
  ]);

  res.json({ items, total, page, limit });
});

// POST /api/water/members
router.post("/", ...guard, async (req, res) => {
  try {
    const body = req.body || {};

    // basic validations
    if (!body.pnNo || !body.accountName) {
      return res.status(400).json({ message: "PN No and Account Name are required" });
    }
    if (!body.meterNumber) {
      return res.status(400).json({ message: "Meter Number is required" });
    }
    if (!body.personal?.fullName) {
      return res.status(400).json({ message: "Full Name of Account Holder is required" });
    }
    if (!body.personal?.birthdate) {
  return res.status(400).json({ message: "Birthdate is required" });
    }
    if (!body.contact?.mobileNumber) {
      return res.status(400).json({ message: "Mobile Number is required" });
    }

    const exists = await WaterMember.findOne({ pnNo: body.pnNo.trim() });
    if (exists) return res.status(409).json({ message: "PN No already exists" });

    const created = await WaterMember.create({
      pnNo: body.pnNo.trim(),
      accountName: body.accountName.trim(),
      classification: body.classification || "residential",
      meterNumber: body.meterNumber.trim(),
      accountStatus: body.accountStatus || "active",
      personal: {
        fullName: body.personal.fullName.trim(),
        gender: body.personal.gender || "other",
        birthdate: String(body.personal.birthdate).trim(), // ✅ add
        dateRegistered: body.personal.dateRegistered || undefined,
      },

      address: {
        houseLotNo: body.address?.houseLotNo || "",
        streetSitioPurok: body.address?.streetSitioPurok || "",
        barangay: body.address?.barangay || "",
        municipalityCity: body.address?.municipalityCity || "",
        province: body.address?.province || "",
      },
      contact: {
        mobileNumber: body.contact.mobileNumber.trim(),
        email: (body.contact.email || "").trim(),
      },
    });

    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ message: "Failed to create member" });
  }
});

// PUT /api/water/members/:id
router.put("/:id", ...guard, async (req, res) => {
  try {
    const body = req.body || {};
    const member = await WaterMember.findById(req.params.id);
    if (!member) return res.status(404).json({ message: "Member not found" });

    // if pnNo changed, ensure unique
    const nextPn = (body.pnNo || member.pnNo).trim();
    if (nextPn !== member.pnNo) {
      const exists = await WaterMember.findOne({ pnNo: nextPn });
      if (exists) return res.status(409).json({ message: "PN No already exists" });
    }

    member.pnNo = nextPn;
    member.accountName = (body.accountName || member.accountName).trim();
    member.classification = body.classification || member.classification;
    member.meterNumber = (body.meterNumber || member.meterNumber).trim();
    member.accountStatus = body.accountStatus || member.accountStatus;

        member.personal = {
      fullName: (body.personal?.fullName || member.personal.fullName).trim(),
      gender: body.personal?.gender || member.personal.gender,
      birthdate: String(body.personal?.birthdate || member.personal.birthdate).trim(), // ✅ add
      dateRegistered: body.personal?.dateRegistered || member.personal.dateRegistered,
    };

    member.address = {
      houseLotNo: body.address?.houseLotNo ?? member.address?.houseLotNo ?? "",
      streetSitioPurok: body.address?.streetSitioPurok ?? member.address?.streetSitioPurok ?? "",
      barangay: body.address?.barangay ?? member.address?.barangay ?? "",
      municipalityCity: body.address?.municipalityCity ?? member.address?.municipalityCity ?? "",
      province: body.address?.province ?? member.address?.province ?? "",
    };

    member.contact = {
      mobileNumber: (body.contact?.mobileNumber || member.contact.mobileNumber).trim(),
      email: (body.contact?.email ?? member.contact.email ?? "").trim(),
    };

    await member.save();
    res.json(member);
  } catch (e) {
    res.status(500).json({ message: "Failed to update member" });
  }
});

// DELETE /api/water/members/:id
router.delete("/:id", ...guard, async (req, res) => {
  const member = await WaterMember.findById(req.params.id);
  if (!member) return res.status(404).json({ message: "Member not found" });
  await member.deleteOne();
  res.json({ ok: true });
});

export default router;
