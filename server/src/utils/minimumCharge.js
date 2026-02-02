/**
 * Calculate minimum charges and excess amounts
 */
export function calculateMinimumCharge(consumption, classification) {
  if (classification === "residential") {
    if (consumption <= 5) {
      return {
        minimumCharge: 74.00,
        excessConsumption: 0,
        excessRate: 0,
        excessAmount: 0,
        total: 74.00
      };
    } else {
      const excess = consumption - 5;
      // Need to determine which rate to use based on consumption
      return {
        minimumCharge: 74.00,
        excessConsumption: excess,
        excessRate: null, // Will be determined by tariff
        excessAmount: null,
        total: null
      };
    }
  } else if (classification === "commercial") {
    if (consumption <= 15) {
      return {
        minimumCharge: 442.50,
        excessConsumption: 0,
        excessRate: 0,
        excessAmount: 0,
        total: 442.50
      };
    } else {
      const excess = consumption - 15;
      return {
        minimumCharge: 442.50,
        excessConsumption: excess,
        excessRate: null, // Will be determined by tariff
        excessAmount: null,
        total: null
      };
    }
  }
  
  return null;
}