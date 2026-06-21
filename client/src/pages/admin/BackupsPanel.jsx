// Admin: automated off-site database backups. A daily job snapshots every
// collection (gzipped, stored in GridFS); admins download them off-site or
// run one on demand. If SMTP env vars are set, each backup is auto-emailed.
import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch, apiDownload } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { DatabaseBackup, Download, RefreshCw, Trash2, Play, Mail, MailWarning, ShieldCheck, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

const when = (d) => (d ? new Date(d).toLocaleString() : "—");
const mb = (b) => `${(Number(b || 0) / 1024 / 1024).toFixed(2)} MB`;

// Shown on the admin home: warns when the last successful backup is stale
// (≥3 days) or missing, nudging the admin to download/keep one off-site.
export function BackupReminder({ onOpen }) {
  const { token } = useAuth();
  const [info, setInfo] = useState(null);
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem("pow_backup_remind") === "1"; } catch { return false; } });
  useEffect(() => {
    apiFetch("/admin/backups", { token })
      .then((r) => {
        const ok = (r.items || []).find((b) => b.status === "ok" && b.at);
        const days = ok ? Math.floor((Date.now() - new Date(ok.at).getTime()) / 86400000) : null;
        setInfo({ days, emailOn: !!r.emailConfigured, none: !ok });
      })
      .catch(() => {});
  }, [token]);
  if (dismissed || !info) return null;
  const stale = info.none || info.days >= 3;
  if (!stale) return null;
  function dismiss() { setDismissed(true); try { sessionStorage.setItem("pow_backup_remind", "1"); } catch { /* ignore */ } }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
      <AlertTriangle size={18} className="shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <b>{info.none ? "No database backup yet." : `Last database backup was ${info.days} day${info.days === 1 ? "" : "s"} ago.`}</b>{" "}
        {info.emailOn ? "Auto-email is on — keeping an occasional manual copy is still wise." : "Download a snapshot and store it off-site (Drive/USB)."}
      </div>
      <button onClick={onOpen} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">Open Backups</button>
      <button onClick={dismiss} className="shrink-0 rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">Dismiss</button>
    </div>
  );
}

export default function BackupsPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [emailOn, setEmailOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [dl, setDl] = useState("");

  async function load() {
    setLoading(true);
    try { const r = await apiFetch("/admin/backups", { token }); setItems(r.items || []); setEmailOn(!!r.emailConfigured); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function runNow() {
    setRunning(true);
    try { await apiFetch("/admin/backups/run", { method: "POST", token }); toast.success("Backup created."); load(); }
    catch (e) { toast.error("Backup failed: " + e.message); } finally { setRunning(false); }
  }
  async function download(b) {
    setDl(b._id);
    try { await apiDownload(`/admin/backups/${b._id}/download`, { token, filename: b.filename }); }
    catch (e) { toast.error("Download failed: " + e.message); } finally { setDl(""); }
  }
  async function remove(b) {
    if (!window.confirm(`Delete backup ${b.filename}? This can't be undone.`)) return;
    try { await apiFetch(`/admin/backups/${b._id}`, { method: "DELETE", token }); toast.success("Deleted."); load(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <DatabaseBackup size={20} className="text-emerald-600" /> Database Backups
          </div>
          <div className="mt-0.5 text-sm text-slate-500">A full snapshot of every collection runs automatically each day. Download one and keep it safe off-site (Drive / USB).</div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={runNow} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {running ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />} {running ? "Backing up…" : "Back up now"}
          </button>
        </div>
      </div>

      {/* Off-site email status */}
      <div className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${emailOn ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {emailOn ? <Mail size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <MailWarning size={16} className="mt-0.5 shrink-0 text-amber-600" />}
        {emailOn ? (
          <div><b>Auto-email is ON.</b> Each backup is emailed off-site automatically — fully hands-off.</div>
        ) : (
          <div>
            <b>Auto-email is OFF — backups are kept in the database + downloadable here.</b> For fully-automated off-site delivery, set these on the server (Render → Environment): <span className="font-mono text-[11px]">SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, BACKUP_EMAIL_TO</span>. Until then, download the latest snapshot regularly and store it off-site.
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No backups yet. Click “Back up now”, or the daily job will create one.</div>
        ) : items.map((b) => (
          <div key={b._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {b.status === "ok"
                  ? <CheckCircle2 size={15} className="text-emerald-600" />
                  : <AlertTriangle size={15} className="text-red-600" />}
                <span className="font-mono text-xs font-semibold text-slate-800">{b.filename || "(failed)"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${b.kind === "manual" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{b.kind}</span>
                {b.emailed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><ShieldCheck size={10} /> emailed</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><Clock size={11} /> {when(b.at)}</span>
                {b.status === "ok" ? <span>{mb(b.sizeBytes)} • {b.docCount?.toLocaleString()} docs • {b.collections} collections</span> : <span className="text-red-600">{b.error}</span>}
              </div>
            </div>
            {b.status === "ok" && b.fileId && (
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => download(b)} disabled={dl === b._id} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50">
                  {dl === b._id ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />} Download
                </button>
                <button onClick={() => remove(b)} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={13} /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-500">
        <b>Restore:</b> each file is gzipped NDJSON — one JSON line per document, tagged with its collection (<span className="font-mono">{"{ _c, d }"}</span>). Keep the last few off-site; older snapshots are auto-pruned (last 14 kept).
      </div>
    </Card>
  );
}
