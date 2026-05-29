// Philippine statutory payroll computation. All rates/brackets are editable
// in PayrollSettings; these are the 2024/2025 defaults used to seed it.
//
// NOTE: SSS/PhilHealth/Pag-IBIG use approximate percentage-of-base formulas
// (clamped to the official floor/ceiling). They are close to the official
// bracketed tables and fully editable. Withholding tax uses the TRAIN-law
// monthly brackets. Treat as a starting point, not tax advice.

export const DEFAULT_PAYROLL_SETTINGS = {
  sss: { employeeRate: 0.05, minBase: 5000, maxBase: 35000 }, // EE share 5% of MSC
  philhealth: { employeeRate: 0.025, minBase: 10000, maxBase: 100000 }, // EE half of 5%
  pagibig: { employeeRate: 0.02, maxBase: 5000 }, // EE 2%, capped → max ₱100
  // TRAIN-law monthly withholding brackets (tax = base + rate * (taxable - over))
  withholding: [
    { over: 0, base: 0, rate: 0 },
    { over: 20833, base: 0, rate: 0.15 },
    { over: 33333, base: 1875, rate: 0.2 },
    { over: 66667, base: 8541.8, rate: 0.25 },
    { over: 166667, base: 33541.8, rate: 0.3 },
    { over: 666667, base: 183541.8, rate: 0.35 },
  ],
};

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function clamp(n, lo, hi) {
  return Math.min(Math.max(Number(n) || 0, lo), hi);
}
function sumLines(lines) {
  return (lines || []).reduce((t, l) => t + (Number(l.amount) || 0), 0);
}

export function computeSSS(basic, s = DEFAULT_PAYROLL_SETTINGS.sss) {
  const base = clamp(basic, s.minBase, s.maxBase);
  return round2(base * s.employeeRate);
}
export function computePhilHealth(basic, s = DEFAULT_PAYROLL_SETTINGS.philhealth) {
  const base = clamp(basic, s.minBase, s.maxBase);
  return round2(base * s.employeeRate);
}
export function computePagibig(basic, s = DEFAULT_PAYROLL_SETTINGS.pagibig) {
  const base = Math.min(Number(basic) || 0, s.maxBase);
  return round2(base * s.employeeRate);
}
export function computeWithholding(taxable, brackets = DEFAULT_PAYROLL_SETTINGS.withholding) {
  const t = Number(taxable) || 0;
  const sorted = [...brackets].sort((a, b) => b.over - a.over);
  const band = sorted.find((b) => t > b.over) || { over: 0, base: 0, rate: 0 };
  return round2(band.base + band.rate * (t - band.over));
}

// Full payslip computation. `basicPay` is the period's basic pay (already
// computed from rate * days for daily/hourly workers, or the monthly rate).
export function computePayroll({
  basicPay = 0,
  overtimePay = 0,
  allowances = [],
  otherDeductions = [],
  settings = DEFAULT_PAYROLL_SETTINGS,
}) {
  const basic = Number(basicPay) || 0;
  const ot = Number(overtimePay) || 0;
  const allowancesTotal = sumLines(allowances);
  const grossPay = round2(basic + ot + allowancesTotal);

  const sss = computeSSS(basic, settings.sss);
  const philhealth = computePhilHealth(basic, settings.philhealth);
  const pagibig = computePagibig(basic, settings.pagibig);

  // Statutory contributions are non-taxable; tax is on the rest.
  const taxable = round2(grossPay - sss - philhealth - pagibig);
  const withholdingTax = computeWithholding(taxable, settings.withholding);

  const otherTotal = sumLines(otherDeductions);
  const totalDeductions = round2(sss + philhealth + pagibig + withholdingTax + otherTotal);
  const netPay = round2(grossPay - totalDeductions);

  return {
    basicPay: round2(basic),
    overtimePay: round2(ot),
    allowancesTotal: round2(allowancesTotal),
    grossPay,
    sss,
    philhealth,
    pagibig,
    withholdingTax,
    otherDeductionsTotal: round2(otherTotal),
    totalDeductions,
    netPay,
  };
}
