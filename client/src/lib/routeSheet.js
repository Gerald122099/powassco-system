// Printable field route sheet — a paper worksheet of the reader's accounts
// (PN, name, address, meter, previous reading + a blank box to write the
// present reading). A backup in case the phone dies in the field.

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const mnorm = (s) => String(s || "").toUpperCase().trim();

export function printRouteSheet(members, { periodKey = "", readerName = "" } = {}) {
  try {
    if (!members || members.length === 0) {
      alert("No accounts to print. Pick a purok or clear the filter first.");
      return;
    }
    // With the open-pool model `members` can be the WHOLE barangay. Rendering
    // thousands of rows can freeze a phone — and a route sheet is meant per
    // purok anyway — so confirm before building a very large sheet.
    if (members.length > 300 &&
        !window.confirm(`This will print ${members.length} accounts. That's a lot of paper and may be slow on a phone. Tip: select a purok first to print just that route.\n\nPrint all anyway?`)) {
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
              <td class="addr">${esc(m.addressText || m.purok || "")}</td>
              <td>${esc(mt.meterNumber)}</td>
              <td class="r">${esc(prev)}</td>
              <td class="box"></td>
            </tr>`;
          })
          .join("");
      })
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Route Sheet ${esc(periodKey)}</title>
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
          <thead><tr><th>#</th><th>Account No.</th><th>Account</th><th>Purok / Address</th><th>Meter</th><th class="r">Previous</th><th>Present</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>`;

    printHtml(html);
  } catch (e) {
    // Never let the route sheet crash the field app — surface the error.
    alert("Could not open the route sheet: " + (e?.message || e));
  }
}

// Print an HTML document via a hidden iframe. Reliable inside an installed /
// standalone PWA where window.open("_blank") is blocked or crashes the
// WebView. Falls back to a new tab if the iframe can't print.
function printHtml(html) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  let done = false;
  const cleanup = () => setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 2000);
  const go = () => {
    if (done) return;
    done = true;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      cleanup();
    } catch {
      // Last-resort fallback: open in a new tab so the user can print/share.
      try {
        const w = window.open("", "_blank");
        if (w) { w.document.open(); w.document.write(html); w.document.close(); }
        else alert("Allow pop-ups to view the route sheet.");
      } catch { alert("Printing isn’t available on this device."); }
      cleanup();
    }
  };

  iframe.onload = go;
  const doc = iframe.contentWindow?.document;
  if (!doc) { alert("Printing isn’t available on this device."); cleanup(); return; }
  doc.open(); doc.write(html); doc.close();
  setTimeout(go, 500); // safety net if onload doesn't fire on document.write
}
