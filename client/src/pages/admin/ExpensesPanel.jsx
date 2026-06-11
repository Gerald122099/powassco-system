import { useEffect, useMemo, useState } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Plus, Pencil, Trash2, RefreshCw, Wallet, Check, X, Send, Clock } from "lucide-react";

const PAGE_SIZE = 15;
const METHODS = ["cash", "check", "bank", "gcash", "other"];

const STATUS_BADGE = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  disbursed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

function peso(n) {
  return "₱ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dt(d) {
  return d ? new Date(d).toLocaleDateString() : "—";
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const EMPTY = { date: today(), category: "", description: "", payee: "", amount: "", reference: "", paymentMethod: "cash", notes: "", asRequest: true };

export default function ExpensesPanel() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  useEffect(() => {
    apiFetch("/expenses/categories", { token }).then(setCats).catch(() => {});
  }, [token]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ q, category, from, to, page: String(page), limit: String(PAGE_SIZE) });
      if (statusFilter) qs.set("status", statusFilter);
      const [list, sum] = await Promise.all([
        apiFetch(`/expenses?${qs}`, { token }),
        apiFetch(`/expenses/summary?${new URLSearchParams({ from, to })}`, { token }),
      ]);
      setItems(list.items || []);
      setTotal(list.total || 0);
      setSummary(sum);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [q, category, statusFilter, from, to, page]);

  async function approve(row) {
    if (!confirm(`Approve ${peso(row.amount)} to ${row.payee || "—"}?`)) return;
    try { await apiFetch(`/expenses/${row._id}/approve`, { method: "POST", token }); flash("Approved."); await load(); }
    catch (e) { setErr(e.message); }
  }
  async function reject(row) {
    const reason = prompt("Reason for rejecting this request?", "");
    if (reason === null) return;
    try { await apiFetch(`/expenses/${row._id}/reject`, { method: "POST", token, body: { reason } }); flash("Rejected."); await load(); }
    catch (e) { setErr(e.message); }
  }

  function flash(m) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY, date: today() });
    setErr("");
    setOpen(true);
  }
  function openEdit(row) {
    setEditing(row);
    setForm({
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : today(),
      category: row.category || "",
      description: row.description || "",
      payee: row.payee || "",
      amount: String(row.amount ?? ""),
      reference: row.reference || "",
      paymentMethod: row.paymentMethod || "cash",
      notes: row.notes || "",
    });
    setErr("");
    setOpen(true);
  }

  async function save() {
    if (!form.category.trim()) return setErr("Category is required.");
    if (!(Number(form.amount) >= 0)) return setErr("Enter a valid amount.");
    setErr("");
    setSaving(true);
    try {
      const body = { ...form, amount: Number(form.amount) };
      if (editing) await apiFetch(`/expenses/${editing._id}`, { method: "PUT", token, body });
      else await apiFetch("/expenses", { method: "POST", token, body });
      setOpen(false);
      flash(editing ? "Expense updated." : "Expense logged.");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (!confirm(`Delete this ${row.category} expense of ${peso(row.amount)}?`)) return;
    try {
      await apiFetch(`/expenses/${row._id}`, { method: "DELETE", token });
      flash("Expense deleted.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  function setF(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">Expenses & Disbursements</div>
          <div className="mt-0.5 text-sm text-slate-500">Log pipe repairs, utilities, office costs, and other expenses.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Reload
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            <Plus size={16} /> Log Expense
          </button>
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      {/* Totals */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Wallet size={22} /></div>
          <div>
            <div className="text-lg font-bold text-slate-900">{peso(summary?.total)}</div>
            <div className="text-xs text-slate-500">Total {from || to ? "(filtered)" : "(all time)"} · {summary?.count ?? 0} entries</div>
          </div>
        </div>
        {(summary?.byCategory || []).slice(0, 3).map((c) => (
          <div key={c.category} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-lg font-bold text-slate-900">{peso(c.total)}</div>
            <div className="truncate text-xs text-slate-500" title={c.category}>{c.category} · {c.count}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-end gap-2">
        <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search payee / description / OR" className="w-full sm:w-64 rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
        <select value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="inline-flex rounded-xl border border-slate-200 p-1">
          {[
            ["", "All"],
            ["pending", "Pending"],
            ["approved", "Approved"],
            ["disbursed", "Disbursed"],
            ["rejected", "Rejected"],
          ].map(([k, label]) => (
            <button
              key={k || "all"}
              type="button"
              onClick={() => { setPage(1); setStatusFilter(k); }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${statusFilter === k ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600">From</label>
          <input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600">To</label>
          <input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-auto rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Payee / Description</th>
              <th className="px-4 py-3">OR / Ref</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-slate-500">No expenses found.</td></tr>
            ) : (
              items.map((row) => {
                const status = row.status || "disbursed";
                return (
                <tr key={row._id} className="border-t hover:bg-slate-50/60">
                  <td className="px-4 py-3 whitespace-nowrap">{dt(row.date)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${STATUS_BADGE[status] || STATUS_BADGE.disbursed}`}>{status}</span>
                    {status === "disbursed" && row.disbursementOr && (
                      <div className="mt-0.5 text-[10px] text-slate-500">OR {row.disbursementOr}</div>
                    )}
                  </td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{row.category}</span></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{row.payee || "—"}</div>
                    {row.description && <div className="text-xs text-slate-500">{row.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{row.reference || "—"}</div>
                    <div className="text-xs capitalize text-slate-400">{row.paymentMethod}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">{peso(row.amount)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {status === "pending" && (
                      <>
                        <button onClick={() => approve(row)} className="mr-1 inline-flex items-center justify-center rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50" title="Approve"><Check size={14} /></button>
                        <button onClick={() => reject(row)} className="mr-1 inline-flex items-center justify-center rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50" title="Reject"><X size={14} /></button>
                      </>
                    )}
                    {status === "approved" && (
                      <span className="mr-2 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700"><Clock size={12} /> awaiting cashier</span>
                    )}
                    <button onClick={() => openEdit(row)} className="mr-1 inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => remove(row)} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={14} /></button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <div>{total} total</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">Next</button>
        </div>
      </div>

      {/* Add/Edit modal */}
      <Modal open={open} title={editing ? "Edit Expense" : "Log Expense"} onClose={() => setOpen(false)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Date</label>
            <input type="date" value={form.date} onChange={(e) => setF("date", e.target.value)} className={`mt-1 ${inputCls}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Category</label>
            <input list="exp-cats" value={form.category} onChange={(e) => setF("category", e.target.value)} placeholder="e.g. Pipe Repair / Maintenance" className={`mt-1 ${inputCls}`} />
            <datalist id="exp-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Payee / Paid to</label>
            <input value={form.payee} onChange={(e) => setF("payee", e.target.value)} placeholder="Vendor or person paid" className={`mt-1 ${inputCls}`} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Description</label>
            <input value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="What was this for?" className={`mt-1 ${inputCls}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Amount (₱)</label>
            <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setF("amount", e.target.value)} className={`mt-1 ${inputCls}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Payment Method</label>
            <select value={form.paymentMethod} onChange={(e) => setF("paymentMethod", e.target.value)} className={`mt-1 ${inputCls}`}>
              {METHODS.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">OR / Invoice No.</label>
            <input value={form.reference} onChange={(e) => setF("reference", e.target.value)} className={`mt-1 ${inputCls}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Notes</label>
            <input value={form.notes} onChange={(e) => setF("notes", e.target.value)} className={`mt-1 ${inputCls}`} />
          </div>
          {!editing && (
            <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.asRequest}
                  onChange={(e) => setF("asRequest", e.target.checked)}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <div className="font-bold text-blue-900 flex items-center gap-1"><Send size={12} /> File as disbursement request</div>
                  <div className="text-blue-700">
                    Checked: the cashier sees this in their Disbursements queue and pays it out (recording the OR/DV).
                    <br />
                    Unchecked: log it directly as already-disbursed (legacy entry, no cashier involvement).
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>
        {err && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Saving…" : editing ? "Update" : "Save"}
          </button>
        </div>
      </Modal>
    </Card>
  );
}
