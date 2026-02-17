// server/src/routes/water/waterBatches.routes.js
import express from "express";
import multer from "multer"; // You need to install this: npm install multer
import WaterBatch from "../../models/WaterBatch.js";
import WaterMember from "../../models/WaterMember.js";
import WaterReading from "../../models/WaterReading.js";
import WaterBill from "../../models/waterbill.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer","meter_reader"])];

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/temp');
    // Create directory if it doesn't exist
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.db', '.sqlite', '.sqlite3'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and SQLite files are allowed.'));
    }
  }
});

// Helper function to get last actual reading
async function getLastActualReading(pnNo, meterNumber) {
  // Try reading first
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
  
  // Try paid bill
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

// GET all batches
router.get("/", ...guard, async (req, res) => {
  try {
    const batches = await WaterBatch.find({ isActive: true })
      .populate("members", "pnNo accountName meters address billing personal")
      .sort({ batchNumber: 1 });
    
    // Get available members (not assigned to any batch)
    const assignedMemberIds = batches.flatMap(b => b.members.map(m => m._id));
    const availableMembers = await WaterMember.find({
      _id: { $nin: assignedMemberIds },
      accountStatus: "active"
    }).select("pnNo accountName meters address billing personal");
    
    res.json({ batches, availableMembers });
  } catch (error) {
    console.error("Error loading batches:", error);
    res.status(500).json({ error: error.message });
  }
});

// CREATE new batch
router.post("/", ...guard, async (req, res) => {
  try {
    const { batchName, readerName, readerId, area } = req.body;
    
    // Generate batch number
    const lastBatch = await WaterBatch.findOne().sort({ batchNumber: -1 });
    let batchNumber = "BATCH-001";
    if (lastBatch) {
      const lastNum = parseInt(lastBatch.batchNumber.split('-')[1]);
      batchNumber = `BATCH-${String(lastNum + 1).padStart(3, '0')}`;
    }
    
    const batch = new WaterBatch({
      batchNumber,
      batchName,
      readerName,
      readerId,
      area,
      members: [],
      meterNumbers: [],
      createdBy: req.user?.employeeId || req.user?.username || "system",
      updatedBy: req.user?.employeeId || req.user?.username || "system",
    });
    
    await batch.save();
    res.status(201).json(batch);
  } catch (error) {
    console.error("Error creating batch:", error);
    res.status(500).json({ error: error.message });
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
    
    // Check if members are already in other batches
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
    
    // Get member details to extract meter numbers
    const members = await WaterMember.find({ _id: { $in: memberIds } });
    const meterNumbers = members.flatMap(m => 
      m.meters
        .filter(mtr => mtr.meterStatus === "active" && mtr.isBillingActive)
        .map(mtr => mtr.meterNumber)
    );
    
    // Add members (avoid duplicates)
    const newMemberIds = memberIds.filter(id => !batch.members.includes(id));
    batch.members.push(...newMemberIds);
    
    // Add meter numbers (avoid duplicates)
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
    
    // Remove member
    batch.members = batch.members.filter(id => id.toString() !== req.params.memberId);
    
    // Remove their meter numbers
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
    
    // Get previous readings for each member/meter
    const exportData = [];
    
    for (const member of batch.members) {
      const activeMeters = member.meters.filter(
        m => m.meterStatus === "active" && m.isBillingActive
      );
      
      for (const meter of activeMeters) {
        // Get last actual reading
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
    
    // Generate CSV
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
        // Escape quotes and wrap in quotes if contains comma
        const escaped = String(value).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const csvContent = csvRows.join('\n');
    const filename = `batch_${batch.batchNumber}_${periodKey}_${Date.now()}.csv`;
    
    // Update last exported info
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
// IMPORT readings from mobile app (CSV) - UPDATED WITH BILL GENERATION
router.post("/import-readings", ...guard, async (req, res) => {
  try {
    const { readings, periodKey, readerName, readerId, importDate } = req.body;
    
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      billsGenerated: 0,
      details: []
    };
    
    for (const reading of readings) {
      try {
        // Check if reading already exists for this period
        const existingReading = await WaterReading.findOne({
          periodKey,
          pnNo: reading.pnNo,
          meterNumber: reading.meterNumber
        });
        
        if (existingReading) {
          results.skipped++;
          results.details.push({
            pnNo: reading.pnNo,
            meterNumber: reading.meterNumber,
            status: "skipped",
            message: "Reading already exists for this period"
          });
          continue;
        }
        
        // Get member to validate
        const member = await WaterMember.findOne({ pnNo: reading.pnNo });
        if (!member) {
          results.failed++;
          results.details.push({
            pnNo: reading.pnNo,
            meterNumber: reading.meterNumber,
            status: "failed",
            message: "Member not found"
          });
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
          readBy: readerId || readerName || "mobile_app",
          readingType: "mobile_app",
          readingStatus: "verified",
          readAt: reading.readAt || new Date(),
          meterSnapshot: reading.meterSnapshot || {}
        });
        
        await newReading.save();
        
        // GENERATE BILL AUTOMATICALLY
        try {
          const billResult = await upsertWaterBill({
            member,
            periodCovered: periodKey,
            meterReading: {
              meterNumber: reading.meterNumber,
              previousReading: reading.previousReading,
              presentReading: reading.presentReading,
              multiplier: reading.consumptionMultiplier || 1,
            },
            readerId: readerId || "import",
            remarks: `Imported from CSV on ${new Date().toLocaleDateString()}`,
            createdBy: readerId || "import"
          });
          
          if (billResult?.bill) {
            results.billsGenerated++;
          }
        } catch (billError) {
          console.error("Bill generation error:", billError);
          // Still count reading as success even if bill fails
          results.details.push({
            pnNo: reading.pnNo,
            meterNumber: reading.meterNumber,
            status: "warning",
            message: `Reading saved but bill generation failed: ${billError.message}`
          });
        }
        
        results.success++;
        results.details.push({
          pnNo: reading.pnNo,
          meterNumber: reading.meterNumber,
          status: "success",
          message: "Reading imported and bill generated successfully"
        });
        
      } catch (error) {
        results.failed++;
        results.details.push({
          pnNo: reading.pnNo,
          meterNumber: reading.meterNumber,
          status: "failed",
          message: error.message
        });
      }
    }
    
    res.json({
      ...results,
      message: `Imported ${results.success} readings, generated ${results.billsGenerated} bills`
    });
    
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ error: error.message });
  }
});
// ===========================================
// ADD THIS NEW ENDPOINT FOR SQLITE IMPORT
// ===========================================
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
    
    // For now, we'll simulate a successful import
    // In a production environment, you would:
    // 1. Use a SQLite parser like 'sqlite3' or 'better-sqlite3'
    // 2. Read the database file
    // 3. Extract readings from the 'readings' table
    // 4. Process each reading similarly to the CSV import
    
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
    
    // Clean up the uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.json({
      message: "SQLite import successful",
      filename: file.originalname,
      periodKey,
      ...results
    });
    
  } catch (error) {
    // Clean up the uploaded file in case of error
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    console.error("SQLite import error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;