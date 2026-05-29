import { describe, it, expect } from "vitest";
import { calculateWaterBillLocal } from "./waterBillingLocal.js";

// Minimal settings mirroring the cooperative's tariff structure.
const settings = {
  tariffs: {
    residential: [
      { tier: "0-10", minConsumption: 0, maxConsumption: 10, ratePerCubic: 16.2, isActive: true },
      { tier: "11-20", minConsumption: 11, maxConsumption: 20, ratePerCubic: 17.7, isActive: true },
      { tier: "31-40", minConsumption: 31, maxConsumption: 40, ratePerCubic: 20.7, isActive: true },
    ],
    commercial: [
      { tier: "0-15", minConsumption: 0, maxConsumption: 15, ratePerCubic: 0, isActive: true },
      { tier: "16-30", minConsumption: 16, maxConsumption: 30, ratePerCubic: 32.5, isActive: true },
    ],
  },
  seniorDiscount: { applicableTiers: ["31-40", "41+"], discountRate: 5 },
};

const plain = { personal: {}, billing: {}, meters: [] };

describe("calculateWaterBillLocal (residential)", () => {
  it("charges the ₱74 minimum for 0–5 m³", () => {
    const r = calculateWaterBillLocal(5, "residential", plain, null, settings);
    expect(r.baseAmount).toBe(74);
    expect(r.amount).toBe(74);
    expect(r.tariffUsed.tier).toBe("0-10");
  });

  it("adds excess over 5 m³ at the tier rate (6 m³ = ₱90.20)", () => {
    const r = calculateWaterBillLocal(6, "residential", plain, null, settings);
    expect(r.baseAmount).toBe(90.2);
  });

  it("10 m³ = ₱155.00", () => {
    const r = calculateWaterBillLocal(10, "residential", plain, null, settings);
    expect(r.baseAmount).toBe(155);
  });

  it("returns null when no active tier matches the consumption", () => {
    const r = calculateWaterBillLocal(25, "residential", plain, null, settings); // 21-30 gap
    expect(r).toBeNull();
  });
});

describe("calculateWaterBillLocal (commercial)", () => {
  it("charges the ₱442.50 minimum for 0–15 m³", () => {
    const r = calculateWaterBillLocal(15, "commercial", plain, null, settings);
    expect(r.baseAmount).toBe(442.5);
  });

  it("20 m³ = ₱605.00", () => {
    const r = calculateWaterBillLocal(20, "commercial", plain, null, settings);
    expect(r.baseAmount).toBe(605);
  });
});

describe("discounts", () => {
  it("applies a 5% senior discount on an eligible tier", () => {
    const senior = { personal: { isSeniorCitizen: true }, billing: { discountApplicableTiers: ["31-40", "41+"] }, meters: [] };
    const r = calculateWaterBillLocal(35, "residential", senior, null, settings);
    // base = 74 + (35-5)*20.70 = 695; 5% off = 34.75; net = 660.25
    expect(r.baseAmount).toBe(695);
    expect(r.discount).toBe(34.75);
    expect(r.amount).toBe(660.25);
  });

  it("does not discount an ineligible tier", () => {
    const senior = { personal: { isSeniorCitizen: true }, billing: { discountApplicableTiers: ["31-40"] }, meters: [] };
    const r = calculateWaterBillLocal(10, "residential", senior, null, settings); // tier 0-10 not eligible
    expect(r.discount).toBe(0);
    expect(r.amount).toBe(r.baseAmount);
  });

  it("multi-meter: senior discount applies only to the designated meter", () => {
    const member = {
      personal: { isSeniorCitizen: true },
      billing: { discountApplicableTiers: ["31-40", "41+"] },
      meters: [
        { meterNumber: "M1", meterStatus: "active", isBillingActive: true, isDiscountMeter: true },
        { meterNumber: "M2", meterStatus: "active", isBillingActive: true },
      ],
    };
    const onDiscountMeter = calculateWaterBillLocal(35, "residential", member, "M1", settings);
    const onOtherMeter = calculateWaterBillLocal(35, "residential", member, "M2", settings);
    expect(onDiscountMeter.discount).toBe(34.75);
    expect(onOtherMeter.discount).toBe(0);
  });
});
