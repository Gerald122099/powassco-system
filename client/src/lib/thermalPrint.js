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

export async function connectPrinter() {
  if (!thermalSupported()) {
    throw new Error("Bluetooth printing needs Chrome on Android (HTTPS). Not supported on this device/browser.");
  }
  device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES });
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) {
        characteristic = ch;
        device.addEventListener("gattserverdisconnected", () => {
          characteristic = null;
        });
        return device.name || "Printer";
      }
    }
  }
  throw new Error("No writable characteristic found — this printer may be incompatible.");
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
    row("PN No.", member.pnNo),
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
