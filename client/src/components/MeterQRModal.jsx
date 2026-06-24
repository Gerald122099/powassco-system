import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Modal from "./Modal";
import { printHtmlDoc } from "../lib/printHtmlDoc";
import { encodeMeterQR } from "../lib/meterQr";
import { Printer } from "lucide-react";

// Shows the QR for a registered meter and prints it as a stick-on label.
export default function MeterQRModal({ open, onClose, pnNo, meterNumber, accountName }) {
  const [dataUrl, setDataUrl] = useState("");
  const payload = encodeMeterQR(pnNo, meterNumber);

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(payload, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [open, payload]);

  function printLabel() {
    if (!dataUrl) return;
    printHtmlDoc(`<!doctype html><html><head><meta charset="utf-8"/><title>Meter QR ${meterNumber}</title>
      <style>
        @page { size: 58mm 70mm; margin: 3mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; text-align:center; color:#0f172a; margin:0; padding:6px; }
        .coop { font-size:12px; font-weight:800; color:#166534; }
        img { width: 46mm; height: 46mm; }
        .nm { font-size:12px; font-weight:700; margin-top:2px; }
        .id { font-size:13px; font-weight:800; letter-spacing:.3px; }
        .sub { font-size:10px; color:#475569; }
      </style></head><body>
        <div class="coop">POWASSCO</div>
        <img src="${dataUrl}" alt="QR"/>
        <div class="id">${pnNo} &nbsp;•&nbsp; ${meterNumber}</div>
        ${accountName ? `<div class="nm">${accountName}</div>` : ""}
        <div class="sub">Scan to encode reading</div>
      </body></html>`);
  }

  return (
    <Modal open={open} title="Meter QR Code" subtitle={`${pnNo} • ${meterNumber}`} onClose={onClose} size="sm">
      <div className="flex flex-col items-center gap-3">
        {dataUrl ? (
          <img src={dataUrl} alt="Meter QR" className="h-56 w-56 rounded-xl border border-slate-200 p-2" />
        ) : (
          <div className="flex h-56 w-56 items-center justify-center text-sm text-slate-400">Generating…</div>
        )}
        {accountName && <div className="text-sm font-semibold text-slate-800">{accountName}</div>}
        <div className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-xs text-slate-600">{payload}</div>
        <button
          onClick={printLabel}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Printer size={16} /> Print Label
        </button>
        <p className="text-center text-xs text-slate-400">Stick this on the physical meter. Field readers scan it to pull up the account and encode a reading.</p>
      </div>
    </Modal>
  );
}
