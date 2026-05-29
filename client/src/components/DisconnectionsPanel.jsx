import { useEffect, useState } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { RefreshCw, AlertTriangle, Power, PlugZap, MapPin } from "lucide-react";

function peso(n) {
  return "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function d(x) {
  return x ? new Date(x).toLocaleDateString() : "—";
}

export default function DisconnectionsPanel() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState({ pending: [], disconnected: [], pendingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  async function load() {
    setLoading(true);
    setErr("");
    try {
      setData(await apiFetch("/disconnections", { token }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function act(path, row, label) {
    if (!confirm(`${label} meter ${row.meterNumber} of ${row.accountName} (${row.pnNo})?`)) return;
    try {
      await apiFetch(`/disconnections/${path}`, { method: "POST", token, body: { pnNo: row.pnNo, meterNumber: row.meterNumber } });
      flash(`${label} done.`);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <AlertTriangle size={20} className="text-amber-500" /> Pending Disconnections
            {data.pendingCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{data.pendingCount}</span>}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Accounts past due + grace period. {isAdmin ? "Confirm disconnection per meter (manual)." : "For your awareness — only the admin confirms disconnection."}
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      <div className="mt-4 overflow-auto rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Account / Meter</th>
              <th className="px-4 py-3">Unpaid</th>
              <th className="px-4 py-3 text-right">Owed</th>
              <th className="px-4 py-3">Oldest due</th>
              {isAdmin && <th className="px-4 py-3 text-right">Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdmin ? 5 : 4} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : data.pending.length === 0 ? (
              <tr><td colSpan={isAdmin ? 5 : 4} className="py-10 text-center text-slate-500">No accounts pending disconnection.</td></tr>
            ) : (
              data.pending.map((r) => (
                <tr key={`${r.pnNo}-${r.meterNumber}`} className="border-t align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{r.accountName}</div>
                    <div className="text-xs text-slate-500">{r.pnNo} • {r.meterNumber}</div>
                    {r.address && <div className="mt-0.5 flex items-start gap-1 text-xs text-slate-400"><MapPin size={11} className="mt-0.5 shrink-0" />{r.address}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.unpaidCount} mo<div className="text-xs text-slate-400">{r.periods.slice(0, 4).join(", ")}{r.periods.length > 4 ? "…" : ""}</div></td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">{peso(r.totalOwed)}</td>
                  <td className="px-4 py-3 text-slate-600">{d(r.oldestDue)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => act("confirm", r, "Disconnect")} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"><Power size={13} /> Disconnect</button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && data.disconnected.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-sm font-semibold text-slate-800">Disconnected meters</div>
          <div className="space-y-2">
            {data.disconnected.map((r) => (
              <div key={`${r.pnNo}-${r.meterNumber}`} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div>
                  <div className="font-semibold text-slate-800">{r.accountName} <span className="text-xs font-normal text-slate-400">({r.pnNo} • {r.meterNumber})</span></div>
                  <div className="text-xs text-red-500">Owed {peso(r.totalOwed)} • {r.unpaidCount} mo unpaid</div>
                </div>
                <button onClick={() => act("reconnect", r, "Reconnect")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><PlugZap size={13} /> Reconnect</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
