import express from "express";
import WaterTariff from "../../models/WaterTariff.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];

// Default residential tariffs (based on your document)
const DEFAULT_RESIDENTIAL = [
  { tier: "0-5", min: 0, max: 5, rate: 0, description: "Residential 0-5 m³ (Free)" },
  { tier: "6-10", min: 6, max: 10, rate: 16.20, description: "Residential 6-10 m³" },
  { tier: "11-20", min: 11, max: 20, rate: 17.70, description: "Residential 11-20 m³" },
  { tier: "21-30", min: 21, max: 30, rate: 19.20, description: "Residential 21-30 m³" },
  { tier: "31-40", min: 31, max: 40, rate: 20.70, description: "Residential 31-40 m³" },
  { tier: "41-70", min: 41, max: 70, rate: 22.20, description: "Residential 41-70 m³" },
  { tier: "71-500", min: 71, max: 500, rate: 22.20, description: "Residential 71-500 m³" },
];

// Default commercial tariffs
const DEFAULT_COMMERCIAL = [
  { tier: "0-15", min: 0, max: 15, rate: 0, description: "Commercial 0-15 m³ (Free)" },
  { tier: "16-30", min: 16, max: 30, rate: 32.50, description: "Commercial 16-30 m³" },
  { tier: "31-500", min: 31, max: 500, rate: 35.40, description: "Commercial 31-500 m³" },
];

// GET all tariffs
router.get("/", ...guard, async (req, res) => {
  try {
    const tariffs = await WaterTariff.find({ isActive: true }).sort({
      classification: 1,
      minConsumption: 1,
    });
    
    if (tariffs.length === 0) {
      // Create default tariffs if none exist
      await createDefaultTariffs();
      const newTariffs = await WaterTariff.find({ isActive: true }).sort({
        classification: 1,
        minConsumption: 1,
      });
      return res.json(newTariffs);
    }
    
    res.json(tariffs);
  } catch (error) {
    console.error("Error fetching tariffs:", error);
    res.status(500).json({ message: "Failed to fetch tariffs" });
  }
});

// GET tariff by classification
router.get("/:classification", ...guard, async (req, res) => {
  try {
    const { classification } = req.params;
    const tariffs = await WaterTariff.find({ 
      classification,
      isActive: true 
    }).sort({ minConsumption: 1 });
    
    res.json(tariffs);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tariffs" });
  }
});

// GET tariff for specific consumption
router.get("/rate/:classification/:consumption", ...guard, async (req, res) => {
  try {
    const { classification, consumption } = req.params;
    const consumptionNum = parseFloat(consumption);
    
    if (isNaN(consumptionNum) || consumptionNum < 0) {
      return res.status(400).json({ message: "Invalid consumption value" });
    }
    
    const tariff = await WaterTariff.findOne({
      classification,
      minConsumption: { $lte: consumptionNum },
      maxConsumption: { $gte: consumptionNum },
      isActive: true,
    });
    
    if (!tariff) {
      return res.status(404).json({ 
        message: `No tariff found for ${classification} consumption ${consumption}m³` 
      });
    }
    
    res.json(tariff);
  } catch (error) {
    console.error("Error fetching tariff rate:", error);
    res.status(500).json({ message: "Failed to fetch tariff rate" });
  }
});

// UPDATE tariffs (bulk update)
router.put("/", ...guard, async (req, res) => {
  try {
    const { tariffs } = req.body;
    
    if (!Array.isArray(tariffs)) {
      return res.status(400).json({ message: "Tariffs array is required" });
    }
    
    // Validate all tariffs before updating
    for (const tariff of tariffs) {
      if (!tariff.classification || !tariff.tier || tariff.ratePerCubic === undefined) {
        return res.status(400).json({ message: "Missing required tariff fields" });
      }
      if (tariff.minConsumption > tariff.maxConsumption) {
        return res.status(400).json({ message: `minConsumption cannot be greater than maxConsumption for tier ${tariff.tier}` });
      }
    }
    
    const operations = tariffs.map((tariff) => ({
      updateOne: {
        filter: { 
          classification: tariff.classification,
          tier: tariff.tier 
        },
        update: {
          $set: {
            minConsumption: tariff.minConsumption,
            maxConsumption: tariff.maxConsumption,
            ratePerCubic: tariff.ratePerCubic,
            description: tariff.description || "",
            isActive: tariff.isActive !== false,
            updatedBy: req.user?.employeeId || req.user?.username || "system",
          },
        },
        upsert: true,
      },
    }));
    
    await WaterTariff.bulkWrite(operations);
    
    const updated = await WaterTariff.find({ isActive: true }).sort({
      classification: 1,
      minConsumption: 1,
    });
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating tariffs:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Duplicate tariff tier detected" });
    }
    res.status(500).json({ message: "Failed to update tariffs" });
  }
});

// CREATE single tariff
router.post("/", ...guard, async (req, res) => {
  try {
    const { classification, tier, minConsumption, maxConsumption, ratePerCubic, description } = req.body;
    
    if (!classification || !tier || minConsumption === undefined || maxConsumption === undefined || ratePerCubic === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    if (minConsumption > maxConsumption) {
      return res.status(400).json({ message: "minConsumption cannot be greater than maxConsumption" });
    }
    
    // Check for overlapping ranges
    const overlapping = await WaterTariff.findOne({
      classification,
      isActive: true,
      $or: [
        { minConsumption: { $lte: maxConsumption }, maxConsumption: { $gte: minConsumption } }
      ]
    });
    
    if (overlapping) {
      return res.status(400).json({ 
        message: `Tariff range overlaps with existing tier: ${overlapping.tier}` 
      });
    }
    
    const tariff = await WaterTariff.create({
      classification,
      tier,
      minConsumption,
      maxConsumption,
      ratePerCubic,
      description: description || "",
      isActive: true,
      createdBy: req.user?.employeeId || req.user?.username || "system",
    });
    
    res.status(201).json(tariff);
  } catch (error) {
    console.error("Error creating tariff:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Tariff with this tier already exists" });
    }
    res.status(500).json({ message: "Failed to create tariff" });
  }
});

// UPDATE single tariff
router.put("/:id", ...guard, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const tariff = await WaterTariff.findById(id);
    if (!tariff) {
      return res.status(404).json({ message: "Tariff not found" });
    }
    
    // Check for overlapping ranges (excluding self)
    if (updates.minConsumption !== undefined || updates.maxConsumption !== undefined) {
      const min = updates.minConsumption !== undefined ? updates.minConsumption : tariff.minConsumption;
      const max = updates.maxConsumption !== undefined ? updates.maxConsumption : tariff.maxConsumption;
      
      if (min > max) {
        return res.status(400).json({ message: "minConsumption cannot be greater than maxConsumption" });
      }
      
      const overlapping = await WaterTariff.findOne({
        _id: { $ne: id },
        classification: tariff.classification,
        isActive: true,
        $or: [
          { minConsumption: { $lte: max }, maxConsumption: { $gte: min } }
        ]
      });
      
      if (overlapping) {
        return res.status(400).json({ 
          message: `Tariff range overlaps with existing tier: ${overlapping.tier}` 
        });
      }
    }
    
    Object.assign(tariff, updates);
    tariff.updatedBy = req.user?.employeeId || req.user?.username || "system";
    await tariff.save();
    
    res.json(tariff);
  } catch (error) {
    console.error("Error updating tariff:", error);
    res.status(500).json({ message: "Failed to update tariff" });
  }
});

// DELETE tariff (soft delete)
router.delete("/:id", ...guard, async (req, res) => {
  try {
    const { id } = req.params;
    
    const tariff = await WaterTariff.findById(id);
    if (!tariff) {
      return res.status(404).json({ message: "Tariff not found" });
    }
    
    tariff.isActive = false;
    tariff.updatedBy = req.user?.employeeId || req.user?.username || "system";
    await tariff.save();
    
    res.json({ message: "Tariff deactivated successfully" });
  } catch (error) {
    console.error("Error deleting tariff:", error);
    res.status(500).json({ message: "Failed to delete tariff" });
  }
});

// RESET to defaults
router.post("/reset", ...guard, async (req, res) => {
  try {
    await WaterTariff.deleteMany({});
    await createDefaultTariffs();
    
    const tariffs = await WaterTariff.find({ isActive: true }).sort({
      classification: 1,
      minConsumption: 1,
    });
    
    res.json({
      message: "Tariffs reset to defaults",
      tariffs,
    });
  } catch (error) {
    console.error("Error resetting tariffs:", error);
    res.status(500).json({ message: "Failed to reset tariffs" });
  }
});

async function createDefaultTariffs() {
  const allDefaults = [];
  
  DEFAULT_RESIDENTIAL.forEach((item) => {
    allDefaults.push({
      classification: "residential",
      tier: item.tier,
      minConsumption: item.min,
      maxConsumption: item.max,
      ratePerCubic: item.rate,
      description: item.description,
      isActive: true,
      createdBy: "system",
    });
  });
  
  DEFAULT_COMMERCIAL.forEach((item) => {
    allDefaults.push({
      classification: "commercial",
      tier: item.tier,
      minConsumption: item.min,
      maxConsumption: item.max,
      ratePerCubic: item.rate,
      description: item.description,
      isActive: true,
      createdBy: "system",
    });
  });
  
  await WaterTariff.insertMany(allDefaults);
}

export default router;