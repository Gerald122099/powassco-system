// Shown after a payment / saved reading when auto-print is ON but no
// printer is connected. The Connect button runs INSIDE this click — a user
// gesture — so Web Bluetooth's requestDevice() is allowed; then it prints
// the pending receipt. "Skip" just dismisses (the manual print button on the
// screen remains as a fallback).
import { useState } from "react";
import Modal from "./Modal";
import { connectPrinter } from "../lib/thermalPrint";
import { Bluetooth, Printer } from "lucide-react";

export default function PrinterPrompt({ open, onClose, printFn, onPrinted }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function connectAndPrint() {
    setBusy(true); setErr("");
    try {
      await connectPrinter();          // shows the Bluetooth device picker
      await printFn?.();               // then prints the held receipt
      onPrinted?.();
      onClose?.();
    } catch (e) {
      setErr(e?.message || "Could not connect to a printer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Printer not connected" onClose={onClose} size="sm">
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-2 text-slate-600">
          <Printer size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <p>Connect your Bluetooth thermal printer to print the receipt. It stays connected for the rest of your shift.</p>
        </div>
        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Skip</button>
          <button onClick={connectAndPrint} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            <Bluetooth size={16} /> {busy ? "Connecting…" : "Connect & print"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
