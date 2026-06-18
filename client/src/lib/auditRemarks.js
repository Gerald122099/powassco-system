// Derives automated audit remarks AND forward-looking recommendations
// from an audit-report summary (the same object the live report shows and
// the signed snapshot stores). Pure + deterministic, so the live view and
// an archived report yield identical findings for identical figures.
//
//   remark:         { level: "ok" | "watch" | "alert", title, text }
//   recommendation: { priority: "high" | "medium" | "low", title, text }

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (num, den) => (den > 0 ? (num / den) * 100 : 0);
const r1 = (n) => Math.round(n * 10) / 10;

// Shared derived metrics so remarks + recommendations agree.
function metrics(s) {
  const c = s.collections || {}, ex = s.expenses || {}, ln = s.loans || {},
    inv = s.inventory || {}, tr = s.treasury || {}, dis = s.disbursements || {};
  const totalColl = (c.waterCash || 0) + (c.waterOnline || 0) + (c.loanCash || 0) + (c.loanOnline || 0) +
    (c.savingsIn || 0) + (c.productCashSale || 0) + (c.productLoanRevenue || 0);
  const onlineColl = (c.waterOnline || 0) + (c.loanOnline || 0);
  const reserves = (tr.bankTotal || 0) + (tr.vaultBalance || 0);
  const memberFunds = (s.cbu?.total || 0) + (s.savings?.total || 0);
  return {
    c, ex, ln, inv, tr, dis,
    totalColl, onlineColl, reserves, memberFunds,
    expRatio: pct(ex.total || 0, totalColl),
    repay: pct(ln.paid || 0, ln.payable || 0),
    exposure: pct(ln.outstandingNow || 0, (ln.outstandingNow || 0) + (ln.paid || 0)),
    coverage: pct(reserves, memberFunds),
    onlineShare: pct(onlineColl, totalColl),
    savingsNet: (c.savingsIn || 0) - (c.savingsOut || 0),
    net: totalColl - (dis.grandTotal || 0),
    cashOnHand: tr.cashOnHandAsOf || 0,
    prodUnpaidRatio: pct(inv.unpaid || 0, (inv.paid || 0) + (inv.unpaid || 0)),
  };
}

const topExpenseCategory = (dis) => {
  const bc = dis?.expenses?.byCategory;
  if (!Array.isArray(bc) || !bc.length) return null;
  const top = [...bc].sort((a, b) => (b.total || b.amount || 0) - (a.total || a.amount || 0))[0];
  if (!top) return null;
  return { label: top._id || top.category || top.label || "Uncategorised", total: top.total || top.amount || 0 };
};

export function buildAuditRemarks(s) {
  if (!s) return [];
  const m = metrics(s);
  const { c, ex, ln, inv, tr, dis } = m;
  const out = [];

  // Expense vs collection
  if (m.totalColl > 0) {
    if (m.expRatio > 80) out.push({ level: "alert", title: "Expenses very high vs collections", text: `Expenses are ${r1(m.expRatio)}% of collections (${peso(ex.total)} vs ${peso(m.totalColl)}). Spending is outpacing income — review disbursements.` });
    else if (m.expRatio > 60) out.push({ level: "watch", title: "Watch expense level", text: `Expenses are ${r1(m.expRatio)}% of collections. Keep the expense-to-collection ratio in check.` });
    else out.push({ level: "ok", title: "Healthy expense ratio", text: `Expenses are ${r1(m.expRatio)}% of collections — within a comfortable range.` });
  }

  // Net cash position (inflow vs outflow)
  if (m.net < 0) out.push({ level: "alert", title: "Net cash outflow for the period", text: `Disbursements (${peso(dis.grandTotal)}) exceeded collections (${peso(m.totalColl)}) by ${peso(-m.net)}. Confirm this is expected (e.g. large loan releases), not an operating loss.` });
  else if (m.totalColl > 0) out.push({ level: "ok", title: "Positive net cash flow", text: `Collections (${peso(m.totalColl)}) exceeded disbursements (${peso(dis.grandTotal)}) — net inflow of ${peso(m.net)}.` });

  // Loan repayment
  if ((ln.payable || 0) > 0) {
    if (m.repay < 50) out.push({ level: "alert", title: "Low loan repayment rate", text: `Only ${r1(m.repay)}% of this period's payable has been collected. Outstanding across all loans is ${peso(ln.outstandingNow)} (${ln.outstandingCount || 0} loan(s)).` });
    else if (m.repay < 75) out.push({ level: "watch", title: "Moderate loan repayment", text: `${r1(m.repay)}% of payable collected. Outstanding across all loans is ${peso(ln.outstandingNow)}.` });
    else out.push({ level: "ok", title: "Strong loan repayment", text: `${r1(m.repay)}% of payable collected on this period's loans.` });
  }

  // Default exposure
  if (((ln.outstandingNow || 0) + (ln.paid || 0)) > 0 && m.exposure > 60) {
    out.push({ level: "watch", title: "High loan default exposure", text: `Outstanding loans are ${r1(m.exposure)}% of the active book. Consider tightening release criteria or stepping up collection.` });
  }

  // Loan interest earned (profitability signal)
  if ((ln.interest || 0) > 0) {
    out.push({ level: "ok", title: "Interest income generated", text: `Loans released this period carry ${peso(ln.interest)} in interest on ${peso(ln.capital)} capital (${ln.released || 0} loan(s)).` });
  }

  // Product receivables + idle inventory capital
  if (((inv.paid || 0) + (inv.unpaid || 0)) > 0 && m.prodUnpaidRatio > 50) {
    out.push({ level: "watch", title: "Product receivables piling up", text: `${r1(m.prodUnpaidRatio)}% of product transactions remain unpaid (${peso(inv.unpaid)}). Follow up on product-loan collections.` });
  }
  if ((inv.capitalUnsold || 0) > 0) {
    const soldCap = (inv.sold?.sale?.capital || 0) + (inv.sold?.loan?.capital || 0);
    const tie = pct(inv.capitalUnsold, (inv.capitalUnsold || 0) + soldCap);
    if (tie > 60) out.push({ level: "watch", title: "Capital tied in slow-moving stock", text: `${peso(inv.capitalUnsold)} of capital sits in unsold inventory (${r1(tie)}% of product capital). Review purchasing of slow movers.` });
  }

  // Savings net flow
  if ((c.savingsIn || 0) + (c.savingsOut || 0) > 0 && m.savingsNet < 0) {
    out.push({ level: "watch", title: "Savings withdrawals exceeded deposits", text: `Members withdrew ${peso(-m.savingsNet)} more than they deposited (${peso(c.savingsOut)} out vs ${peso(c.savingsIn)} in). Watch liquidity.` });
  }

  // Reserves vs member funds (liquidity)
  if (m.memberFunds > 0) {
    if (m.coverage < 50) out.push({ level: "alert", title: "Reserves below member funds", text: `Cash reserves (${peso(m.reserves)}) cover only ${r1(m.coverage)}% of member CBU + savings (${peso(m.memberFunds)}). Liquidity needs close monitoring.` });
    else if (m.coverage < 100) out.push({ level: "watch", title: "Partial reserve coverage", text: `Reserves cover ${r1(m.coverage)}% of member funds. Keep enough liquid to meet withdrawals.` });
    else out.push({ level: "ok", title: "Reserves cover member funds", text: `Cash reserves (${peso(m.reserves)}) fully cover member funds (${peso(m.memberFunds)}).` });
  }

  // Cash-handling concentration
  if (m.cashOnHand > 0 && m.cashOnHand > (tr.bankTotal || 0) && m.cashOnHand > 20000) {
    out.push({ level: "watch", title: "High cash on hand", text: `${peso(m.cashOnHand)} is held as cash (vault) — more than the bank balance (${peso(tr.bankTotal)}). Large on-site cash raises loss/theft risk.` });
  }

  if (!out.length) out.push({ level: "ok", title: "No issues detected", text: "Figures for this period are within normal ranges. Nothing flagged automatically." });
  return out;
}

// Forward-looking, actionable recommendations from the same analytics.
export function buildAuditRecommendations(s) {
  if (!s) return [];
  const m = metrics(s);
  const { c, ln, inv, tr, dis } = m;
  const recs = [];

  // Expenses
  if (m.totalColl > 0 && m.expRatio > 60) {
    const top = topExpenseCategory(dis);
    const catTxt = top ? ` The biggest line is ${top.label} (${peso(top.total)}) — start there.` : "";
    recs.push({ priority: m.expRatio > 80 ? "high" : "medium", title: "Rein in operating expenses", text: `Expenses are ${r1(m.expRatio)}% of collections. Defer non-essential spending and aim to bring this under 60%.${catTxt}` });
  }

  // Loan collection
  if ((ln.payable || 0) > 0 && m.repay < 75) {
    recs.push({ priority: m.repay < 50 ? "high" : "medium", title: "Step up loan collection", text: `Only ${r1(m.repay)}% of payable was collected and ${peso(ln.outstandingNow)} is outstanding across ${ln.outstandingCount || 0} loan(s). Run a focused follow-up on overdue borrowers, send reminders, and consider restructuring chronic late payers or tightening release criteria.` });
  }

  // Liquidity
  if (m.memberFunds > 0 && m.coverage < 100) {
    recs.push({ priority: m.coverage < 50 ? "high" : "medium", title: "Strengthen liquidity reserves", text: `Reserves cover only ${r1(m.coverage)}% of member CBU + savings (${peso(m.reserves)} vs ${peso(m.memberFunds)}). Slow large discretionary disbursements and set aside a share of surplus until reserves comfortably cover member funds.` });
  }

  // Net outflow
  if (m.net < 0) {
    recs.push({ priority: "medium", title: "Confirm the period's net outflow", text: `Disbursements exceeded collections by ${peso(-m.net)}. Verify it's from planned loan releases (${peso(dis.loanProceeds?.total || 0)}); if it recurs from operations, raise collections or trim costs.` });
  }

  // Cash handling
  if (m.cashOnHand > 0 && m.cashOnHand > (tr.bankTotal || 0) && m.cashOnHand > 20000) {
    recs.push({ priority: "medium", title: "Deposit excess cash to the bank", text: `${peso(m.cashOnHand)} is held on-site as cash. Deposit the excess to reduce theft/loss risk and improve the audit trail.` });
  }

  // Digitisation of collections
  if (m.totalColl > 0 && m.onlineShare < 15) {
    recs.push({ priority: "low", title: "Promote online payments", text: `Only ${r1(m.onlineShare)}% of collections came in online. Encouraging GCard/online channels cuts cash handling and speeds reconciliation.` });
  }

  // Product loans / inventory
  if (((inv.paid || 0) + (inv.unpaid || 0)) > 0 && m.prodUnpaidRatio > 50) {
    recs.push({ priority: "medium", title: "Collect product-loan receivables", text: `${peso(inv.unpaid)} of product transactions are unpaid. Schedule collection and pause new product loans to slow payers.` });
  }
  if ((inv.capitalUnsold || 0) > 20000) {
    recs.push({ priority: "low", title: "Trim slow-moving stock", text: `${peso(inv.capitalUnsold)} of capital is tied in unsold inventory. Reduce reorders of slow movers and consider promos to free up cash.` });
  }

  // Savings outflow
  if ((c.savingsIn || 0) + (c.savingsOut || 0) > 0 && m.savingsNet < 0) {
    recs.push({ priority: "low", title: "Encourage member savings", text: `Withdrawals outpaced deposits by ${peso(-m.savingsNet)}. Promote savings products and keep liquidity ready for withdrawals.` });
  }

  // Healthy surplus → put it to work
  if (m.net > 0 && m.expRatio < 60 && m.coverage >= 100) {
    recs.push({ priority: "low", title: "Allocate the surplus", text: `The period closed with a ${peso(m.net)} net inflow and healthy ratios. Consider channelling part of the surplus to reserves or member CBU dividends.` });
  }

  if (!recs.length) recs.push({ priority: "low", title: "Maintain current controls", text: "Figures are within healthy ranges. Keep up the current collection and expense discipline, document this period, and sign to archive." });

  const order = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => order[a.priority] - order[b.priority]);
}
