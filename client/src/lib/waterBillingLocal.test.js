import { describe, it, expect } from "vitest";
import { calculateWaterBillLocal } from "./waterBillingLocal.js";

// Fixture mirrors the cooperative's REAL Water Settings tariff (the
// DEFAULTS in server/src/routes/water/waterSettings.routes.js): the first
// bracket is a FLAT minimum charge, the rest are per-cubic excess steps.
// The offline thermal bill must compute exactly from this configured
// tariff — there are no hardcoded amounts in calculateWaterBillLocal.
const settings = {
  tariffs: {
    residential: [
      { tier: "0-5", minConsumption: 0, maxConsumption: 5, chargeType: "flat", flatAmount: 74.0, ratePerCubic: 0, isActive: true },
      { tier: "6-10", minConsumption: 6, maxConsumption: 10, chargeType: "per_cubic", ratePerCubic: 16.2, isActive: true },
      { tier: "11-20", minConsumption: 11, maxConsumption: 20, chargeType: "per_cubic", ratePerCubic: 17.7, isActive: true },
      { tier: "21-30", minConsumption: 21, maxConsumption: 30, chargeType: "per_cubic", ratePerCubic: 19.2, isActive: true },
      { tier: "31-40", minConsumption: 31, maxConsumption: 40, chargeType: "per_cubic", ratePerCubic: 20.7, isActive: true },
      { tier: "41+", minConsumption: 41, maxConsumption: 500, chargeType: "per_cubic", ratePerCubic: 22.2, isActive: true },
    ],
    commercial: [
      { tier: "0-15", minConsumption: 0, maxConsumption: 15, chargeType: "flat", flatAmount: 442.5, ratePerCubic: 0, isActive: true },
      { tier: "16-30", minConsumption: 16, maxConsumption: 30, chargeType: "per_cubic", ratePerCubic: 32.5, isActive: true },
      { tier: "31-500", minConsumption: 31, maxConsumption: 500, chargeType: "per_cubic", ratePerCubic: 35.4, isActive: true },
    ],
  },
  seniorDiscount: { applicableTiers: ["31-40", "41+"], discountRate: 5 },
};

const plain = { personal: {}, billing: {}, meters: [] };

describe("calculateWaterBillLocal (residential)", () => {
  it("charges the ₱74 flat minimum for 0–5 m³", () => {
    const r = calculateWaterBillLocal(5, "residential", plain, null, settings);
    expect(r.baseAmount).toBe(74);
    expect(r.amount).toBe(74);
    expect(r.tariffUsed.tier).toBe("0-5");
  });

  it("adds excess over 5 m³ at the next tier rate (6 m³ = ₱90.20)", () => {
    const r = calculateWaterBillLocal(6, "residential", plain, null, settings);
    expect(r.baseAmount).toBe(90.2); // 74 + (6-5)*16.20
  });

  it("10 m³ = ₱155.00", () => {
    const r = calculateWaterBillLocal(10, "residential", plain, null, settings);
    expect(r.baseAmount).toBe(155); // 74 + (10-5)*16.20
  });

  it("20 m³ = ₱332.00 with progressive (marginal) tiering", () => {
    const r = calculateWaterBillLocal(20, "residential", plain, null, settings);
    // 74 + 5×16.20 + 10×17.70 = 332.00 (matches the coop's published example)
    expect(r.baseAmount).toBe(332);
    expect(r.tariffUsed.tier).toBe("11-20");
  });

  it("40 m³ = ₱731.00 (progressive across all brackets)", () => {
    const r = calculateWaterBillLocal(40, "residential", plain, null, settings);
    // 74 + 5×16.20 + 10×17.70 + 10×19.20 + 10×20.70 = 731.00
    expect(r.baseAmount).toBe(731);
  });

  it("bills anything above the last tier's max at the open-ended top rate", () => {
    const r = calculateWaterBillLocal(600, "residential", plain, null, settings);
    expect(r.tariffUsed.tier).toBe("41+");
    // 731 (through 40 m³) + (600-40)×22.20
    expect(r.baseAmount).toBe(731 + (600 - 40) * 22.2);
  });
});

describe("calculateWaterBillLocal (commercial)", () => {
  it("charges the ₱442.50 flat minimum for 0–15 m³", () => {
    const r = calculateWaterBillLocal(15, "commercial", plain, null, settings);
    expect(r.baseAmount).toBe(442.5);
    expect(r.tariffUsed.tier).toBe("0-15");
  });

  it("20 m³ = ₱605.00", () => {
    const r = calculateWaterBillLocal(20, "commercial", plain, null, settings);
    expect(r.baseAmount).toBe(605); // 442.50 + (20-15)*32.50
  });
});

describe("calculateWaterBillLocal (misconfiguration)", () => {
  it("returns null when consumption falls in a tariff gap", () => {
    // Deliberate hole: 11–30 m³ is unconfigured.
    const gapped = {
      tariffs: {
        residential: [
          { tier: "0-5", minConsumption: 0, maxConsumption: 5, chargeType: "flat", flatAmount: 74, isActive: true },
          { tier: "6-10", minConsumption: 6, maxConsumption: 10, chargeType: "per_cubic", ratePerCubic: 16.2, isActive: true },
          { tier: "31-40", minConsumption: 31, maxConsumption: 40, chargeType: "per_cubic", ratePerCubic: 20.7, isActive: true },
        ],
      },
    };
    expect(calculateWaterBillLocal(20, "residential", plain, null, gapped)).toBeNull();
  });

  it("returns null when no tariff is configured", () => {
    expect(calculateWaterBillLocal(10, "residential", plain, null, { tariffs: { residential: [] } })).toBeNull();
  });
});

describe("discounts", () => {
  it("applies a 5% senior discount on an eligible tier", () => {
    const senior = { personal: { isSeniorCitizen: true }, billing: { discountApplicableTiers: ["31-40", "41+"] }, meters: [] };
    const r = calculateWaterBillLocal(40, "residential", senior, null, settings);
    // progressive base = 731; 5% off = 36.55; net = 694.45
    expect(r.baseAmount).toBe(731);
    expect(r.discount).toBe(36.55);
    expect(r.amount).toBe(694.45);
  });

  it("does not discount an ineligible tier", () => {
    const senior = { personal: { isSeniorCitizen: true }, billing: { discountApplicableTiers: ["31-40"] }, meters: [] };
    const r = calculateWaterBillLocal(10, "residential", senior, null, settings); // tier 6-10 not eligible
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
    const onDiscountMeter = calculateWaterBillLocal(40, "residential", member, "M1", settings);
    const onOtherMeter = calculateWaterBillLocal(40, "residential", member, "M2", settings);
    expect(onDiscountMeter.discount).toBe(36.55);
    expect(onOtherMeter.discount).toBe(0);
  });
});
