import { describe, it, expect } from "vitest";
import {
  computeAmortization,
  computeCharges,
  DEFAULT_CHARGE_RULES,
} from "./loanAmortization.js";

describe("computeAmortization (fixed diminishing balance)", () => {
  it("matches the cooperative disclosure example: P6,000 @ 2.5%/mo, 6 months", () => {
    const r = computeAmortization({ principal: 6000, monthlyRatePct: 2.5, termMonths: 6 });
    expect(r.monthlyPayment).toBe(1089.3);
    expect(r.rows).toHaveLength(6);
    expect(r.totalInterest).toBe(535.81);
    // Total paid ≈ principal + interest
    expect(r.totalPayment).toBeCloseTo(6000 + r.totalInterest, 2);
  });

  it("clears the balance exactly on the final period", () => {
    const r = computeAmortization({ principal: 6000, monthlyRatePct: 2.5, termMonths: 6 });
    expect(r.rows[r.rows.length - 1].balance).toBe(0);
  });

  it("handles a 0% rate as a straight division", () => {
    const r = computeAmortization({ principal: 1200, monthlyRatePct: 0, termMonths: 12 });
    expect(r.monthlyPayment).toBe(100);
    expect(r.totalInterest).toBe(0);
    expect(r.rows[11].balance).toBe(0);
  });

  it("first-period interest equals principal * monthly rate", () => {
    const r = computeAmortization({ principal: 6000, monthlyRatePct: 2.5, termMonths: 6 });
    expect(r.rows[0].interest).toBe(150); // 6000 * 0.025
  });
});

describe("computeCharges", () => {
  it("totals the default flat charges to ₱620 with net proceeds ₱5,380 on ₱6,000", () => {
    const c = computeCharges({ principal: 6000, rules: DEFAULT_CHARGE_RULES });
    expect(c.total).toBe(620);
    expect(c.netProceeds).toBe(5380);
  });

  it("computes percent charges against the principal", () => {
    const c = computeCharges({ principal: 10000, rules: [{ key: "x", label: "X", type: "percent", value: 2 }] });
    expect(c.total).toBe(200);
    expect(c.netProceeds).toBe(9800);
  });
});
