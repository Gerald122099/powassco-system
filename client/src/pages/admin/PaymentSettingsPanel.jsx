import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { fileToResizedDataUrl } from "../../lib/imageResize";
import { CreditCard, ImagePlus, Save, RefreshCw, Info } from "lucide-react";

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

export default function PaymentSettingsPanel() {
  const { token } = useAuth();
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  async function load() {
    setLoading(true);
    setErr("");
    try {
      setS(await apiFetch("/payments/settings", { token }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function onPickQR(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { set("qrImage", await fileToResizedDataUrl(file, 700, 0.9)); }
    catch (e2) { setErr(e2.message); }
  }

  async function save() {
    setErr(""); setSaving(true);
    try {
      const updated = await apiFetch("/payments/settings", {
        method: "PUT",
        token,
        body: {
          mode: s.mode,
          qrImage: s.qrImage,
          onlineFee: Number(s.onlineFee) || 0,
          payeeName: s.payeeName,
          instructions: s.instructions,
          paymongoSecretKey: s.paymongoSecretKey,
          paymongoPublicKey: s.paymongoPublicKey,
          xenditApiKey: s.xenditApiKey,
          pspActive: s.pspActive,
        },
      });
      setS(updated);
      setToast("Payment settings saved.");
      setTimeout(() => setToast(""), 2500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !s) return <Card><div className="text-sm text-slate-500">{err || "Loading…"}</div></Card>;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900"><CreditCard size={20} className="text-emerald-600" /> Online Payment Settings</div>
          <div className="mt-0.5 text-sm text-slate-500">Switch between manual QR verification and a realtime payment provider.</div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={16} /></button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      {/* Mode */}
      <div className="mt-5">
        <label className="text-xs font-semibold text-slate-600">Payment Mode</label>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { v: "manual", label: "Manual QR + verify", desc: "Coop QR; officer verifies reference" },
            { v: "paymongo", label: "PayMongo (realtime)", desc: "Auto-confirm via PayMongo" },
            { v: "xendit", label: "Xendit (realtime)", desc: "Auto-confirm via Xendit" },
          ].map((m) => (
            <button key={m.v} onClick={() => set("mode", m.v)} className={`rounded-2xl border p-3 text-left ${s.mode === m.v ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}>
              <div className="text-sm font-bold text-slate-900">{m.label}</div>
              <div className="text-xs text-slate-500">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Common: fee */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-slate-600">Online transaction fee (₱, shouldered by payer)</label>
          <input type="number" step="0.01" value={s.onlineFee ?? ""} onChange={(e) => set("onlineFee", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Payee name (shown on pay screen)</label>
          <input value={s.payeeName || ""} onChange={(e) => set("payeeName", e.target.value)} placeholder="e.g. POWASSCO MPC — GCash" className={inputCls} />
        </div>
      </div>

      {s.mode === "manual" ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-800">Manual QR PH</div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
              <ImagePlus size={16} /> {s.qrImage ? "Replace QR image" : "Upload QR image"}
              <input type="file" accept="image/*" className="hidden" onChange={onPickQR} />
            </label>
            {s.qrImage && <img src={s.qrImage} alt="QR" className="h-28 w-28 rounded-xl border border-slate-200 object-contain p-1" />}
            {s.qrImage && <button type="button" onClick={() => set("qrImage", "")} className="text-xs font-semibold text-red-600">Remove</button>}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Instructions to payer</label>
            <textarea rows={2} value={s.instructions || ""} onChange={(e) => set("instructions", e.target.value)} placeholder="e.g. Scan with GCash/Maya, pay the exact amount, then enter your reference number." className={inputCls} />
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <Info size={16} className="mt-0.5 shrink-0" /> Enter your {s.mode === "paymongo" ? "PayMongo" : "Xendit"} keys and activate. Realtime auto-confirm is wired on the server side once your merchant account is live; until then, keep mode on <b>Manual</b> so members can still pay.
          </div>
          {s.mode === "paymongo" ? (
            <>
              <div><label className="text-xs font-semibold text-slate-600">PayMongo Secret Key</label><input value={s.paymongoSecretKey || ""} onChange={(e) => set("paymongoSecretKey", e.target.value)} placeholder="sk_live_…" className={inputCls} /></div>
              <div><label className="text-xs font-semibold text-slate-600">PayMongo Public Key</label><input value={s.paymongoPublicKey || ""} onChange={(e) => set("paymongoPublicKey", e.target.value)} placeholder="pk_live_…" className={inputCls} /></div>
            </>
          ) : (
            <div><label className="text-xs font-semibold text-slate-600">Xendit API Key</label><input value={s.xenditApiKey || ""} onChange={(e) => set("xenditApiKey", e.target.value)} placeholder="xnd_…" className={inputCls} /></div>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={!!s.pspActive} onChange={(e) => set("pspActive", e.target.checked)} />
            Activate realtime payments
          </label>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><Save size={16} /> {saving ? "Saving…" : "Save Settings"}</button>
      </div>
    </Card>
  );
}
