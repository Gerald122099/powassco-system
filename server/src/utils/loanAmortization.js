// Loan computation: fixed diminishing-balance (annuity) amortization + add-on charges.

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Fixed diminishing balance: equal monthly payments; interest accrues on the
// running balance; principal portion = payment - interest; the final period
// clears any remaining balance.
export function computeAmortization({ principal, monthlyRatePct, termMonths }) {
  const P = Math.max(0, Number(principal) || 0);
  const r = (Number(monthlyRatePct) || 0) / 100;
  const n = Math.max(1, Math.round(Number(termMonths) || 1));

  let payment;
  if (r === 0) payment = P / n;
  else payment = (P * r) / (1 - Math.pow(1 + r, -n));
  payment = round2(payment);

  const rows = [];
  let balance = P;
  for (let i = 1; i <= n; i++) {
    const interest = round2(balance * r);
    let principalPortion = round2(payment - interest);
    let pay = payment;
    if (i === n) {
      principalPortion = round2(balance); // clear remaining balance on the last period
      pay = round2(principalPortion + interest);
    }
    balance = round2(balance - principalPortion);
    if (balance < 0) balance = 0;
    rows.push({ period: i, payment: pay, principal: principalPortion, interest, balance });
  }

  return {
    monthlyPayment: payment,
    rows,
    totalPayment: round2(rows.reduce((s, x) => s + x.payment, 0)),
    totalPrincipal: round2(P),
    totalInterest: round2(rows.reduce((s, x) => s + x.interest, 0)),
  };
}

// Add-on charges deducted from the principal to compute net proceeds.
// rules: [{ key, label, type: "flat" | "percent", value }]
export function computeCharges({ principal, rules = [] }) {
  const P = Math.max(0, Number(principal) || 0);
  const items = rules.map((c) => {
    const amount =
      c.type === "percent"
        ? round2(P * ((Number(c.value) || 0) / 100))
        : round2(Number(c.value) || 0);
    return { key: c.key, label: c.label, type: c.type, value: Number(c.value) || 0, amount };
  });
  const total = round2(items.reduce((s, x) => s + x.amount, 0));
  return { items, total, netProceeds: round2(P - total) };
}

// Defaults derived from the cooperative's disclosure example (₱620 total on ₱6,000).
// All are configurable in LoanSettings.
export const DEFAULT_CHARGE_RULES = [
  { key: "serviceFee", label: "Service fee", type: "flat", value: 100 },
  { key: "capitalBuildUp", label: "Capital Build-up / pledge", type: "flat", value: 100 },
  { key: "filingFee", label: "Filing Fee", type: "flat", value: 100 },
  { key: "collateralRiskFund", label: "Collateral Risk Fund", type: "flat", value: 100 },
  { key: "notarialFee", label: "Notarial Fee", type: "flat", value: 200 },
  { key: "processingFee", label: "Others / Processing Fee", type: "flat", value: 20 },
];

export const DEFAULT_INTEREST_RATE_PER_MONTH = 2.5;
export const DEFAULT_PENALTY_RATE_PER_MONTH = 12;
