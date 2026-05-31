// Admin-only "Danger Zone" — wipes every operational record while keeping
// users, employees, settings, catalogues, audit log, and other config.
//
// Three safety layers before the API call:
//   1. Live preview of how many docs in each target collection will be
//      deleted — admin sees what they're about to lose.
//   2. Type-to-confirm phrase ("RESET ALL DATA").
//   3. Re-authentication with the admin's password + 2FA (or recovery code).

import { useEffect, useState, useCallback } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { AlertTriangle, ShieldAlert, RefreshCw, Trash2 } from "lucide-react";

const CONFIRM_PHRASE = "RESET ALL DATA";

export default function DangerZonePanel() {
  const { token } = useAuth();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [wipeUsers, setWipeUsers] = useState(false);
  const [wipeEmployees, setWipeEmployees] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPreview(await apiFetch("/admin/data-reset/preview", { token })); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  // Sum only what the admin has ACTUALLY opted into deleting.
  const totalDocs = preview
    ? Object.entries(preview.targets).reduce((s, [k, t]) => {
        if (k === "users" && !wipeUsers) return s;
        if (k === "employees" && !wipeEmployees) return s;
        return s + (t.count || 0);
      }, 0)
    : 0;
  const canSubmit = confirm === CONFIRM_PHRASE && password.length > 0 && code.length > 0 && totalDocs > 0;

  async function runReset(e) {
    e?.preventDefault?.();
    if (!canSubmit) return;
    const extras = [];
    if (wipeUsers) extras.push("ALL user accounts (except you + bootstrap admin)");
    if (wipeEmployees) extras.push("ALL employee records");
    const extrasMsg = extras.length ? `\n\nALSO wiping:\n• ${extras.join("\n• ")}` : "\n\nUsers and employees: KEPT.";
    if (!window.confirm(`This will permanently delete ${totalDocs.toLocaleString()} record(s).\n\nTariffs, all settings, audit log, catalogues, expenses, assets, payroll — KEPT.${extrasMsg}\n\nProceed?`)) return;
    setWorking(true);
    try {
      const res = await apiFetch("/admin/data-reset", {
        method: "POST",
        token,
        body: { password, code: code.trim(), confirm, wipeUsers, wipeEmployees },
      });
      toast.success("Data reset completed.");
      setResult(res.results);
      setConfirm(""); setPassword(""); setCode(""); setWipeUsers(false); setWipeEmployees(false);
      load();
    } catch (e) { toast.error(e.message); } finally { setWorking(false); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-red-700">
            <AlertTriangle size={20} /> Danger Zone — Reset Transactional Data
          </div>
          <div className="mt-0.5 text-sm text-slate-600">
            Wipes operational records (members, bills, payments, readings, batches, loans, online payments, CBU ledger,
            product-loan applications). Keeps: <b>users, employees, all settings (water / loan / payment / auth),
            product catalogues, audit log, meetings, announcements, public requests, expenses, assets, payroll</b>.
          </div>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh counts
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <div>
          This action is <b>irreversible</b>. There is no soft-delete. Make a fresh MongoDB Atlas snapshot before
          proceeding if you need a rollback path.
        </div>
      </div>

      {/* Counts table */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
          Records that will be deleted{preview ? ` — ${totalDocs.toLocaleString()} total` : ""}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-white text-left text-xs text-slate-500">
            <tr><th className="px-4 py-2">Collection</th><th className="px-4 py-2 text-right">Count</th></tr>
          </thead>
          <tbody>
            {!preview ? (
              <tr><td colSpan={2} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : Object.entries(preview.targets).map(([k, t]) => {
              const optional = k === "users" || k === "employees";
              const opted = (k === "users" && wipeUsers) || (k === "employees" && wipeEmployees);
              const skipping = optional && !opted;
              return (
                <tr key={k} className={`border-t ${skipping ? "text-slate-400" : ""}`}>
                  <td className="px-4 py-2">
                    {t.label}
                    {optional && <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${opted ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>{opted ? "WILL DELETE" : "kept"}</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{t.error ? "—" : (skipping ? "skipped" : t.count.toLocaleString())}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirm form */}
      <form onSubmit={runReset} className="mt-6 space-y-3 rounded-2xl border border-red-200 p-4">
        {/* Optional wipe toggles */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer ${wipeUsers ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
            <input type="checkbox" checked={wipeUsers} onChange={(e) => setWipeUsers(e.target.checked)} className="mt-0.5" />
            <div>
              <div className="text-sm font-bold text-slate-800">Also delete user accounts</div>
              <div className="text-[11px] text-slate-500">YOU and the bootstrap admin (<span className="font-mono">ADMIN2026</span>) are kept so the system stays reachable.</div>
            </div>
          </label>
          <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer ${wipeEmployees ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
            <input type="checkbox" checked={wipeEmployees} onChange={(e) => setWipeEmployees(e.target.checked)} className="mt-0.5" />
            <div>
              <div className="text-sm font-bold text-slate-800">Also delete employee records</div>
              <div className="text-[11px] text-slate-500">Payroll runs and PayrollSettings are still kept.</div>
            </div>
          </label>
        </div>
        <div>
          <label className="text-xs font-semibold text-red-800">
            Type <b>{CONFIRM_PHRASE}</b> to confirm
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm tracking-wide"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-700">Your admin password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Your authenticator code (or recovery code)</label>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))} inputMode="numeric" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-lg tracking-widest text-center" placeholder="------" />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit || working}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 size={16} /> {working ? "Resetting…" : `Reset ${totalDocs.toLocaleString()} record(s)`}
          </button>
        </div>
      </form>

      {/* Last-run results */}
      {result && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-200">
          <div className="bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">Last reset — deletion summary</div>
          <table className="w-full text-sm">
            <thead className="bg-white text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Collection</th><th className="px-4 py-2 text-right">Deleted</th></tr></thead>
            <tbody>
              {Object.entries(result).map(([k, t]) => (
                <tr key={k} className="border-t">
                  <td className="px-4 py-2">{t.label}</td>
                  <td className={`px-4 py-2 text-right font-mono ${t.error ? "text-red-600" : "text-emerald-700"}`}>{t.error ? `error: ${t.error}` : t.deleted.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
