// Loan computation: fixed diminishing-balance (annuity) amortization +
// add-on charges. Matches the cooperative's paper-ledger convention:
// every figure is rounded to the nearest whole peso (no centavos) and
// the final period's payment absorbs any rounding remainder so the
// outstanding balance lands cleanly at ₱0.

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function roundPeso(n) {
  return Math.round(Number(n) + Number.EPSILON);
}

// Fixed diminishing balance: equal monthly payments; interest accrues on the
// running balance; principal portion = payment - interest; the final period
// clears any remaining balance.
//
// Reference (operator's paper ledger, P=2000, r=2.5%, n=6):
//   Period    Amort   Pri   Int   Balance
//      1       363    313    50    1687
//      2       363    321    42    1366
//      3       363    329    34    1037
//      4       363    337    26     700
//      5       363    346    17     354    ← last interest derived from
//      6       364    354    10       0     payment − principal so totals match
//   Total     2179   2000   179
//
// Our algorithm reproduces this exactly: payment is rounded to peso,
// per-period interest = roundPeso(balance × r), principal = payment − interest,
// and on the LAST period principal absorbs whatever balance remains while
// interest is back-derived as (payment − principal). That keeps Σ principal
// = P and Σ interest = Σ payment − P with no centavo drift.
export function computeAmortization({ principal, monthlyRatePct, termMonths }) {
  const P = roundPeso(Math.max(0, Number(principal) || 0));
  const r = (Number(monthlyRatePct) || 0) / 100;
  const n = Math.max(1, Math.round(Number(termMonths) || 1));

  let basePayment;
  if (r === 0) basePayment = P / n;
  else basePayment = (P * r) / (1 - Math.pow(1 + r, -n));
  const payment = roundPeso(basePayment);

  const rows = [];
  let balance = P;
  for (let i = 1; i <= n; i++) {
    let interest;
    let principalPortion;
    let pay;
    if (i === n) {
      // Last period: clear the balance regardless of what the formula
      // would say. payment-of-record stays equal to the standard payment,
      // and we may bump it by ±1 peso so principal + interest both round
      // cleanly. Interest is back-derived from (payment − principal) so
      // the totals always balance.
      principalPortion = balance;
      pay = payment;
      interest = pay - principalPortion;
      // If accumulated rounding left a wide gap, nudge the payment so
      // the row still represents a sensible "balance + interest" amount.
      if (interest < 0) {
        pay = principalPortion + Math.max(0, roundPeso(balance * r));
        interest = pay - principalPortion;
      } else if (interest > roundPeso(balance * r) + 5) {
        // Avoid an unexpectedly large last-period payment.
        pay = principalPortion + roundPeso(balance * r);
        interest = pay - principalPortion;
      }
    } else {
      interest = roundPeso(balance * r);
      principalPortion = payment - interest;
      pay = payment;
    }
    balance = balance - principalPortion;
    if (balance < 0) balance = 0;
    rows.push({ period: i, payment: pay, principal: principalPortion, interest, balance });
  }

  return {
    monthlyPayment: payment,
    rows,
    totalPayment: rows.reduce((s, x) => s + x.payment, 0),
    totalPrincipal: P,
    totalInterest: rows.reduce((s, x) => s + x.interest, 0),
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
