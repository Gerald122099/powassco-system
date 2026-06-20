// Shared receipt-printer preferences + auto-print orchestration for the
// cashier and the field reader. The actual ESC/POS work lives in
// thermalPrint.js; this module owns the "should we auto-print, and is a
// printer ready?" policy so every screen behaves the same.
import { printerConnected, tryReconnect, thermalSupported } from "./thermalPrint";

const AUTOPRINT_KEY = "pow_autoprint";

// Auto-print is ON by default: after a payment / saved reading the receipt
// goes straight to the connected Bluetooth thermal printer — no dialog, no
// page redirect. The cashier/plumber can turn it off in Printer settings.
export function isAutoPrintOn() {
  return localStorage.getItem(AUTOPRINT_KEY) !== "0";
}
export function setAutoPrint(on) {
  try { localStorage.setItem(AUTOPRINT_KEY, on ? "1" : "0"); } catch { /* quota */ }
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
