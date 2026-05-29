import { useEffect, useMemo, useState } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";

const PAGE_SIZE = 20;
const RATE_TYPES = ["monthly", "daily", "hourly"];
const EMP_TYPES = ["regular", "probationary", "contractual", "casual", "part_time"];

function peso(n) {
  return "₱ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dstr(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}
const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const EMPTY = {
  employeeCode: "", fullName: "", position: "", department: "", status: "active", employmentType: "regular",
  sex: "", civilStatus: "", birthDate: "", contactNo: "", email: "", address: "",
  tin: "", sssNo: "", philhealthNo: "", pagibigNo: "",
  dateHired: "", rateType: "monthly", rate: "", notes: "",
};

function L({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

export default function EmployeesPanel() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  useEffect(() => {
    apiFetch("/employees/positions", { token }).then(setPositions).catch(() => {});
  }, [token]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ q, status, page: String(page), limit: String(PAGE_SIZE) });
      const data = await apiFetch(`/employees?${qs}`, { token });
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
  }, [q, status, page]);

  function flash(m) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }
  function setF(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setErr("");
    setOpen(true);
  }
  function openEdit(row) {
    setEditing(row);
    setForm({
      ...EMPTY,
      ...row,
      birthDate: dstr(row.birthDate),
      dateHired: dstr(row.dateHired),
      rate: String(row.rate ?? ""),
    });
    setErr("");
    setOpen(true);
  }

  async function save() {
    if (!form.fullName.trim()) return setErr("Full name is required.");
    setErr("");
    setSaving(true);
    try {
      const body = { ...form, rate: Number(form.rate) || 0 };
      if (!body.birthDate) delete body.birthDate;
      if (!body.dateHired) delete body.dateHired;
      if (editing) await apiFetch(`/employees/${editing._id}`, { method: "PUT", token, body });
      else await apiFetch("/employees", { method: "POST", token, body });
      setOpen(false);
      flash(editing ? "Employee updated." : "Employee registered.");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (!confirm(`Delete employee ${row.fullName}?`)) return;
    try {
      await apiFetch(`/employees/${row._id}`, { method: "DELETE", token });
      flash("Employee deleted.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">Employees</div>
          <div className="mt-0.5 text-sm text-slate-500">Register staff, profiles, positions, and salary rates.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search name / code / position" className="w-full sm:w-56 rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
          <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Plus size={16} /> Add Employee</button>
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      <div className="mt-4 overflow-auto rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-500">No employees yet.</td></tr>
            ) : (
              items.map((row) => (
                <tr key={row._id} className="border-t hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{row.fullName}</div>
                    <div className="text-xs text-slate-500">{row.employeeCode}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.position || "—"}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{(row.employmentType || "").replace("_", " ")}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{peso(row.rate)}<span className="text-xs font-normal text-slate-400">/{row.rateType?.slice(0, 2)}</span></td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status === "active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>{row.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(row)} className="mr-1 inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => remove(row)} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <div>{total} total</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">Next</button>
        </div>
      </div>

      <Modal open={open} title={editing ? "Edit Employee" : "Add Employee"} onClose={() => setOpen(false)} size="lg">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <L label="Employee Code"><input value={form.employeeCode} onChange={(e) => setF("employeeCode", e.target.value)} placeholder="auto if blank" className={`mt-1 ${inputCls}`} /></L>
          <L label="Full Name *"><input value={form.fullName} onChange={(e) => setF("fullName", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Position">
            <input list="emp-positions" value={form.position} onChange={(e) => setF("position", e.target.value)} className={`mt-1 ${inputCls}`} />
            <datalist id="emp-positions">{positions.map((p) => <option key={p} value={p} />)}</datalist>
          </L>
          <L label="Department"><input value={form.department} onChange={(e) => setF("department", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Employment Type">
            <select value={form.employmentType} onChange={(e) => setF("employmentType", e.target.value)} className={`mt-1 ${inputCls}`}>
              {EMP_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </L>
          <L label="Status">
            <select value={form.status} onChange={(e) => setF("status", e.target.value)} className={`mt-1 ${inputCls}`}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </L>

          <L label="Rate Type">
            <select value={form.rateType} onChange={(e) => setF("rateType", e.target.value)} className={`mt-1 ${inputCls}`}>
              {RATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </L>
          <L label="Rate (₱)"><input type="number" step="0.01" min="0" value={form.rate} onChange={(e) => setF("rate", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Date Hired"><input type="date" value={form.dateHired} onChange={(e) => setF("dateHired", e.target.value)} className={`mt-1 ${inputCls}`} /></L>

          <L label="Sex">
            <select value={form.sex} onChange={(e) => setF("sex", e.target.value)} className={`mt-1 ${inputCls}`}>
              <option value="">—</option><option value="male">male</option><option value="female">female</option>
            </select>
          </L>
          <L label="Civil Status"><input value={form.civilStatus} onChange={(e) => setF("civilStatus", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Birth Date"><input type="date" value={form.birthDate} onChange={(e) => setF("birthDate", e.target.value)} className={`mt-1 ${inputCls}`} /></L>

          <L label="Contact No."><input value={form.contactNo} onChange={(e) => setF("contactNo", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Email"><input value={form.email} onChange={(e) => setF("email", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Address"><input value={form.address} onChange={(e) => setF("address", e.target.value)} className={`mt-1 ${inputCls}`} /></L>

          <L label="TIN"><input value={form.tin} onChange={(e) => setF("tin", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="SSS No."><input value={form.sssNo} onChange={(e) => setF("sssNo", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="PhilHealth No."><input value={form.philhealthNo} onChange={(e) => setF("philhealthNo", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Pag-IBIG No."><input value={form.pagibigNo} onChange={(e) => setF("pagibigNo", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <div className="sm:col-span-3">
            <L label="Notes"><input value={form.notes} onChange={(e) => setF("notes", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          </div>
        </div>
        {err && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? "Saving…" : editing ? "Update" : "Save"}</button>
        </div>
      </Modal>
    </Card>
  );
}
