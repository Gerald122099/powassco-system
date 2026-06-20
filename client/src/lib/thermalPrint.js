// Web Bluetooth ESC/POS printing for 58mm thermal printers. Works on Chrome
// for Android over HTTPS. The printer connection is kept for the session.

// Common services exposed by cheap BLE thermal printers (and Nordic UART).
const OPTIONAL_SERVICES = [
  0x18f0, 0xff00, 0xffe0, 0xffb0,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
];

let device = null;
let characteristic = null;

export function thermalSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}
export function printerConnected() {
  return !!characteristic && !!device?.gatt?.connected;
}
export function printerName() {
  return device?.name || "";
}

// Walk a connected GATT server and latch onto the first writable
// characteristic (where ESC/POS bytes go). Shared by connect + reconnect.
async function bindWritable(dev) {
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

export async function connectPrinter() {
  if (!thermalSupported()) {
    throw new Error("Bluetooth printing needs Chrome on Android (HTTPS). Not supported on this device/browser.");
  }
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES });
  const name = await bindWritable(dev);
  if (!name) throw new Error("No writable characteristic found — this printer may be incompatible.");
  return name;
}

// Silently reconnect a printer this browser was already paired with — no
// device-picker, so it can run AFTER a payment (no user gesture needed).
// Chrome exposes previously-granted devices via getDevices(). Returns the
// printer name on success, or null if none can be reconnected.
export async function tryReconnect() {
  if (printerConnected()) return printerName();
  if (!thermalSupported() || typeof navigator.bluetooth.getDevices !== "function") return null;
  try {
    const devices = await navigator.bluetooth.getDevices();
    for (const d of devices) {
      try {
        const name = await bindWritable(d);
        if (name) return name;
      } catch { /* try the next paired device */ }
    }
  } catch { /* getDevices unavailable / not permitted */ }
  return null;
}

async function write(bytes) {
  if (!characteristic) throw new Error("Printer not connected.");
  const CHUNK = 180;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.slice(i, i + CHUNK);
    if (characteristic.properties.writeWithoutResponse) await characteristic.writeValueWithoutResponse(slice);
    else await characteristic.writeValue(slice);
    await new Promise((r) => setTimeout(r, 18));
  }
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
