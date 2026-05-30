import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { ShieldCheck, RefreshCw, KeyRound, ListChecks, Printer } from "lucide-react";

export default function SecurityPanel() {
  const { token } = useAuth();
  const nav = useNavigate();
  const [enforce, setEnforce] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const [codesModal, setCodesModal] = useState(null); // { fullName, employeeId, codes }

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const [settings, list] = await Promise.all([
        apiFetch("/auth/2fa/admin/settings", { token }),
        apiFetch("/users", { token }),
      ]);
      setEnforce(!!settings.enforce2FA);
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  async function toggleEnforce() {
    setSaving(true);
    setErr("");
    try {
      const next = !enforce;
      await apiFetch("/auth/2fa/admin/settings", { method: "PUT", token, body: { enforce2FA: next } });
      setEnforce(next);
      flash(next ? "2FA is now required for all staff." : "2FA enforcement turned off.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function reset2FA(u) {
    if (!confirm(`Reset 2FA for ${u.fullName} (${u.employeeId})? They'll set it up again on next login.`)) return;
    try {
      await apiFetch(`/auth/2fa/admin/reset/${u._id}`, { method: "POST", token });
      flash(`2FA reset for ${u.employeeId}.`);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function genCodes(u) {
    if (!confirm(`Generate new recovery codes for ${u.fullName}? This replaces any previous codes.`)) return;
    try {
      const res = await apiFetch(`/auth/2fa/admin/recovery-codes/${u._id}`, { method: "POST", token });
      setCodesModal({ fullName: u.fullName, employeeId: u.employeeId, codes: res.codes || [] });
    } catch (e) {
      setErr(e.message);
    }
  }

  function printCodes() {
    if (!codesModal) return;
    const w = window.open("", "_blank", "width=520,height=640");
    if (!w) return alert("Allow pop-ups to print.");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Recovery Codes</title>
      <style>@page{size:A5;margin:14mm}body{font-family:Arial,sans-serif;color:#0f172a}
      h1{font-size:16px;color:#166534}.muted{color:#475569;font-size:12px}
      .code{font-family:monospace;font-size:18px;letter-spacing:1px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;margin:6px 0;text-align:center}
      .warn{margin-top:12px;font-size:11px;color:#b91c1c}</style></head><body>
      <h1>POWASSCO — 2FA Recovery Codes</h1>
      <div class="muted">${codesModal.fullName} (${codesModal.employeeId}) • Generated ${new Date().toLocaleString()}</div>
      <div style="margin-top:12px">${codesModal.codes.map((c) => `<div class="code">${c}</div>`).join("")}</div>
      <div class="warn">Each code works ONCE to reset 2FA if the authenticator is lost. Keep this sheet in a secure storage box. Do not share.</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 200);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <ShieldCheck size={20} className="text-emerald-600" /> Security & 2FA
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Two-factor authentication via authenticator app (Google/Microsoft Authenticator).</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => nav("/setup-2fa")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            <KeyRound size={16} /> My 2FA (set up / reset)
          </button>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      {/* Enforce toggle */}
      <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 p-4">
        <div>
          <div className="font-semibold text-slate-800">Require 2FA for all staff</div>
          <div className="text-sm text-slate-500">When on, everyone must set up an authenticator app, and a code is required on new devices.</div>
        </div>
        <button
          onClick={toggleEnforce}
          disabled={saving}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${enforce ? "bg-emerald-500" : "bg-slate-300"}`}
          aria-pressed={enforce}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${enforce ? "left-6" : "left-1"}`} />
        </button>
      </div>

      {/* Per-user reset */}
      <div className="mt-6">
        <div className="mb-2 text-sm font-semibold text-slate-800">Reset a staff member's 2FA (lost phone)</div>
        <div className="overflow-auto rounded-2xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="py-8 text-center text-slate-500">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={3} className="py-8 text-center text-slate-500">No users.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u._id} className="border-t hover:bg-slate-50/60">
                    <td className="px-4 py-3"><div className="font-semibold text-slate-800">{u.fullName}</div><div className="text-xs text-slate-500">{u.employeeId}</div></td>
                    <td className="px-4 py-3 text-slate-600">{u.role}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => genCodes(u)} className="mr-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ListChecks size={13} /> Recovery codes</button>
                      <button onClick={() => reset2FA(u)} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">Reset 2FA</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Recovery codes are shown once — print and store them in a secure box. They let a user reset 2FA if their authenticator is lost.
        </p>
      </div>

      {/* Recovery codes (shown once) */}
      <Modal open={!!codesModal} title="Recovery Codes" subtitle={codesModal ? `${codesModal.fullName} (${codesModal.employeeId})` : ""} onClose={() => setCodesModal(null)} size="sm">
        {codesModal && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              These codes are shown <b>only now</b>. Each works once to reset 2FA. Print and keep them in a secure storage box.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {codesModal.codes.map((c) => (
                <div key={c} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center font-mono text-sm tracking-wider">{c}</div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCodesModal(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Close</button>
              <button onClick={printCodes} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><Printer size={16} /> Print</button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
