// Derives automated audit remarks from an audit-report summary (the
// same object the live report shows and the signed snapshot stores).
// Pure + deterministic, so the live view and an archived report yield
// identical findings for identical figures.
//
// Each remark: { level: "ok" | "watch" | "alert", title, text }.

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (num, den) => (den > 0 ? (num / den) * 100 : 0);
const r1 = (n) => Math.round(n * 10) / 10;

export function buildAuditRemarks(s) {
  if (!s) return [];
  const c = s.collections || {}, ex = s.expenses || {}, ln = s.loans || {}, inv = s.inventory || {}, tr = s.treasury || {}, dis = s.disbursements || {};
  const out = [];

  const totalColl = (c.waterCash || 0) + (c.waterOnline || 0) + (c.loanCash || 0) + (c.loanOnline || 0) +
    (c.savingsIn || 0) + (c.productCashSale || 0) + (c.productLoanRevenue || 0);

  // Expense vs collection
  const expRatio = pct(ex.total || 0, totalColl);
  if (totalColl > 0) {
    if (expRatio > 80) out.push({ level: "alert", title: "Expenses are very high vs collections", text: `Expenses are ${r1(expRatio)}% of collections this period (${peso(ex.total)} vs ${peso(totalColl)}). Review disbursements — spending is outpacing income.` });
    else if (expRatio > 60) out.push({ level: "watch", title: "Watch expense level", text: `Expenses are ${r1(expRatio)}% of collections. Keep an eye on the expense-to-collection ratio.` });
    else out.push({ level: "ok", title: "Healthy expense ratio", text: `Expenses are ${r1(expRatio)}% of collections — within a comfortable range.` });
  }

  // Loan repayment
  const repay = pct(ln.paid || 0, ln.payable || 0);
  if ((ln.payable || 0) > 0) {
    if (repay < 50) out.push({ level: "alert", title: "Low loan repayment rate", text: `Only ${r1(repay)}% of payable on this period's loans has been collected. Prioritise collection follow-up; outstanding now is ${peso(ln.outstandingNow)}.` });
    else if (repay < 75) out.push({ level: "watch", title: "Moderate loan repayment", text: `${r1(repay)}% of payable collected. Outstanding across all loans is ${peso(ln.outstandingNow)}.` });
    else out.push({ level: "ok", title: "Strong loan repayment", text: `${r1(repay)}% of payable collected on this period's loans.` });
  }

  // Default exposure
  const exposure = pct(ln.outstandingNow || 0, (ln.outstandingNow || 0) + (ln.paid || 0));
  if (((ln.outstandingNow || 0) + (ln.paid || 0)) > 0 && exposure > 60) {
    out.push({ level: "watch", title: "High loan default exposure", text: `Outstanding loans are ${r1(exposure)}% of the active book. Consider tightening release criteria or stepping up collection.` });
  }

  // Product unpaid + inventory
  const prodUnpaidRatio = pct(inv.unpaid || 0, (inv.paid || 0) + (inv.unpaid || 0));
  if (((inv.paid || 0) + (inv.unpaid || 0)) > 0 && prodUnpaidRatio > 50) {
    out.push({ level: "watch", title: "Product receivables piling up", text: `${r1(prodUnpaidRatio)}% of product transactions remain unpaid (${peso(inv.unpaid)}). Follow up on product-loan collections.` });
  }
  if ((inv.capitalUnsold || 0) > 0 && (inv.sold?.sale?.revenue || 0) + (inv.sold?.loan?.revenue || 0) > 0) {
    const tie = pct(inv.capitalUnsold, (inv.capitalUnsold || 0) + (inv.sold?.sale?.capital || 0) + (inv.sold?.loan?.capital || 0));
    if (tie > 60) out.push({ level: "watch", title: "Capital tied in slow-moving stock", text: `${peso(inv.capitalUnsold)} of capital sits in unsold inventory (${r1(tie)}% of product capital). Review purchasing of slow movers.` });
  }

  // Reserves vs member funds (liquidity)
  const reserves = (tr.bankTotal || 0) + (tr.vaultBalance || 0);
  const memberFunds = (s.cbu?.total || 0) + (s.savings?.total || 0);
  if (memberFunds > 0) {
    const cover = pct(reserves, memberFunds);
    if (cover < 50) out.push({ level: "alert", title: "Reserves below member funds", text: `Cash reserves (${peso(reserves)}) cover only ${r1(cover)}% of member CBU + savings (${peso(memberFunds)}). Liquidity should be monitored closely.` });
    else if (cover < 100) out.push({ level: "watch", title: "Partial reserve coverage", text: `Reserves cover ${r1(cover)}% of member funds. Aim to keep enough liquid to meet withdrawals.` });
    else out.push({ level: "ok", title: "Reserves cover member funds", text: `Cash reserves (${peso(reserves)}) fully cover member funds (${peso(memberFunds)}).` });
  }

  // Net cash position
  const net = totalColl - (dis.grandTotal || 0);
  if (net < 0) out.push({ level: "alert", title: "Net cash outflow for the period", text: `Disbursements (${peso(dis.grandTotal)}) exceeded collections (${peso(totalColl)}) by ${peso(-net)}. Confirm this is expected (e.g. large loan releases).` });

  if (!out.length) out.push({ level: "ok", title: "No issues detected", text: "Figures for this period are within normal ranges. Nothing flagged automatically." });
  return out;
}
