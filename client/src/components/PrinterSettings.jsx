// Reusable receipt-printer settings card — used by the cashier (Settings
// tab) and available to the field reader. Connects a thermal printer over
// USB (desktop cable) or Bluetooth (portable), shows a clear READY status,
// runs a test print, and toggles auto-print after payments on/off.
import { useEffect, useState } from "react";
import Card from "./Card";
import { toast } from "./Toast";
import {
  connectPrinterUSB, connectPrinterBLE, tryReconnect,
  printerConnected, printerName, printerTransport,
  usbSupported, bluetoothSupported, thermalSupported, printPaymentReceipt,
} from "../lib/thermalPrint";
import { isAutoPrintOn, setAutoPrint, isDefaultFallbackOn, setDefaultFallback } from "../lib/printerSettings";
import { Bluetooth, Printer, CheckCircle2, RefreshCw, AlertTriangle, Usb } from "lucide-react";

export default function PrinterSettings({ cashierName = "" }) {
  const supported = thermalSupported();
  const [connected, setConnected] = useState(printerConnected());
  const [name, setName] = useState(printerName());
  const [transport, setTransport] = useState(printerTransport());
  const [busy, setBusy] = useState("");
  const [autoPrint, setAuto] = useState(isAutoPrintOn());
  const [fallback, setFallback] = useState(isDefaultFallbackOn());

  function syncStatus() {
    setConnected(printerConnected());
    setName(printerName());
    setTransport(printerTransport());
  }

  // Try a silent reconnect on mount so a printer connected earlier shows as
  // READY without the user re-picking it.
  useEffect(() => {
    if (!supported || printerConnected()) return;
    tryReconnect().then((n) => { if (n) syncStatus(); }).catch(() => {});
  }, [supported]);

  async function connect(kind) {
    setBusy(kind);
    try {
      const n = kind === "usb" ? await connectPrinterUSB() : await connectPrinterBLE();
      syncStatus();
      toast.success(`Printer ready: ${n}`);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(""); }
  }

  async function test() {
    setBusy("test");
    try {
      if (!printerConnected() && !(await tryReconnect())) throw new Error("Connect a printer first.");
      syncStatus();
      await printPaymentReceipt({
        title: "TEST PRINT",
        accountName: "Juan Dela Cruz",
        orNo: "TEST-0001",
        cashierName,
        lines: [["Sample item", "P100.00"]],
        total: 100,
        note: "Printer is working.",
      });
      toast.success("Test receipt sent.");
    } catch (e) { toast.error("Test print failed: " + e.message); }
    finally { setBusy(""); }
  }

  function toggleAuto(on) {
    setAuto(on);
    setAutoPrint(on);
    toast.success(on ? "Auto-print ON — receipts print after each payment." : "Auto-print OFF.");
  }
  function toggleFallback(on) {
    setFallback(on);
    setDefaultFallback(on);
    toast.success(on ? "Fallback ON — prints to the default printer when no thermal printer." : "Fallback OFF.");
  }

  return (
    <Card>
      <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
        <Printer size={20} className="text-emerald-600" /> Receipt Printer
      </div>
      <div className="mt-0.5 text-sm text-slate-600">
        Connect a thermal printer to auto-print receipts after each payment — no print dialog, no re-selecting a driver. Use the <b>USB</b> cable on a desktop, or <b>Bluetooth</b> on a phone/tablet.
      </div>

      {!supported ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>This browser can’t talk to printers directly. Use <b>Chrome or Edge</b> over HTTPS. (You can still use the browser’s print button as a fallback.)</div>
        </div>
      ) : (
        <>
          {/* READY status */}
          <div className={`mt-4 flex items-center justify-between rounded-2xl border px-4 py-3 ${connected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center gap-2 text-sm">
              {connected ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Printer size={18} className="text-slate-400" />}
              <span className={connected ? "font-bold text-emerald-800" : "text-slate-500"}>
                {connected
                  ? <>READY · {name} <span className="ml-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{transport}</span></>
                  : "No printer connected"}
              </span>
            </div>
            <button onClick={() => { setBusy("recheck"); tryReconnect().then(syncStatus).finally(() => setBusy("")); }} disabled={busy === "recheck"} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-50" title="Re-check connection">
              <RefreshCw size={13} className={busy === "recheck" ? "animate-spin" : ""} /> Re-check
            </button>
          </div>

          {/* Connect buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {usbSupported() && (
              <button onClick={() => connect("usb")} disabled={busy === "usb"} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy === "usb" ? <RefreshCw size={14} className="animate-spin" /> : <Usb size={14} />}
                {connected && transport === "usb" ? "Change USB printer" : "Connect USB printer"}
              </button>
            )}
            {bluetoothSupported() && (
              <button onClick={() => connect("ble")} disabled={busy === "ble"} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                {busy === "ble" ? <RefreshCw size={14} className="animate-spin" /> : <Bluetooth size={14} />}
                {connected && transport === "ble" ? "Change Bluetooth" : "Connect Bluetooth"}
              </button>
            )}
          </div>

          {/* Auto-print toggle */}
          <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
            <div className="text-sm">
              <div className="font-semibold text-slate-800">Auto-print receipt after payment</div>
              <div className="text-xs text-slate-500">When off, you can still print manually from the receipt screen.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoPrint}
              onClick={() => toggleAuto(!autoPrint)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${autoPrint ? "bg-emerald-600" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${autoPrint ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>

          {/* Default-printer fallback toggle */}
          <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
            <div className="text-sm">
              <div className="font-semibold text-slate-800">Fall back to the default printer</div>
              <div className="text-xs text-slate-500">When no thermal printer is connected, print the 58mm receipt to your computer’s default printer instead.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={fallback}
              onClick={() => toggleFallback(!fallback)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${fallback ? "bg-emerald-600" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${fallback ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>

          <div className="mt-3">
            <button onClick={test} disabled={busy === "test"} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
              {busy === "test" ? <RefreshCw size={14} className="animate-spin" /> : <Printer size={14} />}
              Test print
            </button>
          </div>

          <div className="mt-3 text-[11px] text-slate-400">
            Tip (Windows USB): if “Connect USB printer” can’t open the printer, it’s usually because the OS print driver is holding it. Install the <b>WinUSB</b> driver for the printer (e.g. via Zadig) to let the browser print directly — or keep auto-print off and use the browser print button.
          </div>
        </>
      )}
    </Card>
  );
}
