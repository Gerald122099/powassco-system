// Downloadable/printable payment receipts for the public Bill Inquiry
// (water bill per meter, and loan payments). Opens a print window; the member
// can "Save as PDF" to download. Green theme + logo, compact receipt size.

function peso(n) {
  return "₱ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}
function d(x) {
  return x ? new Date(x).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" }) : "—";
}

const BASE_CSS = `
  @page { size: 8.5in 5.5in; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#0f172a; font-size:12px; margin:0; }
  .head { display:flex; align-items:center; justify-content:center; gap:10px; text-align:center; border-bottom:2.5px solid #166534; padding-bottom:6px; margin-bottom:8px; }
  .head .logo { height:46px; width:46px; object-fit:contain; }
  .coop { font-size:15px; font-weight:800; color:#166534; }
  .sub { font-size:10px; color:#475569; }
  .title { text-align:center; font-size:13px; font-weight:800; color:#166534; letter-spacing:.5px; margin:4px 0 8px; }
  .row { display:flex; justify-content:space-between; padding:2px 0; }
  .lbl { color:#475569; }
  .v { font-weight:700; }
  .divider { border-top:1px dashed #94a3b8; margin:6px 0; }
  .total { display:flex; justify-content:space-between; align-items:center; border:2px solid #166534; border-radius:8px; padding:6px 10px; margin-top:8px; }
  .total .amt { font-size:16px; font-weight:800; color:#166534; }
  .paid { text-align:center; margin-top:6px; font-weight:800; color:#166534; letter-spacing:2px; }
  .foot { text-align:center; margin-top:10px; font-size:10px; color:#64748b; }
`;

function header() {
  const logo = `${window.location.origin}/logo.png`;
  return `<div class="head"><img class="logo" src="${logo}" alt="POWASSCO"/><div><div class="coop">POWASSCO MULTIPURPOSE COOPERATIVE</div><div class="sub">Owak, Asturias, Cebu &bull; C.D.A Reg. No. 9520-07014753</div></div></div>`;
}

function printDoc(title, body) {
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) {
    alert("Please allow pop-ups to download the receipt.");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${safe(title)}</title><style>${BASE_CSS}</style></head><body>${body}</body></html>`);
  w.document.close();
  let printed = false;
  const go = () => { if (printed) return; printed = true; w.focus(); w.print(); setTimeout(() => w.close(), 400); };
  const img = w.document.images[0];
  if (img && !img.complete) img.onload = img.onerror = go;
  else setTimeout(go, 200);
  setTimeout(go, 1500);
}

export function printWaterReceipt({ member, bill, payment }) {
  const body = `
    ${header()}
    <div class="title">OFFICIAL RECEIPT — WATER</div>
    <div class="row"><span class="lbl">OR No.</span><span class="v">${safe(payment.orNo)}</span></div>
    <div class="row"><span class="lbl">Date</span><span class="v">${d(payment.paidAt)}</span></div>
    <div class="divider"></div>
    <div class="row"><span class="lbl">Account</span><span class="v">${safe(member.accountName)} (${safe(member.pnNo)})</span></div>
    <div class="row"><span class="lbl">Meter</span><span class="v">${safe(bill.meterNumber)}</span></div>
    <div class="row"><span class="lbl">Billing Period</span><span class="v">${safe(bill.periodCovered)}</span></div>
    <div class="row"><span class="lbl">Consumption</span><span class="v">${safe(bill.consumed)} m³</span></div>
    ${bill.tariffUsed ? `<div class="row"><span class="lbl">Tariff Tier</span><span class="v">${safe(bill.tariffUsed.tier)}</span></div>` : ""}
    ${bill.discount > 0 ? `<div class="row"><span class="lbl">Discount</span><span class="v">- ${peso(bill.discount)}</span></div>` : ""}
    ${bill.penaltyApplied > 0 ? `<div class="row"><span class="lbl">Penalty</span><span class="v">+ ${peso(bill.penaltyApplied)}</span></div>` : ""}
    <div class="total"><span class="v">AMOUNT PAID (${safe(payment.method)})</span><span class="amt">${peso(payment.amountPaid)}</span></div>
    <div class="paid">★ PAID ★</div>
    <div class="foot">This is a system-generated receipt. Issued ${new Date().toLocaleString()}.</div>`;
  printDoc(`Receipt ${payment.orNo || bill.meterNumber}`, body);
}

export function printLoanReceipt({ loan, payment }) {
  const body = `
    ${header()}
    <div class="title">OFFICIAL RECEIPT — LOAN</div>
    <div class="row"><span class="lbl">OR No.</span><span class="v">${safe(payment.orNo)}</span></div>
    <div class="row"><span class="lbl">Date</span><span class="v">${d(payment.paidAt)}</span></div>
    <div class="divider"></div>
    <div class="row"><span class="lbl">Loan ID</span><span class="v">${safe(loan.loanId)}</span></div>
    <div class="row"><span class="lbl">Principal</span><span class="v">${peso(loan.principal)}</span></div>
    <div class="row"><span class="lbl">Remaining Balance</span><span class="v">${peso(loan.balance)}</span></div>
    <div class="total"><span class="v">AMOUNT PAID (${safe(payment.method)})</span><span class="amt">${peso(payment.amountPaid)}</span></div>
    <div class="paid">★ PAYMENT POSTED ★</div>
    <div class="foot">This is a system-generated receipt. Issued ${new Date().toLocaleString()}.</div>`;
  printDoc(`Loan Receipt ${payment.orNo || loan.loanId}`, body);
}
