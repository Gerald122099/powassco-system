// ESC/POS thermal printing over two transports:
//   • Bluetooth (Web Bluetooth) — portable BLE printers, Chrome on Android.
//   • USB (WebUSB)              — desktop receipt printers on a USB cable,
//                                 Chrome/Edge on desktop. No print dialog,
//                                 no re-selecting a driver/default printer.
// Whichever the user connects becomes the active printer for the session and
// silently reconnects next time via getDevices().
import { printHtmlDoc } from "./printHtmlDoc";
import { RECEIPT_FONT_FACE } from "./receiptFont";

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
  let name;
  try {
    name = await bindUSB(dev);
  } catch (e) {
    // Windows binds an installed printer to its own driver (usbprint.sys), so
    // Chrome's WebUSB can't open it — "Access denied". The right fix on a
    // driver-installed printer is the default-printer mode, not direct USB.
    if (/access denied|security|the device is in use|access to this device/i.test(e?.message || "")) {
      throw new Error(
        'Windows is already using this printer through its installed driver, so the browser can’t take it over directly. ' +
        'Switch ON "Print to the default printer" in Printer settings and set this thermal printer as your Windows default — ' +
        'receipts then print through the driver. (Advanced alternative: replace its driver with WinUSB using Zadig to allow direct USB.)'
      );
    }
    throw new Error(e?.message || "Couldn’t open this USB printer.");
  }
  if (!name) throw new Error("Couldn’t open this USB printer — no printable interface found. On Windows it may need the WinUSB/Zadig driver, or another app is using it.");
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
  // Double-strike (ESC G 1) — prints each dot twice so output is DARKER, not
  // faded. Max print density (GS | n / DC2 ~ n is model-specific; double-strike
  // is universally supported and layout-safe).
  darkOn: bytes(0x1b, 0x47, 0x01),
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
    CMD.init, CMD.darkOn,
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
    CMD.init, CMD.darkOn, CMD.center, CMD.big, CMD.boldOn,
    t("POWASSCO\n"),
    CMD.normal,
    t("Multipurpose Cooperative\n"),
    CMD.boldOff,
    t("Brgy. Owak, Asturias, Cebu\n"),
    t("CDA Reg. No. 9520-07014753\n"),
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
  for (const [label, value] of lines) {
    const l = String(label ?? ""), v = String(value ?? "");
    // A label with no value (e.g. "— ON CREDIT (LOAN) —") prints as a centered
    // sub-heading; the usual label/value pair prints as a justified row.
    if (l && !v) { parts.push(CMD.center, CMD.boldOn, t(l + "\n"), CMD.boldOff, CMD.left); }
    else parts.push(row(l, v));
  }
  parts.push(LINE());
  if (total != null) {
    parts.push(CMD.boldOn, CMD.big, row(totalLabel, money(total).replace("PHP ", "P")), CMD.normal, CMD.boldOff);
    parts.push(LINE());
  }
  parts.push(CMD.center);
  if (note) parts.push(t(note + "\n"));
  parts.push(t("This serves as your official receipt.\n"));
  parts.push(CMD.feed3);
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
  // A label-only entry is a centered sub-heading; a value-only entry is a
  // right-aligned amount; otherwise it's a justified label/value row.
  const r = (l, v) => {
    const ls = esc(l), vs = esc(v);
    if (l && !v) return `<div class="sec">${ls}</div>`;
    if (!l && v) return `<div class="r amt"><span></span><span>${vs}</span></div>`;
    return `<div class="r"><span>${ls}</span><span>${vs}</span></div>`;
  };
  const meta = [];
  if (orNo) meta.push(r("OR No.", orNo));
  if (accountName) meta.push(r("Name", accountName));
  if (pnNo) meta.push(r("Account No.", pnNo));
  meta.push(r("Date", new Date().toLocaleString()));
  if (cashierName) meta.push(r("Cashier", cashierName));
  const body = lines.map(([l, v]) => r(l, v)).join("");
  // Receipt style is switchable in Printer Settings (pow_receipt_style):
  //   • "classic"   — original compact Courier New format (DEFAULT).
  //   • "dotmatrix" — embedded bitArray-A2 dot-matrix font, slightly larger.
  // Both keep the full-black, no-fade treatment.
  let style = "classic";
  try { style = localStorage.getItem("pow_receipt_style") || "classic"; } catch { /* ignore */ }
  const F = style === "dotmatrix"
    ? { face: RECEIPT_FONT_FACE, fam: "'bitArray-A2','Courier New','Consolas',monospace", body: 15, lh: 1.32, h1: 23, h1s: 0.35, sub: 12, sec: 14, total: 20, foot: 12 }
    : { face: "", fam: "'Courier New','Consolas',monospace", body: 12, lh: 1.4, h1: 18, h1s: 0.4, sub: 10, sec: 11, total: 16, foot: 9.5 };
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(orNo || title)}</title>
    <style>
      ${F.face}
      @page { size: 58mm auto; margin: 0; }
      /* FULL BLACK, no fade: force #000 on every node, force-print colors,
         disable anti-aliasing (gray edges print faint on thermal), and a glyph
         stroke so strokes burn solid black. */
      * {
        box-sizing: border-box;
        color: #000 !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
        -webkit-font-smoothing: none; font-smooth: never; text-rendering: optimizeLegibility;
        -webkit-text-stroke: 0.22px #000;
      }
      body { width: 58mm; margin: 0; padding: 3mm 2mm; font-family: ${F.fam}; font-size: ${F.body}px; line-height: ${F.lh}; font-weight: 700; }
      .c { text-align: center; }
      h1 { font-size: ${F.h1}px; margin: 0; letter-spacing: 1px; font-weight: 800; -webkit-text-stroke: ${F.h1s}px #000; }
      .sub { font-size: ${F.sub}px; margin: 0; font-weight: 700; }
      .ttl { font-weight: 800; margin: 3px 0; letter-spacing: 1px; }
      .line { border-top: 2px solid #000; margin: 4px 0; }
      .r { display: flex; justify-content: space-between; gap: 6px; }
      .r span:last-child { text-align: right; }
      .amt span:last-child { font-weight: 800; }
      .sec { text-align: center; font-weight: 800; font-size: ${F.sec}px; margin: 3px 0 1px; }
      .total { display: flex; justify-content: space-between; font-weight: 800; font-size: ${F.total}px; margin-top: 3px; border: 2px solid #000; border-radius: 4px; padding: 3px 5px; }
      .foot { font-size: ${F.foot}px; margin-top: 6px; font-weight: 700; }
    </style></head><body>
    <div class="c">
      <h1>POWASSCO</h1>
      <div class="sub">Multipurpose Cooperative</div>
      <div class="sub">Brgy. Owak, Asturias, Cebu</div>
      <div class="sub">CDA Reg. No. 9520-07014753</div>
    </div>
    <div class="line"></div>
    <div class="c ttl">${esc(String(title).toUpperCase())}</div>
    ${meta.join("")}
    <div class="line"></div>
    ${body}
    <div class="line"></div>
    ${total != null ? `<div class="total"><span>${esc(totalLabel)}</span><span>${peso(total)}</span></div>` : ""}
    ${note ? `<div class="c sub" style="margin-top:5px">${esc(note)}</div>` : ""}
    <div class="c foot">This serves as your official receipt.<br/>Printed ${esc(new Date().toLocaleString())}</div>
    </body></html>`;

  // Silent in the desktop app (no dialog, straight to the default/thermal
  // printer at 58mm roll width); hidden-iframe dialog in the browser.
  printHtmlDoc(html, { paper: "58mm" });
}
