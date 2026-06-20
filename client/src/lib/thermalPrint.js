// ESC/POS thermal printing over two transports:
//   • Bluetooth (Web Bluetooth) — portable BLE printers, Chrome on Android.
//   • USB (WebUSB)              — desktop receipt printers on a USB cable,
//                                 Chrome/Edge on desktop. No print dialog,
//                                 no re-selecting a driver/default printer.
// Whichever the user connects becomes the active printer for the session and
// silently reconnects next time via getDevices().

// Common services exposed by cheap BLE thermal printers (and Nordic UART).
const OPTIONAL_SERVICES = [
  0x18f0, 0xff00, 0xffe0, 0xffb0,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
];

// ── Bluetooth (BLE) state ──
let device = null;
let characteristic = null;
// ── USB (WebUSB) state ──
let usbDevice = null;
let usbEpOut = null;

export function bluetoothSupported() { return typeof navigator !== "undefined" && !!navigator.bluetooth; }
export function usbSupported() { return typeof navigator !== "undefined" && !!navigator.usb; }
export function thermalSupported() { return bluetoothSupported() || usbSupported(); }

export function usbConnected() { return !!usbEpOut && !!usbDevice?.opened; }
export function bleConnected() { return !!characteristic && !!device?.gatt?.connected; }
export function printerConnected() { return usbConnected() || bleConnected(); }
export function printerTransport() { return usbConnected() ? "usb" : bleConnected() ? "ble" : null; }
export function printerName() {
  if (usbConnected()) return usbDevice.productName || `USB Printer ${usbDevice.productId || ""}`.trim();
  if (bleConnected()) return device?.name || "Printer";
  return "";
}

// ── Bluetooth ───────────────────────────────────────────────────────────
// Walk a connected GATT server and latch onto the first writable
// characteristic (where ESC/POS bytes go). Shared by connect + reconnect.
async function bindBLE(dev) {
  const server = await dev.gatt.connect();
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) {
        device = dev;
        characteristic = ch;
        dev.addEventListener("gattserverdisconnected", () => { characteristic = null; });
        return dev.name || "Printer";
      }
    }
  }
  return null;
}

export async function connectPrinterBLE() {
  if (!bluetoothSupported()) {
    throw new Error("Bluetooth printing needs Chrome on Android (HTTPS). Not supported here.");
  }
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES });
  const name = await bindBLE(dev);
  if (!name) throw new Error("No writable characteristic found — this printer may be incompatible.");
  return name;
}

async function reconnectBLE() {
  if (!bluetoothSupported() || typeof navigator.bluetooth.getDevices !== "function") return null;
  try {
    const devices = await navigator.bluetooth.getDevices();
    for (const d of devices) {
      try { const name = await bindBLE(d); if (name) return name; } catch { /* next */ }
    }
  } catch { /* not permitted */ }
  return null;
}

// ── USB ─────────────────────────────────────────────────────────────────
// Open a USB receipt printer and latch onto its bulk-OUT endpoint.
async function bindUSB(dev) {
  await dev.open();
  if (!dev.configuration) await dev.selectConfiguration(1);
  for (const iface of dev.configuration.interfaces) {
    for (const alt of iface.alternates) {
      // Prefer the printer class (7), but accept any bulk-OUT endpoint.
      const ep = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (!ep) continue;
      try { await dev.claimInterface(iface.interfaceNumber); }
      catch { continue; } // interface busy (OS driver owns it) — try next
      usbDevice = dev;
      usbEpOut = ep.endpointNumber;
      return printerName();
    }
  }
  try { await dev.close(); } catch { /* ignore */ }
  return null;
}

export async function connectPrinterUSB() {
  if (!usbSupported()) throw new Error("USB printing needs Chrome/Edge on desktop (HTTPS).");
  const dev = await navigator.usb.requestDevice({ filters: [] }); // user picks the printer
  const name = await bindUSB(dev);
  if (!name) throw new Error("Couldn’t open this USB printer. On Windows it may need the WinUSB/Zadig driver, or another app is using it.");
  return name;
}

async function reconnectUSB() {
  if (!usbSupported()) return null;
  try {
    const devices = await navigator.usb.getDevices();
    for (const d of devices) {
      try { const name = await bindUSB(d); if (name) return name; } catch { /* next */ }
    }
  } catch { /* not permitted */ }
  return null;
}

// ── Unified connect / reconnect ───────────────────────────────────────────
// Back-compat: connectPrinter() picks USB on desktop, Bluetooth on mobile.
export async function connectPrinter() {
  // A touch device with Bluetooth (phone/tablet) → BLE; otherwise USB.
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || "");
  if (mobile && bluetoothSupported()) return connectPrinterBLE();
  if (usbSupported()) return connectPrinterUSB();
  if (bluetoothSupported()) return connectPrinterBLE();
  throw new Error("No supported printer transport on this device/browser.");
}

// Silently reconnect a printer this browser was already granted — no picker,
// so it can run AFTER a payment (no user gesture). Tries USB then Bluetooth.
export async function tryReconnect() {
  if (printerConnected()) return printerName();
  return (await reconnectUSB()) || (await reconnectBLE());
}

// ── Unified write ─────────────────────────────────────────────────────────
async function write(bytes) {
  if (usbConnected()) {
    const CHUNK = 16384;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      await usbDevice.transferOut(usbEpOut, bytes.slice(i, i + CHUNK));
    }
    return;
  }
  if (bleConnected()) {
    const CHUNK = 180;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.slice(i, i + CHUNK);
      if (characteristic.properties.writeWithoutResponse) await characteristic.writeValueWithoutResponse(slice);
      else await characteristic.writeValue(slice);
      await new Promise((r) => setTimeout(r, 18));
    }
    return;
  }
  throw new Error("Printer not connected.");
}

// ---- ESC/POS builder ----
const enc = new TextEncoder();
function t(s) {
  // Thermal fonts rarely have the peso glyph; render as "PHP".
  return enc.encode(String(s).replace(/₱/g, "PHP "));
}
function bytes(...a) {
  return Uint8Array.from(a);
}
function join(parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const CMD = {
  init: bytes(0x1b, 0x40),
  left: bytes(0x1b, 0x61, 0x00),
  center: bytes(0x1b, 0x61, 0x01),
  boldOn: bytes(0x1b, 0x45, 0x01),
  boldOff: bytes(0x1b, 0x45, 0x00),
  big: bytes(0x1d, 0x21, 0x11),
  normal: bytes(0x1d, 0x21, 0x00),
  feed3: bytes(0x0a, 0x0a, 0x0a),
};
const NL = bytes(0x0a);
const LINE = (ch = "-") => t(ch.repeat(32) + "\n");

function money(n) {
  return "PHP " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Left label + right value on a 32-char line
function row(label, value) {
  const v = String(value);
  const l = String(label);
  const pad = Math.max(1, 32 - l.length - v.length);
  return t(l + " ".repeat(pad) + v + "\n");
}

export async function printWaterReceipt({ member, meter, previous, present, consumed, calc, periodKey }) {
  const parts = [
    CMD.init,
    CMD.center,
    CMD.big,
    CMD.boldOn,
    t("POWASSCO\n"),
    CMD.normal,
    CMD.boldOff,
    t("Brgy. Owak, Asturias, Cebu\n"),
    LINE(),
    CMD.boldOn,
    t("WATER BILL\n"),
    CMD.boldOff,
    CMD.left,
    row("Account", String(member.accountName || "").slice(0, 22)),
    row("Account No.", member.pnNo),
    row("Meter", meter.meterNumber),
    row("Period", periodKey),
    LINE(),
    row("Previous", String(previous)),
    row("Present", String(present)),
    row("Used (m3)", String(consumed)),
  ];
  if (calc?.tariffUsed) parts.push(row("Tier", `${calc.tariffUsed.tier} @ ${calc.tariffUsed.ratePerCubic}`));
  parts.push(LINE());
  if (calc) {
    parts.push(row("Base Amount", money(calc.baseAmount)));
    if (calc.discount > 0) parts.push(row(`Disc ${calc.discountReason || ""}`.trim(), "-" + money(calc.discount)));
    parts.push(CMD.boldOn, CMD.big, row("TOTAL", money(calc.amount).replace("PHP ", "P")), CMD.normal, CMD.boldOff);
  } else {
    parts.push(t("Amount: see office\n"));
  }
  parts.push(
    LINE(),
    CMD.center,
    t("This is a provisional reading slip.\n"),
    t(new Date().toLocaleString() + "\n"),
    t("Thank you!\n"),
    CMD.feed3
  );
  await write(join(parts));
}

// Generic OR / payment receipt — used by the cashier for water, loan,
// savings and product-sale collections. `lines` is an array of
// [label, value] rows; `total` prints big + bold at the bottom.
export async function printPaymentReceipt({
  title = "OFFICIAL RECEIPT",
  accountName,
  pnNo,
  orNo,
  cashierName,
  lines = [],
  total,
  totalLabel = "TOTAL PAID",
  note = "Keep this receipt. Thank you!",
}) {
  const parts = [
    CMD.init, CMD.center, CMD.big, CMD.boldOn,
    t("POWASSCO\n"),
    CMD.normal, CMD.boldOff,
    t("Brgy. Owak, Asturias, Cebu\n"),
    LINE(),
    CMD.boldOn, t(String(title).toUpperCase() + "\n"), CMD.boldOff,
    CMD.left,
  ];
  if (orNo) parts.push(row("OR No.", String(orNo)));
  if (accountName) parts.push(row("Name", String(accountName).slice(0, 22)));
  if (pnNo) parts.push(row("Account No.", String(pnNo)));
  parts.push(row("Date", new Date().toLocaleString()));
  if (cashierName) parts.push(row("Cashier", String(cashierName).slice(0, 20)));
  parts.push(LINE());
  for (const [label, value] of lines) parts.push(row(String(label), String(value)));
  parts.push(LINE());
  if (total != null) {
    parts.push(CMD.boldOn, CMD.big, row(totalLabel, money(total).replace("PHP ", "P")), CMD.normal, CMD.boldOff);
    parts.push(LINE());
  }
  parts.push(CMD.center);
  if (note) parts.push(t(note + "\n"));
  parts.push(t(new Date().toLocaleString() + "\n"), CMD.feed3);
  await write(join(parts));
}

// FALLBACK for desktops with no WebUSB/Bluetooth printer bound: render the
// SAME receipt as 58mm HTML and print it to the OS DEFAULT printer via a
// hidden iframe. With the thermal printer set as the Windows default this is
// one Ctrl+P→Enter (or silent in kiosk mode) — no driver fiddling. Takes the
// same descriptor as printPaymentReceipt().
export function printReceiptHTML({
  title = "OFFICIAL RECEIPT",
  accountName,
  pnNo,
  orNo,
  cashierName,
  lines = [],
  total,
  totalLabel = "TOTAL PAID",
  note = "Keep this receipt. Thank you!",
}) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const peso = (n) => "P" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const r = (l, v) => `<div class="r"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  const meta = [];
  if (orNo) meta.push(r("OR No.", orNo));
  if (accountName) meta.push(r("Name", accountName));
  if (pnNo) meta.push(r("Account No.", pnNo));
  meta.push(r("Date", new Date().toLocaleString()));
  if (cashierName) meta.push(r("Cashier", cashierName));
  const body = lines.map(([l, v]) => r(l, v)).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(orNo || title)}</title>
    <style>
      @page { size: 58mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body { width: 58mm; margin: 0; padding: 3mm 2mm; font-family: 'Courier New', monospace; font-size: 11px; color: #000; }
      .c { text-align: center; }
      h1 { font-size: 16px; margin: 0; }
      .sub { font-size: 10px; margin: 0; }
      .ttl { font-weight: bold; margin: 3px 0; }
      .line { border-top: 1px dashed #000; margin: 4px 0; }
      .r { display: flex; justify-content: space-between; gap: 6px; }
      .r span:last-child { text-align: right; }
      .total { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 3px; }
    </style></head><body>
    <div class="c"><h1>POWASSCO</h1><div class="sub">Brgy. Owak, Asturias, Cebu</div></div>
    <div class="line"></div>
    <div class="c ttl">${esc(String(title).toUpperCase())}</div>
    ${meta.join("")}
    <div class="line"></div>
    ${body}
    <div class="line"></div>
    ${total != null ? `<div class="total"><span>${esc(totalLabel)}</span><span>${peso(total)}</span></div><div class="line"></div>` : ""}
    ${note ? `<div class="c sub">${esc(note)}</div>` : ""}
    </body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  let done = false;
  const doPrint = () => {
    if (done) return; done = true;
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* ignore */ }
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 1500);
  };
  iframe.onload = doPrint;
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  // Safety net if onload doesn't fire (some engines on document.write).
  setTimeout(doPrint, 500);
}
