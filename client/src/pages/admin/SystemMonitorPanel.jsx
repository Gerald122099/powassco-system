// System Monitor — admin triage of captured server errors (5xx).
// Each row shows what failed (path + payload), who hit it, and when;
// admin records the action taken / root cause to resolve it.

import { useEffect, useState, useCallback } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Activity, RefreshCw, CheckCircle2, RotateCcw } from "lucide-react";

const fmt = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

export default function SystemMonitorPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [openCount, setOpenCount] = useState(0);
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/admin/errors${filter ? `?status=${filter}` : ""}`, { token });
      setItems(res.items || []);
      setOpenCount(res.openCount || 0);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }, [token, filter]);
  useEffect(() => { load(); }, [load]);

  async function resolve(row) {
    const resolution = prompt("Action taken / root cause (permanent record):", row.resolution || "");
    if (resolution === null || !resolution.trim()) return;
    try {
      await apiFetch(`/admin/errors/${row._id}/resolve`, { method: "PATCH", token, body: { resolution: resolution.trim() } });
      toast.success("Marked resolved.");
      load();
    } catch (e) { toast.error(e.message); }
  }
  async function reopen(row) {
    try { await apiFetch(`/admin/errors/${row._id}/reopen`, { method: "PATCH", token }); load(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Activity size={20} className="text-rose-600" /> System Monitor
            {openCount > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">{openCount} open</span>}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Every server error (5xx) is captured here automatically — what failed, who hit it, and the request payload. Record the fix to close it.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 p-1 text-xs font-semibold">
            {[["open", "Open"], ["resolved", "Resolved"], ["", "All"]].map(([k, label]) => (
              <button key={k || "all"} onClick={() => setFilter(k)}
                className={`rounded-lg px-3 py-1 ${filter === k ? "bg-rose-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {!items.length ? (
          <div className="rounded-2xl border border-slate-200 py-12 text-center text-sm text-slate-500">
            No {filter || ""} errors — system healthy. 🎉
          </div>
        ) : items.map((row) => (
          <div key={row._id} className={`rounded-2xl border p-4 ${row.status === "open" ? "border-rose-300 bg-rose-50/40" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-rose-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{row.statusCode}</span>
                  <span className="font-mono text-xs font-bold text-slate-800">{row.method} {row.path}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {fmt(row.createdAt)} · hit by <b>{row.actorName || "unknown"}</b> ({row.actorRole || "—"}) · {row.ip}
                </div>
                {row.meta && (
                  <div className="mt-1 max-w-xl truncate font-mono text-[10px] text-slate-400" title={JSON.stringify(row.meta)}>
                    payload: {Object.entries(row.meta).map(([k, v]) => `${k}=${v}`).join(" ")}
                  </div>
                )}
                {row.resolution && (
                  <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                    ✓ <b>{row.resolvedBy}</b>: {row.resolution} <span className="text-emerald-600">({fmt(row.resolvedAt)})</span>
                  </div>
                )}
              </div>
              <div>
                {row.status === "open" ? (
                  <button onClick={() => resolve(row)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                    <CheckCircle2 size={12} /> Resolve
                  </button>
                ) : (
                  <button onClick={() => reopen(row)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <RotateCcw size={12} /> Reopen
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
