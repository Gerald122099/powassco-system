import { describe, it, expect } from "vitest";
import {
  computeAmortization,
  computeCharges,
  DEFAULT_CHARGE_RULES,
} from "./loanAmortization.js";

describe("computeAmortization (fixed diminishing balance, whole-peso)", () => {
  // Matches the cooperative's printed amortization tables (paper
  // ledger), which round every figure to whole pesos. The last period
  // absorbs any rounding remainder so Σ principal = P exactly.
  it("matches the disclosure example: P6,000 @ 2.5%/mo, 6 months", () => {
    const r = computeAmortization({ principal: 6000, monthlyRatePct: 2.5, termMonths: 6 });
    expect(r.monthlyPayment).toBe(1089);
    expect(r.rows).toHaveLength(6);
    expect(r.totalPrincipal).toBe(6000);
    // Total paid = Σ principal + Σ interest
    expect(r.totalPayment).toBe(r.totalPrincipal + r.totalInterest);
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

  it("first-period interest equals principal * monthly rate (in whole pesos)", () => {
    const r = computeAmortization({ principal: 6000, monthlyRatePct: 2.5, termMonths: 6 });
    expect(r.rows[0].interest).toBe(150); // 6000 * 0.025 = 150
    expect(r.rows[0].principal).toBe(1089 - 150);
  });

  // Reference numbers below come straight from the operator's paper
  // amortization sheet (P=2000/3000/4000/5000/6000/7000 @ 2.5% × 6).
  // Periods 1-4 are exact; periods 5-6 can differ by ±₱1 due to half-
  // rounding convention. We assert the EXACT period-1 figures and
  // total-principal balance, which is the part the ledger relies on.
  it.each([
    { P: 2000, payment: 363, int1: 50, pri1: 313, bal1: 1687 },
    { P: 3000, payment: 545, int1: 75, pri1: 470, bal1: 2530 },
    { P: 4000, payment: 726, int1: 100, pri1: 626, bal1: 3374 },
    { P: 5000, payment: 908, int1: 125, pri1: 783, bal1: 4217 },
    { P: 6000, payment: 1089, int1: 150, pri1: 939, bal1: 5061 },
    { P: 7000, payment: 1271, int1: 175, pri1: 1096, bal1: 5904 },
  ])("matches paper ledger for P=$P", ({ P, payment, int1, pri1, bal1 }) => {
    const r = computeAmortization({ principal: P, monthlyRatePct: 2.5, termMonths: 6 });
    expect(r.monthlyPayment).toBe(payment);
    expect(r.rows[0].payment).toBe(payment);
    expect(r.rows[0].interest).toBe(int1);
    expect(r.rows[0].principal).toBe(pri1);
    expect(r.rows[0].balance).toBe(bal1);
    expect(r.totalPrincipal).toBe(P);
    expect(r.rows[5].balance).toBe(0); // final period must clear
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
