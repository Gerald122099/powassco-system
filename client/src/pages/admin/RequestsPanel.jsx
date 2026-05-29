import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { RefreshCw, Phone, MapPin, CheckCircle2, Clock, Trash2, Droplet, PlugZap } from "lucide-react";

function when(d) {
  return d ? new Date(d).toLocaleString() : "—";
}
const STATUS_TONE = {
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

export default function RequestsPanel() {
  const { token } = useAuth();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ type, status, limit: "50" });
      const data = await apiFetch(`/requests?${qs}`, { token });
      setItems(data.items || []);
      setPendingCount(data.pendingCount || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [type, status]);

  async function setReqStatus(row, next) {
    try {
      await apiFetch(`/requests/${row._id}`, { method: "PATCH", token, body: { status: next } });
      flash(`Marked ${next.replace("_", " ")}.`);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }
  async function remove(row) {
    if (!confirm(`Delete this request from ${row.fullName}?`)) return;
    try {
      await apiFetch(`/requests/${row._id}`, { method: "DELETE", token });
      flash("Request deleted.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">
            Service Requests {pendingCount > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{pendingCount} pending</span>}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">New connection & reconnection requests from the public Contact page.</div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Reload
        </button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="">All types</option>
          <option value="new_connection">New Connection</option>
          <option value="reconnection">Reconnection</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="">All status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No requests.</div>
        ) : (
          items.map((r) => (
            <div key={r._id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${r.type === "new_connection" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                      {r.type === "new_connection" ? <Droplet size={12} /> : <PlugZap size={12} />}
                      {r.type === "new_connection" ? "New Connection" : "Reconnection"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[r.status]}`}>{r.status.replace("_", " ")}</span>
                  </div>
                  <div className="mt-1.5 font-bold text-slate-900">{r.fullName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1"><Phone size={13} /> {r.phone}</span>
                    {r.email && <span>{r.email}</span>}
                    {r.type === "reconnection" && <span className="font-mono text-xs">{r.accountNumber} • {r.meterNumber}</span>}
                  </div>
                  {r.type === "new_connection" && r.address && (
                    <div className="mt-1 flex items-start gap-1 text-sm text-slate-600"><MapPin size={13} className="mt-0.5 shrink-0" /> {r.address} {r.installationType && <span className="text-slate-400">({r.installationType})</span>}</div>
                  )}
                  {r.message && <div className="mt-1 text-sm text-slate-500">“{r.message}”</div>}
                  <div className="mt-1 text-xs text-slate-400">{when(r.createdAt)}{r.handledBy ? ` • resolved by ${r.handledBy}` : ""}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {r.status !== "resolved" && (
                    <>
                      {r.status === "pending" && (
                        <button onClick={() => setReqStatus(r, "in_progress")} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Clock size={13} /> In progress</button>
                      )}
                      <button onClick={() => setReqStatus(r, "resolved")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={13} /> Resolve</button>
                    </>
                  )}
                  <button onClick={() => remove(r)} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
