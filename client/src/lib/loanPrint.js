// Clean A4 print documents for the loan module (opens a fresh window, prints).
// Mirrors the cooperative's Application Form, Disclosure Statement, Promissory
// Note, and a payment receipt — auto-filled from a loan record.

function peso(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dt(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return "—";
  }
}
function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}

const BASE_CSS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; }
  .head { display:flex; justify-content:center; text-align:center; border-bottom:3px solid #1e3a8a; padding-bottom:8px; margin-bottom:14px; }
  .coop { font-size:18px; font-weight:800; color:#1e3a8a; }
  .sub { font-size:11px; color:#475569; }
  .title { text-align:center; font-size:15px; font-weight:800; color:#1e3a8a; letter-spacing:.5px; margin:10px 0 14px; }
  .row { display:flex; justify-content:space-between; gap:16px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px 24px; }
  .lbl { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:.4px; }
  .val { font-weight:700; border-bottom:1px solid #cbd5e1; padding:2px 0 3px; min-height:18px; }
  .sec { font-size:12px; font-weight:800; color:#1e3a8a; margin:16px 0 6px; }
  table { width:100%; border-collapse:collapse; font-size:11px; margin-top:6px; }
  th,td { border:1px solid #cbd5e1; padding:5px 6px; text-align:left; }
  thead th { background:#eff6ff; }
  td.r, th.r { text-align:right; }
  .sign { margin-top:40px; display:grid; grid-template-columns:1fr 1fr; gap:40px; }
  .signbox { text-align:center; }
  .signline { border-top:1px solid #0f172a; padding-top:4px; font-size:11px; font-weight:700; }
  .muted { color:#64748b; font-size:10px; }
  .box { border:1px solid #cbd5e1; border-radius:8px; padding:10px; }
`;

function printDoc(title, bodyHtml) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${safe(title)}</title><style>${BASE_CSS}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
    setTimeout(() => w.close(), 300);
  }, 250);
}

function header() {
  return `<div class="head"><div><div class="coop">POWASSCO MULTIPURPOSE COOPERATIVE</div><div class="sub">Owak, Asturias, Cebu &nbsp;&bull;&nbsp; C.D.A Reg. No. 9520-07014753</div></div></div>`;
}

function field(label, value) {
  return `<div><div class="lbl">${safe(label)}</div><div class="val">${safe(value)}</div></div>`;
}

function personBlock(title, p = {}) {
  return `
  <div class="box">
    <div class="sec" style="margin-top:0;">${title}</div>
    <div class="grid2">
      ${field("Name", p.name)}
      ${field("Home Address", p.homeAddress)}
      ${field("Date of Birth", p.dateOfBirth)}
      ${field("TIN No.", p.tin)}
      ${field("Tel No.", p.telNo)}
      ${field("Cell No.", p.cellNo)}
      ${field("Civil Status", p.civilStatus)}
      ${field("No. of Dependents", p.dependents)}
      ${field("Name of Spouse", p.spouseName)}
      ${field("Contact No.", p.contactNo)}
    </div>
  </div>`;
}

export function printApplication(loan) {
  const inc = (loan.sourceOfIncome || [])
    .map((r) => `<tr><td>${safe(r.source)}</td><td class="r">₱ ${peso(r.amount)}</td><td>${safe(r.frequency)}</td></tr>`)
    .join("");
  const body = `
    ${header()}
    <div class="title">LOAN APPLICATION FORM</div>
    <div class="row">
      <div style="flex:1">${field("PN No.", loan.borrowerPnNo)}</div>
      <div style="flex:1">${field("Reference Code", loan.referenceCode)}</div>
      <div style="flex:1">${field("Loan ID", loan.loanId)}</div>
    </div>

    <div class="sec">1. Loan Information</div>
    <div class="grid2">
      ${field("Amount Applied (₱)", peso(loan.principal))}
      ${field("Collateral (if any)", loan.collateral)}
      ${field("Term (months)", loan.termMonths)}
      ${field("Mode of Payment", loan.modeOfPayment)}
      ${field("Purpose", loan.purpose)}
      ${field("Interest Rate", `${loan.interestRatePerMonth}% / month`)}
    </div>

    <div class="sec">2. Personal Information</div>
    <div class="grid2">${personBlock("Applicant", loan.applicant)}${personBlock("Co-Maker", loan.coMaker)}</div>

    <div class="sec">3. Source of Income</div>
    <table><thead><tr><th>Source</th><th class="r">Amount</th><th>Frequency</th></tr></thead><tbody>${inc || `<tr><td colspan="3" class="muted">—</td></tr>`}</tbody></table>

    <div class="sec">Cooperative Information</div>
    <div class="grid2">
      <div class="box"><div class="lbl">Applicant</div>
        ${field("Share Capital", peso(loan.cooperative?.applicant?.shareCapital))}
        ${field("Savings", peso(loan.cooperative?.applicant?.savings))}
        ${field("Loan Balance", peso(loan.cooperative?.applicant?.loanBalance))}
      </div>
      <div class="box"><div class="lbl">Co-Maker</div>
        ${field("Share Capital", peso(loan.cooperative?.coMaker?.shareCapital))}
        ${field("Savings", peso(loan.cooperative?.coMaker?.savings))}
        ${field("Loan Balance", peso(loan.cooperative?.coMaker?.loanBalance))}
      </div>
    </div>

    <div class="sign">
      <div class="signbox"><div class="signline">Applicant Signature</div><div class="muted">${dt(loan.appliedAt || loan.createdAt)}</div></div>
      <div class="signbox"><div class="signline">Co-Maker Signature</div><div class="muted">${dt(loan.appliedAt || loan.createdAt)}</div></div>
    </div>
    <div class="sign" style="margin-top:24px;">
      <div class="signbox"><div class="signline">Processed By (Loan Officer)</div></div>
      <div class="signbox"><div class="signline">Approved By (Manager)</div></div>
    </div>`;
  printDoc("Loan Application Form", body);
}

export function printDisclosure(loan) {
  const charges = (loan.charges || [])
    .map((c) => `<tr><td>${safe(c.label)}</td><td>${c.type === "percent" ? c.value + "%" : "—"}</td><td class="r">₱ ${peso(c.amount)}</td></tr>`)
    .join("");
  const sched = (loan.amortizationSchedule || [])
    .map((r) => `<tr><td>${r.period}</td><td class="r">${peso(r.payment)}</td><td class="r">${peso(r.principal)}</td><td class="r">${peso(r.interest)}</td><td class="r">${peso(r.balance)}</td></tr>`)
    .join("");
  const body = `
    ${header()}
    <div class="title">DISCLOSURE STATEMENT OF LOAN</div>
    <div class="row">
      <div style="flex:1">${field("PN No.", loan.borrowerPnNo)}</div>
      <div style="flex:1">${field("Loan ID", loan.loanId)}</div>
      <div style="flex:1">${field("Reference Code", loan.referenceCode)}</div>
    </div>
    <div class="grid2" style="margin-top:8px;">
      ${field("Borrower", loan.borrowerName)}
      ${field("Date", dt(loan.releasedAt || loan.createdAt))}
      ${field("Address", loan.borrowerAddress)}
      ${field("Type of Loan", loan.loanType)}
    </div>

    <div class="sec">A. Loan Granted</div>
    <div class="val" style="font-size:14px;">₱ ${peso(loan.principal)}</div>

    <div class="sec">B. Charges (Add-on)</div>
    <table><thead><tr><th>Charges</th><th>Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>${charges}<tr><td colspan="2" style="font-weight:800;">TOTAL CHARGES</td><td class="r" style="font-weight:800;">₱ ${peso(loan.totalCharges)}</td></tr></tbody>
    </table>

    <div class="sec">C. Net Proceeds</div>
    <div class="val" style="font-size:14px;">₱ ${peso(loan.netProceeds)}</div>

    <div class="sec">D. Payment</div>
    <div class="grid2">
      ${field("Loan Term", `${loan.termMonths} months`)}
      ${field("Total No. of Installments", loan.termMonths)}
      ${field("Date of 1st Installment", dt(loan.firstPaymentDate))}
      ${field("Amount per Installment", `₱ ${peso(loan.monthlyPayment)}`)}
      ${field("Frequency", loan.modeOfPayment)}
      ${field("Interest Rate", `${loan.interestRatePerMonth}% / month (diminishing)`)}
    </div>

    <div class="sec">Loan Amortization Schedule</div>
    <table><thead><tr><th>Period</th><th class="r">Monthly Payment</th><th class="r">Principal</th><th class="r">Interest</th><th class="r">Balance</th></tr></thead>
      <tbody>${sched}<tr><td style="font-weight:800;">TOTAL</td><td class="r" style="font-weight:800;">${peso(loan.totalPayment)}</td><td class="r" style="font-weight:800;">${peso(loan.principal)}</td><td class="r" style="font-weight:800;">${peso(loan.totalInterest)}</td><td class="r">—</td></tr></tbody>
    </table>

    <div class="muted" style="margin-top:14px;">We acknowledge receipt of a copy of this statement prior to the consummation of this loan and fully agree to the terms and conditions thereof.</div>
    <div class="sign">
      <div class="signbox"><div class="signline">Signature over Printed Name of Borrower</div></div>
      <div class="signbox"><div class="signline">Signature over Printed Name of Co-Maker</div></div>
    </div>`;
  printDoc("Disclosure Statement of Loan", body);
}

export function printPromissory(loan) {
  const words = `${peso(loan.principal)}`;
  const body = `
    ${header()}
    <div class="title">PROMISSORY NOTE</div>
    <div class="row">
      <div style="flex:1">${field("PN No.", loan.borrowerPnNo)}</div>
      <div style="flex:1">${field("Loan ID", loan.loanId)}</div>
      <div style="flex:1">${field("Reference Code", loan.referenceCode)}</div>
    </div>
    <div class="row" style="margin-top:8px;">
      <div style="flex:1">${field("Amount", `₱ ${peso(loan.principal)}`)}</div>
      <div style="flex:1">${field("Released Date", dt(loan.releasedAt))}</div>
      <div style="flex:1">${field("Due Date", dt(loan.maturityDate))}</div>
    </div>

    <p style="margin-top:16px; line-height:1.6;">
      For value received, I/we, jointly and severally, promise to pay to <b>POWASSCO MULTIPURPOSE COOPERATIVE</b>
      or its office, the sum of <b>₱ ${words}</b> Philippine Currency on or before <b>${dt(loan.maturityDate)}</b> from date hereof,
      with interest rate of <b>${loan.interestRatePerMonth}%</b> per month diminishing balance; payable per the attached
      amortization schedule, which forms part of this Note.
    </p>
    <p style="line-height:1.6;">
      In case of any default in the agreed payment schedule, the payee is unconditionally entitled to declare all unpaid
      balance as due and demandable. A penalty charge shall be charged on all delayed or unpaid installments. The
      cooperative is authorized to offset or apply any deposits/share capital in the name of the borrower as payment.
    </p>
    <div class="box" style="border-color:#fca5a5; color:#b91c1c; text-align:center; font-weight:700; margin-top:10px;">
      I agree to disconnect my water connection if my loan reaches the due date which I have not paid.
    </div>

    <div class="sign">
      <div class="signbox"><div class="signline">Signature over Printed Name of Maker</div><div class="muted">${safe(loan.borrowerName)}</div></div>
      <div class="signbox"><div class="signline">Signature over Printed Name of Co-Maker</div><div class="muted">${safe(loan.coMaker?.name)}</div></div>
    </div>
    <div class="sign" style="margin-top:24px;">
      <div class="signbox"><div class="signline">Loans Officer</div></div>
      <div class="signbox"><div class="signline">Released By &nbsp; ${dt(loan.releasedAt)}</div></div>
    </div>`;
  printDoc("Promissory Note", body);
}

export function printReceipt({ loan, payment }) {
  const body = `
    ${header()}
    <div class="title">PAYMENT RECEIPT</div>
    <div class="grid2">
      ${field("OR No.", payment.orNo)}
      ${field("Date", dt(payment.paidAt))}
      ${field("Loan ID", loan.loanId)}
      ${field("Reference Code", loan.referenceCode)}
      ${field("Borrower", `${loan.borrowerName} (${loan.borrowerPnNo})`)}
      ${field("Method", payment.method)}
    </div>
    <div class="box" style="margin-top:14px; text-align:center;">
      <div class="lbl">Amount Received</div>
      <div style="font-size:22px; font-weight:800; color:#1e3a8a;">₱ ${peso(payment.amountPaid)}</div>
    </div>
    <div class="grid2" style="margin-top:14px;">
      ${field("Total Payable", `₱ ${peso(loan.totalPayment)}`)}
      ${field("Total Paid", `₱ ${peso(loan.totalPaid)}`)}
      ${field("Remaining Balance", `₱ ${peso(loan.balance)}`)}
      ${field("Status", loan.status)}
    </div>
    <div class="sign">
      <div class="signbox"><div class="signline">Received By</div><div class="muted">${safe(payment.receivedBy)}</div></div>
      <div class="signbox"><div class="signline">Payor Signature</div></div>
    </div>`;
  printDoc(`Receipt ${payment.orNo}`, body);
}
