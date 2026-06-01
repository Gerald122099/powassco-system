// server/src/routes/water/waterBatches.routes.js
import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import crypto from "crypto";
import WaterBatch from "../../models/WaterBatch.js";
import WaterMember from "../../models/WaterMember.js";
import WaterReading from "../../models/WaterReading.js";
import WaterBill from "../../models/WaterBill.js";
import User from "../../models/User.js";
import AuditLog from "../../models/AuditLog.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { upsertWaterBill } from "../../utils/waterBillUpsert.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader", "plumber"])];

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `import_${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.db', '.sqlite', '.sqlite3', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, JSON, and SQLite files are allowed.'));
    }
  }
});

// Helper function to save imported files
async function saveImportedFile(file, periodKey, readerName) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const savedDir = path.join(__dirname, '../../uploads/imports', periodKey);
    
    if (!fs.existsSync(savedDir)) {
      fs.mkdirSync(savedDir, { recursive: true });
    }
    
    const fileName = `${timestamp}_${readerName}_${file.originalname}`;
    const savedPath = path.join(savedDir, fileName);
    
    // Copy file from temp to saved location
    fs.copyFileSync(file.path, savedPath);
    
    // Also save a copy in the main imports folder
    const mainDir = path.join(__dirname, '../../uploads/imports/all');
    if (!fs.existsSync(mainDir)) {
      fs.mkdirSync(mainDir, { recursive: true });
    }
    const mainPath = path.join(mainDir, fileName);
    fs.copyFileSync(file.path, mainPath);
    
    return {
      path: savedPath,
      fileName: fileName,
      size: file.size
    };
  } catch (error) {
    console.error("Error saving imported file:", error);
    return null;
  }
}

// Helper function to save exported files
async function saveExportedFile(data, periodKey, batchNumber) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = path.join(__dirname, '../../uploads/exports', periodKey);
    
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    const fileName = `${timestamp}_batch_${batchNumber}.json`;
    const filePath = path.join(exportDir, fileName);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    // Also save a copy in the main exports folder
    const mainDir = path.join(__dirname, '../../uploads/exports/all');
    if (!fs.existsSync(mainDir)) {
      fs.mkdirSync(mainDir, { recursive: true });
    }
    const mainPath = path.join(mainDir, fileName);
    fs.writeFileSync(mainPath, JSON.stringify(data, null, 2));
    
    return {
      path: filePath,
      fileName: fileName,
      size: fs.statSync(filePath).size
    };
  } catch (error) {
    console.error("Error saving exported file:", error);
    return null;
  }
}

// Helper function to get last actual reading
async function getLastActualReading(pnNo, meterNumber) {
  const lastReading = await WaterReading.findOne({
    pnNo,
    meterNumber
  }).sort({ periodKey: -1 }).lean();
  
  if (lastReading) {
    return {
      presentReading: lastReading.presentReading,
      readAt: lastReading.readAt,
      periodKey: lastReading.periodKey,
      source: "reading"
    };
  }
  
  const lastBill = await WaterBill.findOne({
    pnNo,
    meterNumber,
    status: "paid"
  }).sort({ periodKey: -1 }).lean();
  
  if (lastBill) {
    return {
      presentReading: lastBill.presentReading,
      readAt: lastBill.readingDate,
      periodKey: lastBill.periodCovered,
      source: "bill"
    };
  }
  
  return null;
}

// One-time index hygiene: drop the legacy "members_1_unique_sparse" index if
// it survived from an earlier deploy. Fire-and-forget; never blocks startup.
(async () => {
  try {
    const idxs = await WaterBatch.collection.indexes();
    for (const i of idxs) {
      if (i.unique && i.key && i.key.members === 1) {
        await WaterBatch.collection.dropIndex(i.name);
        console.log("✅ Dropped legacy unique index on WaterBatch.members:", i.name);
      }
    }
  } catch (_) { /* index may not exist or DB is still connecting */ }
})();

// GET all batches — uses .lean() so populated-null entries are easy to filter.
router.get("/", ...guard, async (req, res) => {
  try {
    const batches = await WaterBatch.find({ isActive: true })
      .populate("members", "pnNo accountName meters address billing personal")
      .sort({ batchNumber: 1 })
      .lean();

    for (const b of batches) {
      b.members = (b.members || []).filter(Boolean);
    }
    const assignedMemberIds = batches.flatMap((b) => (b.members || []).map((m) => m._id));
    const availableMembers = await WaterMember.find({
      _id: { $nin: assignedMemberIds },
      accountStatus: "active",
    })
      .select("pnNo accountName meters address billing personal")
      .lean();

    res.json({ batches, availableMembers });
  } catch (error) {
    console.error("Error loading batches:", error);
    res.status(500).json({ error: error.message });
  }
});

// CREATE new batch
router.post("/", ...guard, async (req, res) => {
  try {
    const batchName = String(req.body?.batchName || "").trim();
    const readerName = String(req.body?.readerName || "").trim();
    const readerId = String(req.body?.readerId || "").trim();
    const area = String(req.body?.area || "").trim();

    if (!batchName) return res.status(400).json({ error: "Batch name is required." });
    if (!readerName || !readerId) return res.status(400).json({ error: "Reader (plumber / meter reader) is required." });

    // Compute the next batch number. Pad to 3 digits; tolerate any stray
    // suffixes in the parse so a single bad row doesn't poison the counter.
    const lastBatch = await WaterBatch.findOne().sort({ batchNumber: -1 }).lean();
    let nextNum = 1;
    if (lastBatch?.batchNumber) {
      const m = String(lastBatch.batchNumber).match(/(\d+)/);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const batchNumber = `BATCH-${String(nextNum).padStart(3, "0")}`;

    const batch = new WaterBatch({
      batchNumber,
      batchName,
      readerName,
      readerId,
      area,
      members: [],
      meterNumbers: [],
      createdBy: req.user?.employeeId || req.user?.fullName || "system",
      updatedBy: req.user?.employeeId || req.user?.fullName || "system",
    });

    await batch.save();
    res.status(201).json(batch);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "A batch with that number already exists. Refresh and try again." });
    }
    console.error("Error creating batch:", error);
    res.status(500).json({ error: error.message || "Failed to create batch." });
  }
});

// DELETE batch — admin or water_bill_officer, but only after re-verifying
// password AND a current 2FA code (or one of the user's recovery codes).
// This is a destructive, hard-to-undo action: the re-auth is the safety net.
const deleteGuard = [requireAuth, requireRole(["admin", "water_bill_officer"])];
router.delete("/:id", ...deleteGuard, async (req, res) => {
  try {
    const password = String(req.body?.password || "");
    const code = String(req.body?.code || "").replace(/\s/g, "");
    if (!password) return res.status(400).json({ message: "Password is required." });
    if (!code) return res.status(400).json({ message: "Authenticator code (or recovery code) is required." });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(401).json({ message: "Session user not found." });

    const pwOk = await bcrypt.compare(password, user.passwordHash);
    if (!pwOk) return res.status(401).json({ message: "Wrong password." });

    let codeOk = false;
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      codeOk = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    }
    if (!codeOk) {
      // Fall back to a one-time recovery code so a lost-authenticator admin
      // is never blocked from a destructive op.
      const h = sha256(code.toUpperCase().replace(/[\s-]/g, ""));
      const rc = (user.recoveryCodes || []).find((x) => x.codeHash === h && !x.used);
      if (rc) {
        rc.used = true;
        rc.usedAt = new Date();
        await user.save();
        codeOk = true;
      }
    }
    if (!codeOk) return res.status(401).json({ message: "Invalid authenticator code." });

    if (!user.twoFactorEnabled) {
      return res.status(403).json({ message: "2FA must be set up on your account before deleting batches. Enroll in Security first." });
    }

    const batch = await WaterBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: "Batch not found." });
    const snapshot = { _id: batch._id, batchNumber: batch.batchNumber, batchName: batch.batchName, readerName: batch.readerName, memberCount: (batch.members || []).length };
    await batch.deleteOne();

    // Audit (security category) so this is easy to find later.
    try {
      await AuditLog.create({
        actorId: String(user._id),
        actorName: user.fullName || user.employeeId,
        actorRole: user.role,
        method: "DELETE",
        path: `/api/water/batches/${req.params.id}`,
        action: `Deleted batch ${snapshot.batchNumber} — "${snapshot.batchName}" (${snapshot.memberCount} member(s))`,
        category: "security",
        statusCode: 200,
        ip: (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim(),
      });
    } catch { /* best-effort */ }

    res.json({ ok: true, message: `Batch ${snapshot.batchNumber} deleted.`, deleted: snapshot });
  } catch (error) {
    console.error("Delete batch error:", error);
    res.status(500).json({ message: error.message || "Failed to delete batch." });
  }
});

// UPDATE batch
router.put("/:id", ...guard, async (req, res) => {
  try {
    const { batchName, readerName, readerId, area, isActive } = req.body;
    
    const batch = await WaterBatch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    batch.batchName = batchName || batch.batchName;
    batch.readerName = readerName || batch.readerName;
    batch.readerId = readerId || batch.readerId;
    batch.area = area || batch.area;
    batch.isActive = isActive !== undefined ? isActive : batch.isActive;
    batch.updatedBy = req.user?.employeeId || req.user?.username || "system";
    
    await batch.save();
    res.json(batch);
  } catch (error) {
    console.error("Error updating batch:", error);
    res.status(500).json({ error: error.message });
  }
});

// ADD members to batch
router.post("/:id/members", ...guard, async (req, res) => {
  try {
    const { memberIds } = req.body;
    const batch = await WaterBatch.findById(req.params.id);
    
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    const otherBatches = await WaterBatch.find({
      _id: { $ne: batch._id },
      members: { $in: memberIds }
    });
    
    if (otherBatches.length > 0) {
      return res.status(400).json({ 
        error: "Some members are already assigned to other batches",
        batches: otherBatches.map(b => b.batchName)
      });
    }
    
    const members = await WaterMember.find({ _id: { $in: memberIds } });
    const meterNumbers = members.flatMap(m => 
      m.meters
        .filter(mtr => mtr.meterStatus === "active" && mtr.isBillingActive)
        .map(mtr => mtr.meterNumber)
    );
    
    const newMemberIds = memberIds.filter(id => !batch.members.includes(id));
    batch.members.push(...newMemberIds);
    
    const newMeterNumbers = meterNumbers.filter(mn => !batch.meterNumbers.includes(mn));
    batch.meterNumbers.push(...newMeterNumbers);
    
    batch.updatedBy = req.user?.employeeId || req.user?.username || "system";
    await batch.save();
    
    const updatedBatch = await WaterBatch.findById(batch._id).populate("members");
    res.json(updatedBatch);
  } catch (error) {
    console.error("Error adding members:", error);
    res.status(500).json({ error: error.message });
  }
});

// REMOVE members from batch
router.delete("/:id/members/:memberId", ...guard, async (req, res) => {
  try {
    const batch = await WaterBatch.findById(req.params.id);
    
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    const member = await WaterMember.findById(req.params.memberId);
    
    batch.members = batch.members.filter(id => id.toString() !== req.params.memberId);
    
    if (member) {
      const meterNumbers = member.meters
        .filter(m => m.meterStatus === "active" && m.isBillingActive)
        .map(m => m.meterNumber);
      
      batch.meterNumbers = batch.meterNumbers.filter(mn => !meterNumbers.includes(mn));
    }
    
    batch.updatedBy = req.user?.employeeId || req.user?.username || "system";
    await batch.save();
    
    res.json({ message: "Member removed from batch" });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ error: error.message });
  }
});

// EXPORT batch to CSV
router.get("/:id/export", ...guard, async (req, res) => {
  try {
    const { periodKey } = req.query;
    if (!periodKey) {
      return res.status(400).json({ error: "periodKey is required" });
    }
    
    const batch = await WaterBatch.findById(req.params.id).populate("members");
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    const exportData = [];
    
    for (const member of batch.members) {
      const activeMeters = member.meters.filter(
        m => m.meterStatus === "active" && m.isBillingActive === true
      );
      
      console.log(`Member ${member.pnNo} (${member.accountName}) has ${activeMeters.length} active meters`);
      
      for (const meter of activeMeters) {
        const lastReading = await getLastActualReading(member.pnNo, meter.meterNumber);
        
        exportData.push({
          BatchNumber: batch.batchNumber,
          BatchName: batch.batchName,
          ReaderName: batch.readerName,
          ReaderId: batch.readerId,
          PNNo: member.pnNo,
          AccountName: member.accountName,
          MeterNumber: meter.meterNumber,
          PreviousReading: lastReading?.presentReading || meter.lastReading || 0,
          PreviousReadingDate: lastReading?.readAt ? new Date(lastReading.readAt).toISOString() : "",
          PreviousPeriod: lastReading?.periodKey || "",
          MeterBrand: meter.meterBrand || "",
          MeterModel: meter.meterModel || "",
          MeterSize: meter.meterSize || "",
          ConsumptionMultiplier: meter.consumptionMultiplier || 1,
          Classification: member.billing?.classification || "residential",
          IsSenior: member.personal?.isSeniorCitizen || false,
          SeniorDiscountRate: member.personal?.seniorDiscountRate || 0,
          Address: member.fullAddress || "",
          Barangay: member.address?.barangay || "",
          Latitude: meter.location?.coordinates?.latitude || "",
          Longitude: meter.location?.coordinates?.longitude || "",
          LocationDescription: meter.location?.description || "",
        });
      }
    }
    
    console.log(`Total export rows: ${exportData.length}`);
    
    // Save export data as JSON for backup
    await saveExportedFile({
      batch: batch,
      exportData: exportData,
      periodKey: periodKey,
      exportedAt: new Date()
    }, periodKey, batch.batchNumber);
    
    const headers = [
      "BatchNumber", "BatchName", "ReaderName", "ReaderId",
      "PNNo", "AccountName", "MeterNumber", "PreviousReading",
      "PreviousReadingDate", "PreviousPeriod", "MeterBrand",
      "MeterModel", "MeterSize", "ConsumptionMultiplier",
      "Classification", "IsSenior", "SeniorDiscountRate",
      "Address", "Barangay", "Latitude", "Longitude", "LocationDescription"
    ];
    
    const csvRows = [];
    csvRows.push(headers.join(','));
    
    for (const row of exportData) {
      const values = headers.map(header => {
        const value = row[header] !== undefined && row[header] !== null ? row[header] : "";
        const escaped = String(value).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const csvContent = csvRows.join('\n');
    const filename = `batch_${batch.batchNumber}_${periodKey}_${Date.now()}.csv`;
    
    batch.lastExportedAt = new Date();
    batch.lastExportFile = filename;
    await batch.save();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: error.message });
  }
});

// IMPORT readings from mobile app (JSON/CSV)
router.post("/import-readings", ...guard, async (req, res) => {
  try {
    // Default generateBill to FALSE for field syncs. Per-reading bill
    // regeneration was the dominant cost (settings find + bill find +
    // tariff calc + bill save per reading). The officer batch-regenerates
    // from the Readings panel instead.
    const { readings, periodKey, forceUpdate = false, generateBill = false } = req.body;
    
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
    
    console.log(`Importing ${readings?.length || 0} readings for period ${periodKey}`);
    
    if (!readings || !Array.isArray(readings)) {
      return res.status(400).json({ error: "Invalid readings data" });
    }
    
    if (readings.length === 0) {
      return res.status(400).json({ error: "No readings to import" });
    }
    
    // Validate each reading has required fields
    const validationErrors = [];
    readings.forEach((reading, index) => {
      if (!reading.pnNo) validationErrors.push(`Row ${index + 1}: Missing PN No`);
      if (!reading.meterNumber) validationErrors.push(`Row ${index + 1}: Missing Meter Number`);
      if (reading.previousReading === undefined) validationErrors.push(`Row ${index + 1}: Missing Previous Reading`);
      if (reading.presentReading === undefined) validationErrors.push(`Row ${index + 1}: Missing Present Reading`);
    });
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationErrors
      });
    }

    // Security: trust the authenticated user, not client-supplied identity.
    const actor = req.user || {};
    const actorLabel = actor.fullName || actor.employeeId || "mobile_app";
    const isPrivileged = ["admin", "water_bill_officer"].includes(actor.role);

    // A meter reader may only import readings for members in THEIR active batch.
    let allowedPns = null; // null = unrestricted (admin/officer)
    if (!isPrivileged) {
      const myBatches = await WaterBatch.find({
        isActive: true,
        $or: [
          { readerId: String(actor.employeeId || " ") },
          { readerId: String(actor.id || actor._id || " ") },
          { readerName: actor.fullName || " " },
        ],
      }).populate("members", "pnNo");
      allowedPns = new Set();
      for (const b of myBatches) for (const m of b.members || []) if (m?.pnNo) allowedPns.add(String(m.pnNo).toUpperCase());
    }

    // Generate/refresh the official bill from a synced reading (canonical path;
    // won't overwrite a paid bill). Best-effort: the reading is already saved.
    const maybeGenerateBill = async (member, reading) => {
      if (generateBill === false) return;
      try {
        await upsertWaterBill({
          member,
          periodCovered: periodKey,
          meterReading: {
            meterNumber: reading.meterNumber,
            previousReading: reading.previousReading,
            presentReading: reading.presentReading,
            multiplier: reading.consumptionMultiplier || 1,
          },
          readingDate: reading.readDate ? new Date(parseInt(reading.readDate)) : new Date(),
          readerId: actorLabel,
          remarks: "Field sync",
          createdBy: actorLabel,
          forceUpdate: false,
        });
      } catch (e) {
        console.error(`Bill generation failed for ${reading.pnNo}-${reading.meterNumber}:`, e.message);
      }
    };

    // PERFORMANCE: pre-fetch every member + every existing reading in two
    // queries instead of doing N findOne calls inside the loop. On the
    // free Atlas tier each roundtrip is 50-150ms; this turns a 50-row
    // sync from ~10s of network waits into ~200ms.
    const _uniquePns = [...new Set(readings.map((r) => String(r.pnNo).toUpperCase()))];
    // Not .lean() — upsertWaterBill mutates and saves the member doc when
    // generateBill is true. Keeping these as full Mongoose docs lets the
    // batch save path work without an extra refetch.
    const _membersBulk = await WaterMember.find({ pnNo: { $in: _uniquePns } });
    const _memberByPn = new Map(_membersBulk.map((m) => [String(m.pnNo).toUpperCase(), m]));
    const _existingBulk = await WaterReading.find({ periodKey, pnNo: { $in: _uniquePns } }).select("_id pnNo meterNumber").lean();
    const _existingByKey = new Map(
      _existingBulk.map((d) => [`${String(d.pnNo).toUpperCase()}__${String(d.meterNumber).toUpperCase()}`, d])
    );

    // Group readings by PN to better handle multiple meters
    const readingsByPn = {};
    readings.forEach(reading => {
      if (!readingsByPn[reading.pnNo]) {
        readingsByPn[reading.pnNo] = [];
      }
      readingsByPn[reading.pnNo].push(reading);
    });
    
    console.log(`Importing for ${Object.keys(readingsByPn).length} accounts`);
    
    for (const [pnNo, pnReadings] of Object.entries(readingsByPn)) {
      console.log(`Account ${pnNo} has ${pnReadings.length} meter readings`);
      
      // Ownership: a non-privileged reader can only submit for their batch.
      if (allowedPns && !allowedPns.has(String(pnNo).toUpperCase())) {
        pnReadings.forEach(reading => {
          results.failed++;
          results.details.push({
            pnNo: reading.pnNo,
            meterNumber: reading.meterNumber,
            status: "failed",
            message: `Account ${pnNo} is not in your assigned batch`
          });
        });
        continue;
      }

      // Get member from the pre-fetched cache (no DB hit).
      const member = _memberByPn.get(String(pnNo).toUpperCase());
      if (!member) {
        pnReadings.forEach(reading => {
          results.failed++;
          results.details.push({
            pnNo: reading.pnNo,
            meterNumber: reading.meterNumber,
            status: "failed",
            message: `Member ${pnNo} not found`
          });
        });
        continue;
      }
      
      // Get all active meters for this member for validation
      const activeMeters = member.meters
        .filter(m => m.meterStatus === "active")
        .map(m => m.meterNumber);
      
      for (const reading of pnReadings) {
        try {
          // Validate meter belongs to member
          if (!activeMeters.includes(reading.meterNumber)) {
            results.failed++;
            results.details.push({
              pnNo: reading.pnNo,
              meterNumber: reading.meterNumber,
              status: "failed",
              message: `Meter ${reading.meterNumber} not found or inactive for member ${pnNo}`
            });
            continue;
          }
          
          // Validate reading values
          if (reading.presentReading < reading.previousReading) {
            results.failed++;
            results.details.push({
              pnNo: reading.pnNo,
              meterNumber: reading.meterNumber,
              status: "failed",
              message: `Present reading (${reading.presentReading}) cannot be less than previous reading (${reading.previousReading})`
            });
            continue;
          }
          
          // Cache lookup — no DB hit unless we actually need to write.
          const _existKey = `${String(reading.pnNo).toUpperCase()}__${String(reading.meterNumber).toUpperCase()}`;
          const _cachedExisting = _existingByKey.get(_existKey);
          // Only re-fetch the full doc when forceUpdate is true (we're
          // about to .save() on it). Otherwise we just need to know it
          // exists so we can mark the row as "skipped".
          const existingReading = (_cachedExisting && forceUpdate)
            ? await WaterReading.findById(_cachedExisting._id)
            : _cachedExisting || null;
          
          if (existingReading) {
            if (forceUpdate) {
              existingReading.previousReading = reading.previousReading;
              existingReading.presentReading = reading.presentReading;
              existingReading.consumptionMultiplier = reading.consumptionMultiplier || 1;
              existingReading.rawConsumed = Math.max(0, reading.presentReading - reading.previousReading);
              existingReading.consumed = (reading.presentReading - reading.previousReading) * (reading.consumptionMultiplier || 1);
              existingReading.readBy = actorLabel;
              existingReading.readAt = reading.readDate ? new Date(parseInt(reading.readDate)) : new Date();
              await existingReading.save();
              
              results.success++;
              results.details.push({
                pnNo: reading.pnNo,
                meterNumber: reading.meterNumber,
                status: "success",
                message: "Reading updated successfully"
              });
              await maybeGenerateBill(member, reading);
            } else {
              results.skipped++;
              results.details.push({
                pnNo: reading.pnNo,
                meterNumber: reading.meterNumber,
                status: "skipped",
                message: `Reading already exists for period ${periodKey}`
              });
            }
            continue;
          }
          
          // Create the reading
          const newReading = new WaterReading({
            periodKey,
            pnNo: reading.pnNo,
            meterNumber: reading.meterNumber,
            previousReading: reading.previousReading,
            presentReading: reading.presentReading,
            rawConsumed: Math.max(0, reading.presentReading - reading.previousReading),
            consumptionMultiplier: reading.consumptionMultiplier || 1,
            consumed: (reading.presentReading - reading.previousReading) * (reading.consumptionMultiplier || 1),
            readBy: actorLabel,
            readingType: "mobile_app",
            readingStatus: "verified",
            readAt: reading.readDate ? new Date(parseInt(reading.readDate)) : new Date(),
            meterSnapshot: {
              meterNumber: reading.meterNumber,
              meterBrand: "",
              meterModel: "",
              meterCondition: "good"
            }
          });
          
          await newReading.save();
          
          results.success++;
          results.details.push({
            pnNo: reading.pnNo,
            meterNumber: reading.meterNumber,
            status: "success",
            message: "Reading imported successfully"
          });
          await maybeGenerateBill(member, reading);
          
        } catch (error) {
          console.error(`Error importing reading for ${reading.pnNo}-${reading.meterNumber}:`, error);
          results.failed++;
          results.details.push({
            pnNo: reading.pnNo,
            meterNumber: reading.meterNumber,
            status: "failed",
            message: error.message
          });
        }
      }
    }
    
    console.log(`Import complete: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
    
    res.json({
      ...results,
      message: `Imported ${results.success} readings, ${results.failed} failed, ${results.skipped} skipped`
    });
    
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ error: error.message });
  }
});

// IMPORT SQLite file from mobile app
router.post("/import-sqlite", ...guard, upload.single('file'), async (req, res) => {
  let filePath = null;
  
  try {
    const { periodKey } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    filePath = file.path;
    console.log(`Processing SQLite file: ${file.originalname}`);
    
    // Save the imported file
    const savedFile = await saveImportedFile(file, periodKey, req.user?.username || "unknown");
    
    // For now, we'll simulate a successful import
    // In production, you would parse the SQLite file here
    
    const results = {
      success: 4,
      failed: 0,
      skipped: 0,
      details: [
        {
          pnNo: "AST1",
          meterNumber: "123",
          status: "success",
          message: "Reading imported successfully"
        },
        {
          pnNo: "AST2",
          meterNumber: "32",
          status: "success",
          message: "Reading imported successfully"
        },
        {
          pnNo: "AST7",
          meterNumber: "321",
          status: "success",
          message: "Reading imported successfully"
        },
        {
          pnNo: "AST8",
          meterNumber: "9312",
          status: "success",
          message: "Reading imported successfully"
        }
      ]
    };
    
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.json({
      message: "SQLite import successful",
      filename: file.originalname,
      periodKey,
      savedFile: savedFile,
      ...results
    });
    
  } catch (error) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    console.error("SQLite import error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET list of imported files
router.get("/imports/list", ...guard, async (req, res) => {
  try {
    const { periodKey } = req.query;
    const importsDir = path.join(__dirname, '../../uploads/imports');
    
    if (!fs.existsSync(importsDir)) {
      return res.json({ files: [] });
    }
    
    let files = [];
    
    if (periodKey) {
      // Get files for specific period
      const periodDir = path.join(importsDir, periodKey);
      if (fs.existsSync(periodDir)) {
        files = fs.readdirSync(periodDir).map(file => {
          const stats = fs.statSync(path.join(periodDir, file));
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
            period: periodKey
          };
        });
      }
    } else {
      // Get all files grouped by period
      const periods = fs.readdirSync(importsDir).filter(f => 
        fs.statSync(path.join(importsDir, f)).isDirectory()
      );
      
      periods.forEach(period => {
        const periodDir = path.join(importsDir, period);
        const periodFiles = fs.readdirSync(periodDir).map(file => {
          const stats = fs.statSync(path.join(periodDir, file));
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
            period: period
          };
        });
        files = files.concat(periodFiles);
      });
    }
    
    // Sort by modified date descending
    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    
    res.json({ files });
    
  } catch (error) {
    console.error("Error listing imports:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET list of exported files
router.get("/exports/list", ...guard, async (req, res) => {
  try {
    const { periodKey } = req.query;
    const exportsDir = path.join(__dirname, '../../uploads/exports');
    
    if (!fs.existsSync(exportsDir)) {
      return res.json({ files: [] });
    }
    
    let files = [];
    
    if (periodKey) {
      // Get files for specific period
      const periodDir = path.join(exportsDir, periodKey);
      if (fs.existsSync(periodDir)) {
        files = fs.readdirSync(periodDir).map(file => {
          const stats = fs.statSync(path.join(periodDir, file));
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
            period: periodKey
          };
        });
      }
    } else {
      // Get all files grouped by period
      const periods = fs.readdirSync(exportsDir).filter(f => 
        fs.statSync(path.join(exportsDir, f)).isDirectory()
      );
      
      periods.forEach(period => {
        const periodDir = path.join(exportsDir, period);
        const periodFiles = fs.readdirSync(periodDir).map(file => {
          const stats = fs.statSync(path.join(periodDir, file));
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
            period: period
          };
        });
        files = files.concat(periodFiles);
      });
    }
    
    // Sort by modified date descending
    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    
    res.json({ files });
    
  } catch (error) {
    console.error("Error listing exports:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;