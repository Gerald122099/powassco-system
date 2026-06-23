import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { fileToResizedDataUrl } from "../../lib/imageResize";
import { CreditCard, ImagePlus, Save, RefreshCw, Info, ShieldCheck, Copy, Check, Webhook, CheckCircle2, XCircle, Smartphone } from "lucide-react";

// Production API origin — webhooks must point at the Render API, not the
// Vercel web origin. Keep in sync with index.js CORS / deploy host.
const PROD_API = "https://powassco-system.onrender.com/api";
function webhookUrl(provider) {
  const origin = (typeof window !== "undefined" && window.location.origin) || "";
  const base = origin.includes("localhost") ? `${origin}/api` : PROD_API;
  return `${base}/webhooks/${provider}`;
}

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const lockedCls = "mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-sm font-mono text-emerald-800";

function EnvLockLabel({ children }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
      <ShieldCheck size={11} /> {children || "managed by host env"}
    </span>
  );
}

export default function PaymentSettingsPanel() {
  const { token } = useAuth();
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [events, setEvents] = useState([]);
  const [copied, setCopied] = useState("");

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
    try { setEvents(await apiFetch("/payments/webhook-events", { token })); } catch { /* none yet */ }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function copy(text, key) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); }
    catch { /* clipboard blocked */ }
  }

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
          onlineEnabled: s.onlineEnabled !== false,
          mode: s.mode,
          qrImage: s.qrImage,
          onlineFee: Number(s.onlineFee) || 0,
          payeeName: s.payeeName,
          instructions: s.instructions,
          paymongoSecretKey: s.paymongoSecretKey,
          paymongoPublicKey: s.paymongoPublicKey,
          paymongoWebhookSecret: s.paymongoWebhookSecret,
          xenditApiKey: s.xenditApiKey,
          xenditCallbackToken: s.xenditCallbackToken,
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

      {/* Master switch */}
      <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 p-4">
        <div>
          <div className="font-semibold text-slate-800">Accept online payments</div>
          <div className="text-sm text-slate-500">Turn off to accept walk-in payments only (members can't submit online).</div>
        </div>
        <button
          onClick={() => set("onlineEnabled", !(s.onlineEnabled !== false))}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${s.onlineEnabled !== false ? "bg-emerald-500" : "bg-slate-300"}`}
          aria-pressed={s.onlineEnabled !== false}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${s.onlineEnabled !== false ? "left-6" : "left-1"}`} />
        </button>
      </div>

      {/* Mode */}
      <div className={`mt-5 ${s.onlineEnabled === false ? "pointer-events-none opacity-50" : ""}`}>
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
            <Info size={16} className="mt-0.5 shrink-0" /> Enter your {s.mode === "paymongo" ? "PayMongo" : "Xendit"} keys, paste the webhook secret/token, then tick <b>Activate realtime</b>. The system will auto-confirm payments from the provider; if anything goes wrong, switch back to <b>Manual</b>.
          </div>
          {s.mode === "paymongo" && (
            <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
              <Smartphone size={16} className="mt-0.5 shrink-0" /> PayMongo is how members pay by <b>GCash</b> (plus Maya, GrabPay, and card). Enable the GCash channel in your PayMongo dashboard — no separate GCash API needed.
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="font-semibold text-slate-700">Webhook URL — paste this into your {s.mode === "paymongo" ? "PayMongo" : "Xendit"} dashboard:</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">{webhookUrl(s.mode)}</code>
              <button type="button" onClick={() => copy(webhookUrl(s.mode), "wh")} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-50">
                {copied === "wh" ? <><Check size={12} className="text-emerald-600" /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
          </div>
          {(() => {
            const env = s.envOverrides || {};
            const anyEnv = Object.values(env).some(Boolean);
            return anyEnv && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <ShieldCheck size={14} className="-mt-0.5 mr-1 inline" />
                Some credentials are loaded from the host environment (production secrets). Those fields are read-only here and cannot be changed from the database.
              </div>
            );
          })()}
          {s.mode === "paymongo" ? (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600">PayMongo Secret Key{s.envOverrides?.paymongoSecretKey && <EnvLockLabel />}</label>
                {s.envOverrides?.paymongoSecretKey
                  ? <div className={lockedCls}>•••••••••• (set via host env)</div>
                  : <input value={s.paymongoSecretKey || ""} onChange={(e) => set("paymongoSecretKey", e.target.value)} placeholder="sk_live_…" className={inputCls} />}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">PayMongo Public Key{s.envOverrides?.paymongoPublicKey && <EnvLockLabel />}</label>
                {s.envOverrides?.paymongoPublicKey
                  ? <div className={lockedCls}>•••••••••• (set via host env)</div>
                  : <input value={s.paymongoPublicKey || ""} onChange={(e) => set("paymongoPublicKey", e.target.value)} placeholder="pk_live_…" className={inputCls} />}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">PayMongo Webhook Secret{s.envOverrides?.paymongoWebhookSecret && <EnvLockLabel />}</label>
                {s.envOverrides?.paymongoWebhookSecret
                  ? <div className={lockedCls}>•••••••••• (set via host env)</div>
                  : <input value={s.paymongoWebhookSecret || ""} onChange={(e) => set("paymongoWebhookSecret", e.target.value)} placeholder="whsec_…" className={inputCls} />}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600">Xendit API Key{s.envOverrides?.xenditApiKey && <EnvLockLabel />}</label>
                {s.envOverrides?.xenditApiKey
                  ? <div className={lockedCls}>•••••••••• (set via host env)</div>
                  : <input value={s.xenditApiKey || ""} onChange={(e) => set("xenditApiKey", e.target.value)} placeholder="xnd_…" className={inputCls} />}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Xendit Callback Token{s.envOverrides?.xenditCallbackToken && <EnvLockLabel />}</label>
                {s.envOverrides?.xenditCallbackToken
                  ? <div className={lockedCls}>•••••••••• (set via host env)</div>
                  : <input value={s.xenditCallbackToken || ""} onChange={(e) => set("xenditCallbackToken", e.target.value)} placeholder="from Xendit dashboard" className={inputCls} />}
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={!!s.pspActive} onChange={(e) => set("pspActive", e.target.checked)} />
            Activate realtime payments
          </label>
        </div>
      )}

      {/* Webhook delivery log — confirms the provider is reaching us and
          signatures verify. Empty until the integration is live. */}
      <div className="mt-6 rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Webhook size={16} className="text-slate-500" /> Recent webhook deliveries</div>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"><RefreshCw size={12} /> Refresh</button>
        </div>
        {events.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
            No webhook events yet. Once the provider is activated and sends a payment event, deliveries appear here (with signature-verification status) for auditing.
          </div>
        ) : (
          <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-100">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2 text-center">Signature</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev._id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{new Date(ev.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 font-semibold capitalize">{ev.provider}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{ev.eventType || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {ev.signatureValid
                        ? <CheckCircle2 size={14} className="inline text-emerald-600" />
                        : <XCircle size={14} className="inline text-red-500" />}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ev.result === "posted" ? "bg-emerald-100 text-emerald-700" : ev.result === "duplicate" || ev.result === "ignored" ? "bg-slate-100 text-slate-600" : "bg-red-100 text-red-700"}`}>{ev.result || "—"}</span>
                      {ev.errorMessage ? <span className="ml-1 text-[10px] text-red-500">{ev.errorMessage}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><Save size={16} /> {saving ? "Saving…" : "Save Settings"}</button>
      </div>
    </Card>
  );
}
