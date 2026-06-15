// Disconnection + Reconnection workflow UI. Shared by water bill officer,
// plumber, and admin. Three tabs:
//   1. Pending Disconnect — meters past grace + meters of borrowers with
//      overdue loans. Officer or plumber can mark a meter physically
//      disconnected.
//   2. Disconnected — record of currently disconnected meters.
//   3. Pending Reconnect — meters whose account has been activated after
//      settlement. Officer or plumber marks them reconnected.
//
// Officer can ALSO press "Activate account" on a disconnected meter (after
// settlement) — this queues every disconnected meter on the account for
// reconnection.
import { useEffect, useState } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import { useAuth } from "../context/AuthContext";
import { toast } from "./Toast";
import { RefreshCw, AlertTriangle, Power, PlugZap, MapPin, CheckCircle, Wrench } from "lucide-react";

function peso(n) {
  return "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function d(x) {
  return x ? new Date(x).toLocaleDateString() : "—";
}

export default function DisconnectionsPanel() {
  const { token, user } = useAuth();
  const isOfficer = ["admin", "water_bill_officer"].includes(user?.role);
  const canAct = ["admin", "water_bill_officer", "plumber"].includes(user?.role);

  const [data, setData] = useState({ pendingDisconnect: [], disconnected: [], pendingReconnect: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("pending");

  useRealtime(["water-bills", "members"], () => load());
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

  async function markDisconnected(row) {
    if (!confirm(`Mark meter ${row.meterNumber} of ${row.accountName} (${row.pnNo}) as DISCONNECTED?\nReason: ${row.remark || "unpaid"}`)) return;
    try {
      await apiFetch(`/disconnections/mark-disconnected`, { method: "POST", token, body: { pnNo: row.pnNo, meterNumber: row.meterNumber, remarks: row.remark } });
      toast.success(`Meter ${row.meterNumber} disconnected`);
      await load();
    } catch (e) { toast.error(e.message); }
  }

  async function requestReconnect(row) {
    if (!confirm(`Activate account ${row.pnNo} (${row.accountName})?\nAll disconnected meters on this account will be queued for reconnection.`)) return;
    try {
      const res = await apiFetch(`/disconnections/request-reconnect`, { method: "POST", token, body: { pnNo: row.pnNo } });
      toast.success(res.message || "Account activated");
      await load();
    } catch (e) { toast.error(e.message); }
  }

  async function markReconnected(row) {
    if (!confirm(`Mark meter ${row.meterNumber} of ${row.accountName} (${row.pnNo}) as RECONNECTED?`)) return;
    try {
      await apiFetch(`/disconnections/mark-reconnected`, { method: "POST", token, body: { pnNo: row.pnNo, meterNumber: row.meterNumber } });
      toast.success(`Meter ${row.meterNumber} reconnected`);
      await load();
    } catch (e) { toast.error(e.message); }
  }

  const tabs = [
    { k: "pending", label: "Pending Disconnect", count: data.counts?.pendingDisconnect ?? 0, active: "border-amber-300 bg-amber-50 text-amber-700", pill: "bg-amber-100 text-amber-700" },
    { k: "disconnected", label: "Disconnected", count: data.counts?.disconnected ?? 0, active: "border-red-300 bg-red-50 text-red-700", pill: "bg-red-100 text-red-700" },
    { k: "reconnect", label: "Pending Reconnect", count: data.counts?.pendingReconnect ?? 0, active: "border-emerald-300 bg-emerald-50 text-emerald-700", pill: "bg-emerald-100 text-emerald-700" },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <AlertTriangle size={20} className="text-amber-500" /> Disconnection & Reconnection
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Penalty grace exhausted, or borrower has an overdue loan. {canAct ? "Mark each meter as physically disconnected or reconnected after field work." : "View-only for your role."}
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold ${tab === t.k ? t.active : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {t.label}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tab === t.k ? t.pill : "bg-slate-100 text-slate-600"}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "pending" && (
        <div className="mt-4 overflow-auto rounded-2xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Account / Meter</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Owed</th>
                <th className="px-4 py-3">Days late</th>
                <th className="px-4 py-3">Oldest due</th>
                {canAct && <th className="px-4 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canAct ? 6 : 5} className="py-10 text-center text-slate-500">Loading…</td></tr>
              ) : data.pendingDisconnect.length === 0 ? (
                <tr><td colSpan={canAct ? 6 : 5} className="py-10 text-center text-slate-500">No accounts pending disconnection.</td></tr>
              ) : (
                data.pendingDisconnect.map((r) => (
                  <tr key={`${r.pnNo}-${r.meterNumber}`} className="border-t align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{r.accountName}</div>
                      <div className="font-mono text-xs text-slate-500">{r.pnNo} • {r.meterNumber}</div>
                      {r.address && <div className="mt-0.5 flex items-start gap-1 text-xs text-slate-400"><MapPin size={11} className="mt-0.5 shrink-0" />{r.address}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <div className="font-semibold">{r.remark}</div>
                      {r.periods?.length > 0 && (
                        <div className="mt-0.5 text-slate-400">{r.unpaidCount} mo: {r.periods.slice(0, 4).join(", ")}{r.periods.length > 4 ? "…" : ""}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{peso(r.totalOwed)}</td>
                    <td className="px-4 py-3 text-slate-700"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.daysOverdue > 5 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{r.daysOverdue || 0} day(s)</span></td>
                    <td className="px-4 py-3 text-slate-600">{d(r.oldestDue)}</td>
                    {canAct && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => markDisconnected(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
                          <Power size={13} /> Mark Disconnected
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "disconnected" && (
        <div className="mt-4 overflow-auto rounded-2xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Account / Meter</th>
                <th className="px-4 py-3">Remark</th>
                <th className="px-4 py-3 text-right">Owed</th>
                {isOfficer && <th className="px-4 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isOfficer ? 4 : 3} className="py-10 text-center text-slate-500">Loading…</td></tr>
              ) : data.disconnected.length === 0 ? (
                <tr><td colSpan={isOfficer ? 4 : 3} className="py-10 text-center text-slate-500">No currently disconnected meters in queue.</td></tr>
              ) : (
                data.disconnected.map((r) => (
                  <tr key={`${r.pnNo}-${r.meterNumber}`} className="border-t hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{r.accountName}</div>
                      <div className="font-mono text-xs text-slate-500">{r.pnNo} • {r.meterNumber}</div>
                      {r.address && <div className="mt-0.5 text-xs text-slate-400">{r.address}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{r.diskRemarks || r.remark}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{peso(r.totalOwed)}</td>
                    {isOfficer && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => requestReconnect(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50" title="Settled? Activate the account — all its disconnected meters move to Pending Reconnect.">
                          <Wrench size={13} /> Activate (request reconnection)
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "reconnect" && (
        <div className="mt-4 overflow-auto rounded-2xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Account / Meter</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">By</th>
                {canAct && <th className="px-4 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canAct ? 4 : 3} className="py-10 text-center text-slate-500">Loading…</td></tr>
              ) : data.pendingReconnect.length === 0 ? (
                <tr><td colSpan={canAct ? 4 : 3} className="py-10 text-center text-slate-500">No meters pending reconnection.</td></tr>
              ) : (
                data.pendingReconnect.map((r) => (
                  <tr key={`${r.pnNo}-${r.meterNumber}`} className="border-t hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{r.accountName}</div>
                      <div className="font-mono text-xs text-slate-500">{r.pnNo} • {r.meterNumber}</div>
                      {r.address && <div className="mt-0.5 text-xs text-slate-400">{r.address}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{d(r.requestedAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{r.requestedBy || "—"}</td>
                    {canAct && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => markReconnected(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                          <PlugZap size={13} /> Mark Reconnected
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
