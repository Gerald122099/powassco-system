// Reusable receipt-printer settings card — used by the cashier (Settings
// tab) and available to the field reader. Lets the user pick/connect a
// Bluetooth thermal printer, reconnect a previously-paired one, run a test
// print, and toggle auto-print after payments on/off.
import { useEffect, useState } from "react";
import Card from "./Card";
import { toast } from "./Toast";
import { connectPrinter, tryReconnect, printerConnected, printerName, thermalSupported, printPaymentReceipt } from "../lib/thermalPrint";
import { isAutoPrintOn, setAutoPrint } from "../lib/printerSettings";
import { Bluetooth, Printer, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";

export default function PrinterSettings({ cashierName = "" }) {
  const supported = thermalSupported();
  const [connected, setConnected] = useState(printerConnected());
  const [name, setName] = useState(printerName());
  const [busy, setBusy] = useState("");
  const [autoPrint, setAuto] = useState(isAutoPrintOn());

  // Try a silent reconnect on mount so a printer paired earlier shows as
  // ready without the user re-picking it.
  useEffect(() => {
    if (!supported || printerConnected()) return;
    tryReconnect().then((n) => { if (n) { setConnected(true); setName(n); } }).catch(() => {});
  }, [supported]);

  async function connect() {
    setBusy("connect");
    try {
      const n = await connectPrinter();
      setConnected(true); setName(n);
      toast.success(`Printer connected: ${n}`);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(""); }
  }

  async function test() {
    setBusy("test");
    try {
      if (!printerConnected() && !(await tryReconnect())) { await connectPrinter(); }
      setConnected(printerConnected()); setName(printerName());
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

  return (
    <Card>
      <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
        <Printer size={20} className="text-emerald-600" /> Receipt Printer
      </div>
      <div className="mt-0.5 text-sm text-slate-600">
        Connect a Bluetooth thermal printer to auto-print receipts after each payment — no print dialog, no page redirect.
      </div>

      {!supported ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>This device/browser doesn’t support Bluetooth printing. Use <b>Chrome on Android</b> over HTTPS. (On a desktop, use the browser’s print button instead.)</div>
        </div>
      ) : (
        <>
          {/* Status */}
          <div className={`mt-4 flex items-center justify-between rounded-2xl border px-4 py-3 ${connected ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center gap-2 text-sm">
              {connected ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Bluetooth size={18} className="text-slate-400" />}
              <span className={connected ? "font-semibold text-emerald-800" : "text-slate-500"}>
                {connected ? `Connected: ${name || "Printer"}` : "No printer connected"}
              </span>
            </div>
            <button onClick={connect} disabled={busy === "connect"} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy === "connect" ? <RefreshCw size={14} className="animate-spin" /> : <Bluetooth size={14} />}
              {connected ? "Change" : "Connect"}
            </button>
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

          <div className="mt-3">
            <button onClick={test} disabled={busy === "test"} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
              {busy === "test" ? <RefreshCw size={14} className="animate-spin" /> : <Printer size={14} />}
              Test print
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
