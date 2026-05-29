// Printable employee payslip (green theme, logo header).

function peso(n) {
  return "₱ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}
function d(x) {
  return x ? new Date(x).toLocaleDateString() : "—";
}

const BASE_CSS = `
  @page { size: 8.5in 5.5in; margin: 12mm; } /* half bond / statement payslip */
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; }
  .head { display:flex; align-items:center; justify-content:center; gap:10px; text-align:center; border-bottom:2.5px solid #166534; padding-bottom:6px; margin-bottom:8px; }
  .head .logo { height:42px; width:42px; object-fit:contain; }
  .coop { font-size:15px; font-weight:800; color:#166534; }
  .sub { font-size:10px; color:#475569; }
  .title { text-align:center; font-size:13px; font-weight:800; color:#166534; letter-spacing:.5px; margin:4px 0 8px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:2px 16px; font-size:11px; margin-bottom:8px; }
  .meta b { color:#0f172a; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  td { padding:3px 4px; }
  .lbl { color:#475569; }
  .r { text-align:right; font-weight:700; }
  .sec { font-weight:800; color:#166534; border-bottom:1px solid #cbd5e1; padding-bottom:2px; margin-bottom:3px; }
  .net { margin-top:10px; border:2px solid #166534; border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; }
  .net .v { font-size:18px; font-weight:800; color:#166534; }
  .sign { margin-top:26px; display:grid; grid-template-columns:1fr 1fr; gap:30px; }
  .signbox { text-align:center; padding-top:16px; }
  .signline { border-top:1px solid #0f172a; padding-top:3px; font-size:10px; font-weight:700; }
`;

function header() {
  const logo = `${window.location.origin}/logo.png`;
  return `<div class="head"><img class="logo" src="${logo}" alt="POWASSCO"/><div><div class="coop">POWASSCO MULTIPURPOSE COOPERATIVE</div><div class="sub">Owak, Asturias, Cebu &nbsp;&bull;&nbsp; C.D.A Reg. No. 9520-07014753</div></div></div>`;
}

function printDoc(title, bodyHtml) {
  const w = window.open("", "_blank", "width=800,height=600");
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

export function printPayslip(slip) {
  const allowances = (slip.allowances || [])
    .map((a) => `<tr><td class="lbl">${safe(a.label) || "Allowance"}</td><td class="r">${peso(a.amount)}</td></tr>`)
    .join("");
  const others = (slip.otherDeductions || [])
    .map((o) => `<tr><td class="lbl">${safe(o.label) || "Other"}</td><td class="r">${peso(o.amount)}</td></tr>`)
    .join("");

  const body = `
    ${header()}
    <div class="title">PAYSLIP</div>
    <div class="meta">
      <div>Employee: <b>${safe(slip.employeeName)}</b></div>
      <div>Code: <b>${safe(slip.employeeCode) || "—"}</b></div>
      <div>Position: <b>${safe(slip.position) || "—"}</b></div>
      <div>Pay Date: <b>${d(slip.payDate)}</b></div>
      <div>Period: <b>${d(slip.periodStart)} – ${d(slip.periodEnd)}</b></div>
      <div>Rate: <b>${peso(slip.rate)} / ${safe(slip.rateType)}</b></div>
    </div>

    <div class="cols">
      <div>
        <div class="sec">Earnings</div>
        <table>
          <tr><td class="lbl">Basic Pay</td><td class="r">${peso(slip.basicPay)}</td></tr>
          ${slip.overtimePay ? `<tr><td class="lbl">Overtime</td><td class="r">${peso(slip.overtimePay)}</td></tr>` : ""}
          ${allowances}
          <tr><td class="lbl" style="font-weight:800;">Gross Pay</td><td class="r" style="color:#166534;">${peso(slip.grossPay)}</td></tr>
        </table>
      </div>
      <div>
        <div class="sec">Deductions</div>
        <table>
          <tr><td class="lbl">SSS</td><td class="r">${peso(slip.sss)}</td></tr>
          <tr><td class="lbl">PhilHealth</td><td class="r">${peso(slip.philhealth)}</td></tr>
          <tr><td class="lbl">Pag-IBIG</td><td class="r">${peso(slip.pagibig)}</td></tr>
          <tr><td class="lbl">Withholding Tax</td><td class="r">${peso(slip.withholdingTax)}</td></tr>
          ${others}
          <tr><td class="lbl" style="font-weight:800;">Total Deductions</td><td class="r" style="color:#b91c1c;">${peso(slip.totalDeductions)}</td></tr>
        </table>
      </div>
    </div>

    <div class="net"><div style="font-weight:800;">NET PAY</div><div class="v">${peso(slip.netPay)}</div></div>

    <div class="sign">
      <div class="signbox"><div class="signline">Prepared By</div></div>
      <div class="signbox"><div class="signline">Received By (Employee)</div></div>
    </div>`;
  printDoc(`Payslip ${safe(slip.employeeName)}`, body);
}
