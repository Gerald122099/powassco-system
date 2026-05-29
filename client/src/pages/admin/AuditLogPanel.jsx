import { useEffect, useMemo, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { RefreshCw } from "lucide-react";

const PAGE_SIZE = 25;

function when(d) {
  return d ? new Date(d).toLocaleString() : "—";
}

const METHOD_TONE = {
  POST: "bg-emerald-100 text-emerald-700",
  PUT: "bg-blue-100 text-blue-700",
  PATCH: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
};

function statusTone(code) {
  if (code >= 500) return "text-red-600";
  if (code >= 400) return "text-amber-600";
  return "text-emerald-600";
}

export default function AuditLogPanel() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ q, from, to, page: String(page), limit: String(PAGE_SIZE) });
      const data = await apiFetch(`/audit?${qs}`, { token });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [q, from, to, page]);

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">Audit Log</div>
          <div className="mt-0.5 text-sm text-slate-500">Who did what, and when — across the whole system.</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search actor / action / path" className="w-full sm:w-64 rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
          <div>
            <label className="block text-xs font-semibold text-slate-600">From</label>
            <input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">To</label>
            <input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}

      <div className="mt-4 overflow-auto rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-500">No activity found.</td></tr>
            ) : (
              items.map((row) => (
                <tr key={row._id} className="border-t align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{when(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800">{row.actorName}</div>
                    <div className="text-xs text-slate-400">{row.actorRole}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{row.action}</div>
                    {row.meta && (
                      <div className="mt-0.5 max-w-md truncate text-xs text-slate-400" title={JSON.stringify(row.meta)}>
                        {Object.entries(row.meta).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${METHOD_TONE[row.method] || "bg-slate-100 text-slate-600"}`}>{row.method}</span>
                    <span className="font-mono text-xs text-slate-500">{row.path}</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${statusTone(row.statusCode)}`}>{row.statusCode}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <div>{total} events</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">Next</button>
        </div>
      </div>
    </Card>
  );
}
