import express from "express";
import WaterSettings from "../../models/WaterSettings.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader"])];


// UPDATED DEFAULTS with all required fields
const DEFAULTS = {
  penaltyType: "flat",
  penaltyValue: 0,
  dueDayOfMonth: 15,
  graceDays: 0,
  readingStartDayOfMonth: 1,
  readingWindowDays: 7,
  
  // UPDATED: New tariff defaults with all required fields
  tariffs: {
    residential: [
      { 
        tier: "0-5", 
        minConsumption: 0, 
        maxConsumption: 5, 
        chargeType: "flat",
        ratePerCubic: 0, 
        flatAmount: 74.00,
        description: "Residential 0-5 m³ (Minimum ₱74.00)", 
        isActive: true 
      },
      { 
        tier: "6-10", 
        minConsumption: 6, 
        maxConsumption: 10, 
        chargeType: "per_cubic",
        ratePerCubic: 16.20, 
        flatAmount: 0,
        description: "Residential 6-10 m³", 
        isActive: true 
      },
      { 
        tier: "11-20", 
        minConsumption: 11, 
        maxConsumption: 20, 
        chargeType: "per_cubic",
        ratePerCubic: 17.70, 
        flatAmount: 0,
        description: "Residential 11-20 m³", 
        isActive: true 
      },
      { 
        tier: "21-30", 
        minConsumption: 21, 
        maxConsumption: 30, 
        chargeType: "per_cubic",
        ratePerCubic: 19.20, 
        flatAmount: 0,
        description: "Residential 21-30 m³", 
        isActive: true 
      },
      { 
        tier: "31-40", 
        minConsumption: 31, 
        maxConsumption: 40, 
        chargeType: "per_cubic",
        ratePerCubic: 20.70, 
        flatAmount: 0,
        description: "Residential 31-40 m³", 
        isActive: true 
      },
      { 
        tier: "41+", 
        minConsumption: 41, 
        maxConsumption: 500, 
        chargeType: "per_cubic",
        ratePerCubic: 22.20, 
        flatAmount: 0,
        description: "Residential 41-500 m³", 
        isActive: true 
      }
    ],
    commercial: [
      { 
        tier: "0-15", 
        minConsumption: 0, 
        maxConsumption: 15, 
        chargeType: "flat",
        ratePerCubic: 0, 
        flatAmount: 442.50,
        description: "Commercial 0-15 m³ (Minimum ₱442.50)", 
        isActive: true 
      },
      { 
        tier: "16-30", 
        minConsumption: 16, 
        maxConsumption: 30, 
        chargeType: "per_cubic",
        ratePerCubic: 32.50, 
        flatAmount: 0,
        description: "Commercial 16-30 m³", 
        isActive: true 
      },
      { 
        tier: "31-500", 
        minConsumption: 31, 
        maxConsumption: 500, 
        chargeType: "per_cubic",
        ratePerCubic: 35.40, 
        flatAmount: 0,
        description: "Commercial 31-500 m³", 
        isActive: true 
      }
    ]
  },
  
  // Senior discount defaults
  seniorDiscount: {
    discountRate: 5,
    applicableTiers: ["31-40", "41+"]
  }
};

// GET all settings
router.get("/", ...guard, async (req, res) => {
  try {
    let settings = await WaterSettings.findOne();
    if (!settings) {
      settings = await WaterSettings.create(DEFAULTS);
    }
    res.json(settings);
  } catch (error) {
    console.error("GET settings error:", error);
    res.status(500).json({ message: "Failed to fetch settings", error: error.message });
  }
});

// UPDATE settings
router.put("/", ...guard, async (req, res) => {
  try {
    const {
      penaltyType,
      penaltyValue,
      dueDayOfMonth,
      graceDays,
      readingStartDayOfMonth,
      readingWindowDays,
      tariffs,
      seniorDiscount
    } = req.body || {};

    console.log("Received update payload:", { tariffs, seniorDiscount });

    let settings = await WaterSettings.findOne();
    if (!settings) {
      settings = await WaterSettings.create(DEFAULTS);
    }

    // Update basic settings
    if (penaltyType !== undefined) settings.penaltyType = penaltyType;
    if (penaltyValue !== undefined) settings.penaltyValue = Number(penaltyValue);
    
    if (dueDayOfMonth !== undefined) 
      settings.dueDayOfMonth = Math.min(31, Math.max(1, Number(dueDayOfMonth)));
    
    if (graceDays !== undefined) 
      settings.graceDays = Math.min(60, Math.max(0, Number(graceDays)));
    
    if (readingStartDayOfMonth !== undefined)
      settings.readingStartDayOfMonth = Math.min(31, Math.max(1, Number(readingStartDayOfMonth)));
    
    if (readingWindowDays !== undefined)
      settings.readingWindowDays = Math.min(31, Math.max(1, Number(readingWindowDays)));

    // Update tariffs if provided
    if (tariffs) {
      // Validate and clean tariff data with all required fields
      const cleanTariffs = {
        residential: Array.isArray(tariffs.residential) ? tariffs.residential.map(t => ({
          tier: String(t.tier || '').trim(),
          minConsumption: Number(t.minConsumption) || 0,
          maxConsumption: Number(t.maxConsumption) || 0,
          chargeType: t.chargeType || "per_cubic",
          ratePerCubic: Number(t.ratePerCubic) || 0,
          flatAmount: Number(t.flatAmount) || 0,
          description: String(t.description || '').trim(),
          isActive: Boolean(t.isActive)
        })) : settings.tariffs.residential,
        
        commercial: Array.isArray(tariffs.commercial) ? tariffs.commercial.map(t => ({
          tier: String(t.tier || '').trim(),
          minConsumption: Number(t.minConsumption) || 0,
          maxConsumption: Number(t.maxConsumption) || 0,
          chargeType: t.chargeType || "per_cubic",
          ratePerCubic: Number(t.ratePerCubic) || 0,
          flatAmount: Number(t.flatAmount) || 0,
          description: String(t.description || '').trim(),
          isActive: Boolean(t.isActive)
        })) : settings.tariffs.commercial
      };
      
      settings.tariffs = cleanTariffs;
    }

    // Update senior discount if provided
    if (seniorDiscount) {
      settings.seniorDiscount = {
        discountRate: typeof seniorDiscount.discountRate === 'number' 
          ? seniorDiscount.discountRate 
          : settings.seniorDiscount.discountRate,
        applicableTiers: Array.isArray(seniorDiscount.applicableTiers) 
          ? seniorDiscount.applicableTiers.map(t => String(t).trim()).filter(t => t)
          : settings.seniorDiscount.applicableTiers
      };
    }

    await settings.save();
    console.log("Settings saved successfully:", settings._id);
    res.json(settings);
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({ 
      message: "Failed to update settings", 
      error: error.message,
      details: error.errors || {}
    });
  }
});

// RESET to defaults
router.post("/reset", ...guard, async (req, res) => {
  try {
    await WaterSettings.deleteMany({});
    const settings = await WaterSettings.create(DEFAULTS);
    res.json(settings);
  } catch (error) {
    console.error("Reset error:", error);
    res.status(500).json({ message: "Failed to reset settings", error: error.message });
  }
});

// GET tariff for specific consumption
router.get("/tariff/:classification/:consumption", ...guard, async (req, res) => {
  try {
    const { classification, consumption } = req.params;
    const consumptionNum = parseFloat(consumption);
    
    if (isNaN(consumptionNum) || consumptionNum < 0) {
      return res.status(400).json({ message: "Invalid consumption value" });
    }
    
    const settings = await WaterSettings.findOne();
    if (!settings) {
      return res.status(404).json({ message: "Settings not found" });
    }
    
    const tariffArray = classification === "residential" 
      ? settings.tariffs.residential 
      : settings.tariffs.commercial;
    
    const tariff = tariffArray.find(t => 
      t.isActive && 
      consumptionNum >= t.minConsumption && 
      consumptionNum <= t.maxConsumption
    );
    
    if (!tariff) {
      return res.status(404).json({ 
        message: `No tariff found for ${classification} consumption ${consumption}m³` 
      });
    }
    
    res.json(tariff);
  } catch (error) {
    console.error("Get tariff error:", error);
    res.status(500).json({ message: "Failed to fetch tariff", error: error.message });
  }
});

// Calculate bill amount example (for UI preview)
router.post("/calculate-example", ...guard, async (req, res) => {
  try {
    const { classification, consumption } = req.body;
    const consumptionNum = parseFloat(consumption);
    
    if (isNaN(consumptionNum) || consumptionNum < 0) {
      return res.status(400).json({ message: "Invalid consumption value" });
    }
    
    const settings = await WaterSettings.findOne();
    if (!settings) {
      return res.status(404).json({ message: "Water settings not found" });
    }
    
    const tariffArray = classification === "residential" 
      ? settings.tariffs.residential 
      : settings.tariffs.commercial;
    
    const tariff = tariffArray.find(t => 
      t.isActive && 
      consumptionNum >= t.minConsumption && 
      consumptionNum <= t.maxConsumption
    );
    
    if (!tariff) {
      return res.status(404).json({ 
        message: `No tariff found for ${classification} consumption ${consumption}m³` 
      });
    }
    
    // Calculate amount based on chargeType
    let amount = 0;
    if (tariff.chargeType === "flat") {
      amount = tariff.flatAmount;
    } else {
      // per_cubic calculation
      if (classification === "residential") {
        if (consumptionNum <= 5) {
          amount = 74.00;
        } else {
          amount = 74.00 + (Math.max(0, consumptionNum - 5) * tariff.ratePerCubic);
        }
      } else if (classification === "commercial") {
        if (consumptionNum <= 15) {
          amount = 442.50;
        } else {
          amount = 442.50 + (Math.max(0, consumptionNum - 15) * tariff.ratePerCubic);
        }
      }
    }
    
    res.json({
      classification,
      consumption: consumptionNum,
      tariff,
      calculatedAmount: amount.toFixed(2),
      breakdown: {
        chargeType: tariff.chargeType,
        flatAmount: tariff.flatAmount,
        excessConsumption: Math.max(0, consumptionNum - (classification === "residential" ? 5 : 15)),
        excessRate: tariff.ratePerCubic,
        excessAmount: Math.max(0, consumptionNum - (classification === "residential" ? 5 : 15)) * tariff.ratePerCubic
      }
    });
  } catch (error) {
    console.error("Calculate example error:", error);
    res.status(500).json({ message: "Failed to calculate example", error: error.message });
  }
});

// Get tariff examples
router.get("/tariff-examples/:classification", ...guard, async (req, res) => {
  try {
    const { classification } = req.params;
    
    if (!["residential", "commercial"].includes(classification)) {
      return res.status(400).json({ message: "Invalid classification" });
    }
    
    // Define the getTariffExamples function
    const getTariffExamples = (classification) => {
      if (classification === "residential") {
        return [
          { consumption: 5, amount: 74.00, description: "0-5 m³ = ₱74.00 (minimum charge)" },
          { consumption: 6, amount: 90.20, description: "6 m³ = ₱74.00 + (1 × ₱16.20) = ₱90.20" },
          { consumption: 10, amount: 155.00, description: "10 m³ = ₱74.00 + (5 × ₱16.20) = ₱155.00" },
          { consumption: 11, amount: 172.70, description: "11 m³ = ₱74.00 + (6 × ₱17.70) = ₱172.70" },
          { consumption: 20, amount: 332.00, description: "20 m³ = ₱74.00 + (15 × ₱17.70) = ₱332.00" },
          { consumption: 21, amount: 351.20, description: "21 m³ = ₱74.00 + (16 × ₱19.20) = ₱351.20" },
          { consumption: 30, amount: 524.00, description: "30 m³ = ₱74.00 + (25 × ₱19.20) = ₱524.00" },
          { consumption: 31, amount: 544.70, description: "31 m³ = ₱74.00 + (26 × ₱20.70) = ₱544.70" },
          { consumption: 40, amount: 731.00, description: "40 m³ = ₱74.00 + (35 × ₱20.70) = ₱731.00" },
          { consumption: 41, amount: 753.20, description: "41 m³ = ₱74.00 + (36 × ₱22.20) = ₱753.20" },
          { consumption: 50, amount: 953.00, description: "50 m³ = ₱74.00 + (45 × ₱22.20) = ₱953.00" },
          { consumption: 60, amount: 1175.00, description: "60 m³ = ₱74.00 + (55 × ₱22.20) = ₱1,175.00" },
          { consumption: 70, amount: 1397.00, description: "70 m³ = ₱74.00 + (65 × ₱22.20) = ₱1,397.00" },
          { consumption: 80, amount: 1619.00, description: "80 m³ = ₱74.00 + (75 × ₱22.20) = ₱1,619.00" }
        ];
      } else if (classification === "commercial") {
        return [
          { consumption: 15, amount: 442.50, description: "0-15 m³ = ₱442.50 (minimum charge)" },
          { consumption: 16, amount: 475.00, description: "16 m³ = ₱442.50 + (1 × ₱32.50) = ₱475.00" },
          { consumption: 20, amount: 605.00, description: "20 m³ = ₱442.50 + (5 × ₱32.50) = ₱605.00" },
          { consumption: 30, amount: 930.00, description: "30 m³ = ₱442.50 + (15 × ₱32.50) = ₱930.00" },
          { consumption: 31, amount: 965.40, description: "31 m³ = ₱442.50 + (16 × ₱35.40) = ₱965.40" },
          { consumption: 40, amount: 1284.00, description: "40 m³ = ₱442.50 + (25 × ₱35.40) = ₱1,284.00" },
          { consumption: 50, amount: 1638.00, description: "50 m³ = ₱442.50 + (35 × ₱35.40) = ₱1,638.00" },
          { consumption: 70, amount: 2346.00, description: "70 m³ = ₱442.50 + (55 × ₱35.40) = ₱2,346.00" },
          { consumption: 90, amount: 3054.00, description: "90 m³ = ₱442.50 + (75 × ₱35.40) = ₱3,054.00" }
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
      message: "Failed to get tariff examples",
      error: process.env.NODE_ENV === "development" ? error.message : undefined 
    });
  }
});

export default router;