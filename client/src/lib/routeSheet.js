// Printable field route sheet — a paper worksheet of the reader's accounts
// (PN, name, address, meter, previous reading + a blank box to write the
// present reading). A backup in case the phone dies in the field.

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const mnorm = (s) => String(s || "").toUpperCase().trim();

export function printRouteSheet(members, { periodKey = "", readerName = "" } = {}) {
  if (!members || members.length === 0) {
    alert("No accounts to print.");
    return;
  }

  let n = 0;
  const rows = members
    .map((m) => {
      const meters = m.activeBillingMeters || [];
      const list = meters.length ? meters : [{ meterNumber: "" }];
      return list
        .map((mt) => {
          n++;
          const prev = m.lastActualReadings?.[mnorm(mt.meterNumber)]?.presentReading ?? "";
          return `<tr>
            <td>${n}</td>
            <td>${esc(m.pnNo)}</td>
            <td>${esc(m.accountName)}</td>
            <td class="addr">${esc(m.addressText || "")}</td>
            <td>${esc(mt.meterNumber)}</td>
            <td class="r">${prev}</td>
            <td class="box"></td>
          </tr>`;
        })
        .join("");
    })
    .join("");

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    alert("Please allow pop-ups to print the route sheet.");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Route Sheet ${esc(periodKey)}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
      .head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #166534; padding-bottom:6px; margin-bottom:8px; }
      .coop { font-size:16px; font-weight:800; color:#166534; }
      .sub { font-size:11px; color:#475569; }
      table { width:100%; border-collapse:collapse; }
      th,td { border:1px solid #cbd5e1; padding:4px 6px; text-align:left; vertical-align:top; }
      thead th { background:#f0fdf4; font-size:10px; text-transform:uppercase; letter-spacing:.3px; }
      td.r { text-align:right; }
      td.box { width:70px; }
      td.addr { font-size:10px; color:#475569; }
      tr { break-inside: avoid; }
    </style></head><body>
      <div class="head">
        <div>
          <div class="coop">POWASSCO — Meter Reading Route Sheet</div>
          <div class="sub">Period: ${esc(periodKey)} ${readerName ? `&nbsp;•&nbsp; Reader: ${esc(readerName)}` : ""}</div>
        </div>
        <div class="sub">${esc(new Date().toLocaleDateString())}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>PN No.</th><th>Account</th><th>Address</th><th>Meter</th><th class="r">Previous</th><th>Present</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`);
  w.document.close();
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    w.focus();
    w.print();
    setTimeout(() => w.close(), 500);
  };
  setTimeout(go, 300);
}
