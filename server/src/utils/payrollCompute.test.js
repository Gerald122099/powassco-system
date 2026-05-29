import { describe, it, expect } from "vitest";
import {
  computePayroll,
  computeSSS,
  computePhilHealth,
  computePagibig,
  computeWithholding,
  DEFAULT_PAYROLL_SETTINGS as D,
} from "./payrollCompute.js";

describe("statutory contributions (PH defaults)", () => {
  it("SSS = 5% of MSC, clamped to the 5,000–35,000 band", () => {
    expect(computeSSS(20000, D.sss)).toBe(1000);
    expect(computeSSS(3000, D.sss)).toBe(250); // floored to 5,000 base
    expect(computeSSS(50000, D.sss)).toBe(1750); // capped to 35,000 base
  });

  it("PhilHealth = 2.5% within the 10,000–100,000 band", () => {
    expect(computePhilHealth(20000, D.philhealth)).toBe(500);
    expect(computePhilHealth(5000, D.philhealth)).toBe(250); // floored to 10,000
  });

  it("Pag-IBIG = 2% capped at a ₱5,000 base (max ₱100)", () => {
    expect(computePagibig(20000, D.pagibig)).toBe(100);
    expect(computePagibig(3000, D.pagibig)).toBe(60);
  });

  it("withholding tax uses the TRAIN monthly brackets", () => {
    expect(computeWithholding(18000, D.withholding)).toBe(0); // below 20,833
    // 30,000 taxable -> 15% of (30,000 - 20,833) = 1,375.05
    expect(computeWithholding(30000, D.withholding)).toBeCloseTo(1375.05, 2);
  });
});

describe("computePayroll", () => {
  it("monthly ₱20,000 basic nets ₱18,400 after statutory deductions", () => {
    const p = computePayroll({ basicPay: 20000, settings: D });
    expect(p.grossPay).toBe(20000);
    expect(p.sss).toBe(1000);
    expect(p.philhealth).toBe(500);
    expect(p.pagibig).toBe(100);
    expect(p.withholdingTax).toBe(0); // taxable 18,400 < 20,833
    expect(p.totalDeductions).toBe(1600);
    expect(p.netPay).toBe(18400);
  });

  it("adds overtime + allowances into gross and other deductions into the total", () => {
    const p = computePayroll({
      basicPay: 20000,
      overtimePay: 1000,
      allowances: [{ label: "Transport", amount: 500 }],
      otherDeductions: [{ label: "Cash advance", amount: 300 }],
      settings: D,
    });
    expect(p.grossPay).toBe(21500); // 20000 + 1000 + 500
    expect(p.otherDeductionsTotal).toBe(300);
    // statutory are computed on basic (20,000), unchanged
    expect(p.sss).toBe(1000);
    expect(p.netPay).toBe(p.grossPay - p.totalDeductions);
  });
});
