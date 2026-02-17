import WaterSettings from "../models/WaterSettings.js";

/**
 * Calculate water bill with new tariff structure including minimum charges
 */
export async function calculateWaterBill(consumption, classification, member = null) {
  try {
    // Get settings with tariffs
    const settings = await WaterSettings.findOne();
    if (!settings) {
      throw new Error("Water settings not found");
    }
    
    // Find applicable tariff
    const tariffArray = classification === "residential" 
      ? (settings.tariffs?.residential || [])
      : (settings.tariffs?.commercial || []);
    
    const tariff = tariffArray.find(t => 
      t.isActive && 
      consumption >= t.minConsumption && 
      consumption <= t.maxConsumption
    );
    
    if (!tariff) {
      throw new Error(`No tariff found for ${classification} consumption of ${consumption}m³`);
    }
    
    // Calculate base amount based on classification
    let baseAmount = 0;
    let breakdown = {
      minimumCharge: 0,
      excessConsumption: 0,
      excessRate: tariff.ratePerCubic,
      excessAmount: 0
    };
    
    if (classification === "residential") {
      // Residential: ₱74 minimum for 0-5 m³, then per m³ rate
      if (consumption <= 5) {
        baseAmount = 74.00;
        breakdown.minimumCharge = 74.00;
        breakdown.excessConsumption = 0;
        breakdown.excessAmount = 0;
      } else {
        const excess = consumption - 5;
        const excessAmount = excess * tariff.ratePerCubic;
        baseAmount = 74.00 + excessAmount;
        breakdown.minimumCharge = 74.00;
        breakdown.excessConsumption = excess;
        breakdown.excessAmount = excessAmount;
      }
    } else if (classification === "commercial") {
      // Commercial: ₱442.50 minimum for 0-15 m³, then per m³ rate
      if (consumption <= 15) {
        baseAmount = 442.50;
        breakdown.minimumCharge = 442.50;
        breakdown.excessConsumption = 0;
        breakdown.excessAmount = 0;
      } else {
        const excess = consumption - 15;
        const excessAmount = excess * tariff.ratePerCubic;
        baseAmount = 442.50 + excessAmount;
        breakdown.minimumCharge = 442.50;
        breakdown.excessConsumption = excess;
        breakdown.excessAmount = excessAmount;
      }
    } else {
      // Other classifications (institutional, government) - no minimum charge
      baseAmount = consumption * tariff.ratePerCubic;
      breakdown.minimumCharge = 0;
      breakdown.excessConsumption = consumption;
      breakdown.excessAmount = baseAmount;
    }
    
    // Apply senior citizen discount if eligible
    let discountAmount = 0;
    let discountReason = "";
    let netAmount = baseAmount;
    
    if (member?.personal?.isSeniorCitizen) {
      const eligibleTiers = member.billing?.discountApplicableTiers || 
                          settings.seniorDiscount?.applicableTiers || 
                          ["31-40", "41+"];
      
      // Check if current tier is eligible for discount
      const isTierEligible = eligibleTiers.includes(tariff.tier);
      
      if (isTierEligible) {
        // Get discount rate
        let discountRate = member.personal?.seniorDiscountRate || 
                         settings.seniorDiscount?.discountRate || 5;
        
        discountAmount = baseAmount * (discountRate / 100);
        discountReason = `Senior Citizen Discount (${discountRate}%)`;
        netAmount = Math.max(0, baseAmount - discountAmount);
      }
    }
    
    // Apply PWD discount if applicable (and no senior discount)
    if (member?.billing?.hasPWD && discountAmount === 0) {
      const pwdDiscountRate = member.billing?.pwdDiscountRate || 0;
      if (pwdDiscountRate > 0) {
        discountAmount = baseAmount * (pwdDiscountRate / 100);
        discountReason = `PWD Discount (${pwdDiscountRate}%)`;
        netAmount = Math.max(0, baseAmount - discountAmount);
      }
    }
    
    return {
      amount: Number(netAmount.toFixed(2)),
      baseAmount: Number(baseAmount.toFixed(2)),
      discount: Number(discountAmount.toFixed(2)),
      discountReason: discountReason || (discountAmount > 0 ? "Applied Discount" : ""),
      tariffUsed: {
        tier: tariff.tier,
        ratePerCubic: tariff.ratePerCubic,
        minConsumption: tariff.minConsumption,
        maxConsumption: tariff.maxConsumption,
        description: tariff.description || "",
      },
      consumption,
      classification,
      breakdown
    };
  } catch (error) {
    console.error("Error calculating bill:", error);
    throw error;
  }
}

/**
 * Get examples for tariff display in UI
 */
export function getTariffExamples(classification) {
  const examples = [];
  
  if (classification === "residential") {
    examples.push(
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
    );
  } else if (classification === "commercial") {
    examples.push(
      { consumption: 15, amount: 442.50, description: "0-15 m³ = ₱442.50 (minimum charge)" },
      { consumption: 16, amount: 475.00, description: "16 m³ = ₱442.50 + (1 × ₱32.50) = ₱475.00" },
      { consumption: 20, amount: 605.00, description: "20 m³ = ₱442.50 + (5 × ₱32.50) = ₱605.00" },
      { consumption: 30, amount: 930.00, description: "30 m³ = ₱442.50 + (15 × ₱32.50) = ₱930.00" },
      { consumption: 31, amount: 965.40, description: "31 m³ = ₱442.50 + (16 × ₱35.40) = ₱965.40" },
      { consumption: 40, amount: 1284.00, description: "40 m³ = ₱442.50 + (25 × ₱35.40) = ₱1,284.00" },
      { consumption: 50, amount: 1638.00, description: "50 m³ = ₱442.50 + (35 × ₱35.40) = ₱1,638.00" },
      { consumption: 70, amount: 2346.00, description: "70 m³ = ₱442.50 + (55 × ₱35.40) = ₱2,346.00" },
      { consumption: 90, amount: 3054.00, description: "90 m³ = ₱442.50 + (75 × ₱35.40) = ₱3,054.00" }
    );
  }
  
  return examples;
}

/**
 * Validate consumption against tariff brackets
 */
export function validateConsumption(consumption, classification) {
  if (classification === "residential") {
    if (consumption < 0) return { valid: false, message: "Consumption cannot be negative" };
    if (consumption > 500) return { valid: false, message: "Maximum consumption for residential is 500 m³" };
  } else if (classification === "commercial") {
    if (consumption < 0) return { valid: false, message: "Consumption cannot be negative" };
    if (consumption > 500) return { valid: false, message: "Maximum consumption for commercial is 500 m³" };
  }
  
  return { valid: true, message: "OK" };
}