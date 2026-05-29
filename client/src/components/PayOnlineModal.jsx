import { useEffect, useState } from "react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { CheckCircle2 } from "lucide-react";

function peso(n) {
  return "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// target: { module:"water", label, amountDue, pnNo, meterNumber, periodKey }
//      or { module:"loan", label, amountDue, loanId }
export default function PayOnlineModal({ open, target, onClose }) {
  const [info, setInfo] = useState(null);
  const [referenceId, setReferenceId] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr(""); setDone(""); setReferenceId(""); setPayerName(""); setPayerPhone("");
    apiFetch("/public/payments/info").then(setInfo).catch((e) => setErr(e.message));
  }, [open]);

  if (!target) return null;
  const dueRounded = Math.ceil(Number(target.amountDue) || 0);
  const fee = Number(info?.onlineFee) || 0;
  const totalToPay = dueRounded + fee;
  const realtime = info?.realtime;

  async function submit(e) {
    e.preventDefault();
    if (!referenceId.trim()) return setErr("Enter your payment reference / transaction ID.");
    setErr(""); setBusy(true);
    try {
      const body = {
        module: target.module,
        referenceId: referenceId.trim(),
        amountPaid: totalToPay,
        amountDue: dueRounded,
        payerName,
        payerPhone,
        ...(target.module === "water"
          ? { pnNo: target.pnNo, meterNumber: target.meterNumber, periodKey: target.periodKey }
          : { loanId: target.loanId }),
      };
      const res = await apiFetch("/public/payments/submit", { method: "POST", body });
      setDone(res.message || "Payment submitted.");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Pay Online (QR PH)" subtitle={target.label} onClose={onClose} size="sm">
      {done ? (
        <div className="py-4 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={44} />
          <div className="mt-2 font-bold text-slate-900">Submitted</div>
          <p className="mt-1 text-sm text-slate-600">{done}</p>
          <button onClick={onClose} className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Done</button>
        </div>
      ) : realtime ? (
        <div className="py-4 text-center text-sm text-slate-600">
          Realtime online payment is being set up. For now, please pay at the office. Thank you!
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-2xl border border-slate-200 p-3 text-center">
            {info?.qrImage ? (
              <img src={info.qrImage} alt="QR PH" className="mx-auto h-48 w-48 object-contain" />
            ) : (
              <div className="py-8 text-sm text-slate-400">QR code not yet configured. Please pay at the office.</div>
            )}
            {info?.payeeName && <div className="mt-1 text-sm font-semibold text-slate-700">{info.payeeName}</div>}
          </div>

          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Amount due (rounded up)</span><span className="font-semibold">{peso(dueRounded)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Online fee</span><span className="font-semibold">{peso(fee)}</span></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1"><span className="font-bold text-slate-800">Pay exactly</span><span className="font-extrabold text-emerald-700">{peso(totalToPay)}</span></div>
          </div>
          <p className="text-xs text-slate-500">Pay the <b>exact</b> amount above. Cents are rounded up (e.g. ₱200.34 → ₱201). {info?.instructions}</p>

          <div>
            <label className="text-xs font-semibold text-slate-600">Reference / Transaction ID *</label>
            <input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} placeholder="From your GCash/Maya/bank receipt" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Your name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} placeholder="Contact no." className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>

          {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

          <button disabled={busy} className="w-full rounded-2xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {busy ? "Submitting…" : "I've paid — Submit reference"}
          </button>
          <p className="text-center text-xs text-slate-400">Online payments are verified and posted within 2–3 working days.</p>
        </form>
      )}
    </Modal>
  );
}
