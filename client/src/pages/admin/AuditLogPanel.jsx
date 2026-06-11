import { useEffect, useMemo, useState } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { RefreshCw, Trash2, ShieldAlert } from "lucide-react";

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

// Colored verb badge — lets the operator spot the crucial event types
// (adjustments, approvals, payments, deletes) in a sea of routine
// inserts/updates. Server stamps actionKind in auditLogger.js; rows
// from before that change fall back to a method-derived guess.
const KIND_TONE = {
  insert:  { label: "INSERT",  cls: "bg-emerald-100 text-emerald-800" },
  update:  { label: "UPDATE",  cls: "bg-blue-100 text-blue-800" },
  delete:  { label: "DELETE",  cls: "bg-red-100 text-red-800" },
  payment: { label: "PAYMENT", cls: "bg-violet-100 text-violet-800" },
  adjust:  { label: "ADJUST",  cls: "bg-amber-100 text-amber-900" },
  approve: { label: "APPROVE", cls: "bg-teal-100 text-teal-800" },
  reject:  { label: "REJECT",  cls: "bg-rose-100 text-rose-800" },
};

function kindFor(row) {
  if (row.actionKind && KIND_TONE[row.actionKind]) return KIND_TONE[row.actionKind];
  // Legacy rows without actionKind: derive from method.
  if (row.method === "DELETE") return KIND_TONE.delete;
  if (row.method === "POST") return KIND_TONE.insert;
  return KIND_TONE.update;
}

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
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetPw, setResetPw] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetting, setResetting] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ q, from, to, category, kind, page: String(page), limit: String(PAGE_SIZE) });
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
  }, [q, from, to, category, kind, page]);

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">Audit Log</div>
          <div className="mt-0.5 text-sm text-slate-500">Who did what, and when — across the whole system.</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search actor / action / path" className="w-full sm:w-56 rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
          <div>
            <label className="block text-xs font-semibold text-slate-600">View</label>
            <select value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">All activity</option>
              <option value="session">Logins &amp; Logouts</option>
              <option value="security">Security events</option>
              <option value="general">General</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">Kind</label>
            <select value={kind} onChange={(e) => { setPage(1); setKind(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">All kinds</option>
              <option value="payment">Payments</option>
              <option value="adjust">Adjustments</option>
              <option value="approve">Approvals</option>
              <option value="reject">Rejections</option>
              <option value="insert">Inserts</option>
              <option value="update">Updates</option>
              <option value="delete">Deletes</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">From</label>
            <input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">To</label>
            <input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
          <button
            onClick={() => { setResetConfirm(""); setResetPw(""); setResetCode(""); setResetOpen(true); }}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
            title="Reset audit log (admin + password + 2FA)"
          >
            <Trash2 size={16} /> Reset
          </button>
        </div>
      </div>

      {/* Reset audit log modal */}
      <Modal open={resetOpen} title="Reset Audit Log" subtitle="Wipes every audit row. Records a single fresh row noting the reset." onClose={() => setResetOpen(false)} size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (resetConfirm !== "RESET AUDIT LOG") return toast.error('Type the exact phrase "RESET AUDIT LOG".');
            if (!resetPw || !resetCode) return toast.error("Admin password and code are required.");
            setResetting(true);
            try {
              const res = await apiFetch("/audit/reset", {
                method: "POST",
                token,
                body: { password: resetPw, code: resetCode.trim(), confirm: resetConfirm },
              });
              toast.success(`Audit log reset — ${res.deleted} row(s) deleted`);
              setResetOpen(false);
              setPage(1);
              load();
            } catch (err) { toast.error(err.message); } finally { setResetting(false); }
          }}
          className="space-y-3"
        >
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <div>Destructive. The audit log itself records who did this — a single new row replaces what was wiped.</div>
          </div>
          <div>
            <label className="text-xs font-semibold">Type <b>RESET AUDIT LOG</b> to confirm</label>
            <input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm" autoComplete="off" />
          </div>
          <div>
            <label className="text-xs font-semibold">Admin password</label>
            <input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold">Authenticator code (or recovery code)</label>
            <input value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\s/g, ""))} inputMode="numeric" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-lg tracking-widest text-center" placeholder="------" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setResetOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
            <button disabled={resetting} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{resetting ? "Resetting…" : "Reset audit log"}</button>
          </div>
        </form>
      </Modal>

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
                <tr key={row._id} className={`border-t align-top hover:bg-slate-50/60 ${row.category === "security" ? "bg-red-50/40" : row.category === "session" ? "bg-blue-50/30" : ""}`}>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{when(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800">{row.actorName}</div>
                    <div className="text-xs text-slate-400">{row.actorRole}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {(() => { const k = kindFor(row); return (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${k.cls}`}>{k.label}</span>
                      ); })()}
                      <div className="font-medium text-slate-800">{row.action}</div>
                    </div>
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
