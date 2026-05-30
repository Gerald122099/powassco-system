import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Plus, Trash2, RefreshCw, CalendarClock } from "lucide-react";

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const AUDIENCES = [
  { v: "all", label: "Everyone" },
  { v: "admin", label: "Admins" },
  { v: "water_bill_officer", label: "Water Bill Officers" },
  { v: "loan_officer", label: "Loan Officers" },
  { v: "meter_reader", label: "Meter Readers" },
  { v: "plumber", label: "Plumbers" },
  { v: "cashier", label: "Cashiers" },
];
const TYPES = ["meeting", "event", "training", "holiday", "deadline", "other"];
const EMPTY = { title: "", type: "meeting", datetime: "", location: "", notes: "", audience: "all" };

export default function MeetingsPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  async function load() {
    setLoading(true);
    setErr("");
    try {
      setItems(await apiFetch("/meetings", { token }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.datetime) return setErr("Title and date/time are required.");
    setErr("");
    setSaving(true);
    try {
      await apiFetch("/meetings", { method: "POST", token, body: form });
      setForm(EMPTY);
      flash("Meeting scheduled.");
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(m) {
    if (!confirm(`Delete meeting "${m.title}"?`)) return;
    try {
      await apiFetch(`/meetings/${m._id}`, { method: "DELETE", token });
      flash("Meeting deleted.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900"><CalendarClock size={20} className="text-blue-600" /> Calendar &amp; Events</div>
          <div className="mt-0.5 text-sm text-slate-500">Meetings &amp; events (venue, type, agenda) show on the chosen roles' dashboards.</div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      <form onSubmit={add} className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-slate-600">Title</label>
          <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. General Assembly" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Type</label>
          <select className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Date & Time</label>
          <input type="datetime-local" className={inputCls} value={form.datetime} onChange={(e) => set("datetime", e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Show to</label>
          <select className={inputCls} value={form.audience} onChange={(e) => set("audience", e.target.value)}>
            {AUDIENCES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Location</label>
          <input className={inputCls} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Cooperative Hall" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Notes</label>
          <input className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Agenda / reminders" />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><Plus size={16} /> {saving ? "Saving…" : "Schedule Meeting"}</button>
        </div>
      </form>

      <div className="mt-5 space-y-2">
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No meetings scheduled.</div>
        ) : (
          items.map((m) => {
            const past = new Date(m.datetime) < new Date();
            return (
              <div key={m._id} className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${past ? "border-slate-200 bg-slate-50 opacity-70" : "border-slate-200"}`}>
                <div>
                  <div className="font-semibold text-slate-900">
                    <span className="mr-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold capitalize text-blue-700">{m.type || "meeting"}</span>
                    {m.title} {past && <span className="text-xs font-normal text-slate-400">(past)</span>}
                  </div>
                  <div className="text-sm text-slate-600">{new Date(m.datetime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}{m.location ? ` • ${m.location}` : ""}</div>
                  <div className="text-xs text-slate-400">For: {AUDIENCES.find((a) => a.v === m.audience)?.label || m.audience}{m.notes ? ` • ${m.notes}` : ""}</div>
                </div>
                <button onClick={() => remove(m)} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
