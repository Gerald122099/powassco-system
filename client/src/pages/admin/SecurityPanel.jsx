import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { ShieldCheck, RefreshCw, KeyRound } from "lucide-react";

export default function SecurityPanel() {
  const { token } = useAuth();
  const nav = useNavigate();
  const [enforce, setEnforce] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

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
            <KeyRound size={16} /> Set up my 2FA
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
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => reset2FA(u)} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">Reset 2FA</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
