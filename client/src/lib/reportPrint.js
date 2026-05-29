// Printable admin reports (long bond paper, green theme, logo header).

function peso(n) {
  return "₱ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}
function fmtRange(from, to) {
  if (!from && !to) return "All time";
  const f = from ? new Date(from).toLocaleDateString() : "start";
  const t = to ? new Date(to).toLocaleDateString() : "today";
  return `${f} — ${t}`;
}

const BASE_CSS = `
  @page { size: 8.5in 13in; margin: 14mm; } /* PH long bond paper */
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; }
  .head { display:flex; align-items:center; justify-content:center; gap:12px; text-align:center; border-bottom:3px solid #166534; padding-bottom:8px; margin-bottom:14px; }
  .head .logo { height:54px; width:54px; object-fit:contain; }
  .coop { font-size:18px; font-weight:800; color:#166534; }
  .sub { font-size:11px; color:#475569; }
  .title { text-align:center; font-size:15px; font-weight:800; color:#166534; letter-spacing:.5px; margin:10px 0 4px; }
  .period { text-align:center; font-size:11px; color:#475569; margin-bottom:14px; }
  .sec { font-size:12px; font-weight:800; color:#166534; margin:16px 0 6px; }
  table { width:100%; border-collapse:collapse; font-size:11px; margin-top:6px; }
  th,td { border:1px solid #cbd5e1; padding:5px 7px; text-align:left; }
  thead th { background:#f0fdf4; }
  td.r, th.r { text-align:right; }
  .grand td { font-weight:800; background:#f8fafc; }
  .kpis { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:6px; }
  .kpi { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; }
  .kpi .v { font-size:14px; font-weight:800; color:#166534; }
  .kpi .l { font-size:10px; color:#64748b; }
  .muted { color:#64748b; font-size:10px; margin-top:18px; }
`;

function header() {
  const logo = `${window.location.origin}/logo.png`;
  return `<div class="head"><img class="logo" src="${logo}" alt="POWASSCO"/><div><div class="coop">POWASSCO MULTIPURPOSE COOPERATIVE</div><div class="sub">Owak, Asturias, Cebu &nbsp;&bull;&nbsp; C.D.A Reg. No. 9520-07014753</div></div></div>`;
}

function printDoc(title, bodyHtml) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    alert("Unable to open the print window. Please allow pop-ups for this site and try again.");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${safe(title)}</title><style>${BASE_CSS}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();

  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    w.focus();
    w.print();
    setTimeout(() => w.close(), 400);
  };
  const imgs = Array.from(w.document.images || []);
  const pending = imgs.filter((im) => !im.complete);
  if (pending.length === 0) setTimeout(go, 150);
  else pending.forEach((im) => { im.onload = im.onerror = () => { if (pending.every((p) => p.complete)) go(); }; });
  setTimeout(go, 1500);
}

export function printFinancialReport({ from, to, expenses, loan, generatedBy }) {
  const rows = (expenses?.byCategory || [])
    .map((c) => `<tr><td>${safe(c.category)}</td><td class="r">${c.count}</td><td class="r">${peso(c.total)}</td></tr>`)
    .join("");

  const loanSection = loan
    ? `
    <div class="sec">Loan Portfolio Summary</div>
    <div class="kpis">
      <div class="kpi"><div class="v">${peso(loan.capitalReleased)}</div><div class="l">Capital Released</div></div>
      <div class="kpi"><div class="v">${peso(loan.expectedInterest)}</div><div class="l">Interest (Profit)</div></div>
      <div class="kpi"><div class="v">${peso(loan.totalCharges)}</div><div class="l">Charges</div></div>
      <div class="kpi"><div class="v">${peso(loan.totalCollected)}</div><div class="l">Total Collected</div></div>
      <div class="kpi"><div class="v">${peso(loan.outstanding)}</div><div class="l">Outstanding</div></div>
      <div class="kpi"><div class="v">${peso(loan.totalReceivable)}</div><div class="l">Total Receivable</div></div>
    </div>`
    : "";

  const body = `
    ${header()}
    <div class="title">FINANCIAL REPORT</div>
    <div class="period">Period: ${fmtRange(from, to)}</div>

    <div class="sec">Expenses by Category</div>
    <table>
      <thead><tr><th>Category</th><th class="r">Entries</th><th class="r">Amount</th></tr></thead>
      <tbody>
        ${rows || `<tr><td colspan="3" class="muted">No expenses in this period.</td></tr>`}
        <tr class="grand"><td>TOTAL EXPENSES</td><td class="r">${expenses?.count || 0}</td><td class="r">${peso(expenses?.total)}</td></tr>
      </tbody>
    </table>

    ${loanSection}

    <div class="muted">
      Generated ${new Date().toLocaleString()}${generatedBy ? ` by ${safe(generatedBy)}` : ""}.
      This is a system-generated report from the POWASSCO management system.
    </div>`;
  printDoc("Financial Report", body);
}
