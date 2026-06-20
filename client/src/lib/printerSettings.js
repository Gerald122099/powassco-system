// Shared receipt-printer preferences + auto-print orchestration for the
// cashier and the field reader. The actual ESC/POS work lives in
// thermalPrint.js; this module owns the "should we auto-print, and is a
// printer ready?" policy so every screen behaves the same.
import { printerConnected, tryReconnect, thermalSupported, connectPrinter, printPaymentReceipt, printReceiptHTML } from "./thermalPrint";

const AUTOPRINT_KEY = "pow_autoprint";
const FALLBACK_KEY = "pow_print_fallback";

// Auto-print is ON by default: after a payment / saved reading the receipt
// goes straight to the connected thermal printer — no dialog, no redirect.
// The cashier/plumber can turn it off in Printer settings.
export function isAutoPrintOn() {
  return localStorage.getItem(AUTOPRINT_KEY) !== "0";
}
export function setAutoPrint(on) {
  try { localStorage.setItem(AUTOPRINT_KEY, on ? "1" : "0"); } catch { /* quota */ }
}

// Default-printer fallback (ON by default): when NO thermal printer is bound,
// print the receipt to the OS default printer as 58mm HTML instead. Lets a
// desktop without WebUSB still auto-print (one Ctrl+P→Enter).
export function isDefaultFallbackOn() {
  return localStorage.getItem(FALLBACK_KEY) !== "0";
}
export function setDefaultFallback(on) {
  try { localStorage.setItem(FALLBACK_KEY, on ? "1" : "0"); } catch { /* quota */ }
}

// Make sure a printer is connected WITHOUT a user gesture (silent reconnect
// of an already-paired device). Returns true if ready to print.
export async function ensurePrinter() {
  if (printerConnected()) return true;
  const name = await tryReconnect();
  return !!name;
}

// Run an auto-print after a payment/reading. Returns one of:
//   { ok: true }                 — printed
//   { ok: false, skipped: true } — auto-print off / not supported
//   { ok: false, needConnect }   — supported + on, but no printer is paired
//   { ok: false, error }         — printer threw while printing
// On needConnect the caller shows the PrinterPrompt so the user can connect
// (inside a click, which Web Bluetooth requires) and print.
export async function autoPrintReceipt(printFn) {
  if (!isAutoPrintOn() || !thermalSupported()) return { ok: false, skipped: true };
  try {
    const ready = await ensurePrinter();
    if (!ready) return { ok: false, needConnect: true };
    await printFn();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Print failed" };
  }
}

// Cashier auto-print: print `descriptor` to the connected USB/BLE thermal
// printer if one is ready; otherwise fall back to the OS default printer
// (58mm HTML) when the fallback is enabled. Returns { ok, via } where via is
// "thermal" | "default", or { needConnect } when nothing could print.
export async function printReceiptSmart(descriptor) {
  if (!isAutoPrintOn()) return { ok: false, skipped: true };
  if (thermalSupported()) {
    try {
      if (await ensurePrinter()) { await printPaymentReceipt(descriptor); return { ok: true, via: "thermal" }; }
    } catch { /* thermal failed — try the default printer */ }
  }
  if (isDefaultFallbackOn()) { printReceiptHTML(descriptor); return { ok: true, via: "default" }; }
  return { ok: false, needConnect: true };
}

// Manual print (user click). Prefers the thermal printer — and since this is
// a user gesture it may show the device picker — then always falls back to
// the OS default printer. Returns { ok, via }.
export async function printReceiptManual(descriptor) {
  if (thermalSupported()) {
    try {
      if (!printerConnected() && !(await tryReconnect())) await connectPrinter();
      await printPaymentReceipt(descriptor);
      return { ok: true, via: "thermal" };
    } catch { /* fall through to the default printer */ }
  }
  printReceiptHTML(descriptor);
  return { ok: true, via: "default" };
}
