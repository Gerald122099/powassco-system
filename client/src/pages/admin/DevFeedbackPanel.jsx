// Admin inbox for the public "Message the Developer" form on the
// homepage. Unread messages float to the top with a bold badge;
// mark-read / delete per row.

import { useEffect, useState, useCallback } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Inbox, RefreshCw, Trash2, MailOpen, Mail } from "lucide-react";

const fmt = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function DevFeedbackPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const qs = filter ? `?status=${filter}` : "";
      const res = await apiFetch(`/public/dev-feedback/admin${qs}`, { token });
      setItems(res.items || []);
      setUnread(res.unread || 0);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }, [token, filter]);
  useEffect(() => { load(); }, [load]);

  async function toggleRead(row) {
    try {
      await apiFetch(`/public/dev-feedback/admin/${row._id}`, {
        method: "PATCH",
        token,
        body: { status: row.status === "unread" ? "read" : "unread" },
      });
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function remove(row) {
    if (!window.confirm("Delete this feedback message permanently?")) return;
    try {
      await apiFetch(`/public/dev-feedback/admin/${row._id}`, { method: "DELETE", token });
      toast.success("Deleted.");
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Inbox size={20} className="text-emerald-600" /> Developer Feedback
            {unread > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">{unread} unread</span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Messages from the public "Message the Developer" form on the homepage.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 p-1 text-xs font-semibold">
            {[["", "All"], ["unread", "Unread"], ["read", "Read"]].map(([k, label]) => (
              <button
                key={k || "all"}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded-lg px-3 py-1 ${filter === k ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
              >
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
            No feedback{filter ? ` (${filter})` : ""} yet.
          </div>
        ) : items.map((row) => (
          <div
            key={row._id}
            className={`rounded-2xl border p-4 ${row.status === "unread" ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  {row.status === "unread"
                    ? <Mail size={14} className="text-emerald-600" />
                    : <MailOpen size={14} className="text-slate-400" />}
                  <span className={`text-sm ${row.status === "unread" ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                    {row.name || "Anonymous"}
                  </span>
                  {row.contact && <span className="text-xs text-slate-500">· {row.contact}</span>}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">{fmt(row.createdAt)}{row.page ? ` · from ${row.page}` : ""}</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleRead(row)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Mark {row.status === "unread" ? "read" : "unread"}
                </button>
                <button
                  onClick={() => remove(row)}
                  className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{row.message}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
