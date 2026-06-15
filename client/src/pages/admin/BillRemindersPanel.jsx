// Admin panel: configure the water-bill reminder push schedule and the
// Collection Day, plus preview / send a pass on demand. Self-contained —
// it loads water settings, saves ONLY the reminder-related fields (the
// server does a partial merge), and hits the /admin/reminders endpoints.
import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import Swal from "sweetalert2";
import { BellRing, Send, Eye, Save } from "lucide-react";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h) => {
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${am ? "AM" : "PM"}`;
};

export default function BillRemindersPanel() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const [collectionDay, setCollectionDay] = useState(17);
  const [enabled, setEnabled] = useState(true);
  const [sendHour, setSendHour] = useState(8);
  const [dueSoonDays, setDueSoonDays] = useState(3);
  const [collectionLeadDays, setCollectionLeadDays] = useState(2);
  const [overdueDaily, setOverdueDaily] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await apiFetch("/water/settings", { token });
        setCollectionDay(s.collectionDayOfMonth ?? s.dueDayOfMonth ?? 17);
        const br = s.billReminders || {};
        setEnabled(br.enabled !== false);
        setSendHour(br.sendHour ?? 8);
        setDueSoonDays(br.dueSoonDays ?? 3);
        setCollectionLeadDays(br.collectionLeadDays ?? 2);
        setOverdueDaily(br.overdueDaily !== false);
      } catch (e) {
        Swal.fire("Could not load settings", e.message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/water/settings", {
        method: "PUT",
        token,
        body: {
          collectionDayOfMonth: clamp(collectionDay, 1, 31),
          billReminders: {
            enabled,
            sendHour: clamp(sendHour, 0, 23),
            dueSoonDays: clamp(dueSoonDays, 0, 30),
            collectionLeadDays: clamp(collectionLeadDays, 0, 30),
            overdueDaily,
          },
        },
      });
      Swal.fire({ icon: "success", title: "Reminder settings saved", timer: 1400, showConfirmButton: false });
    } catch (e) {
      Swal.fire("Save failed", e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    setBusy(true);
    setPreview(null);
    try {
      const res = await apiFetch("/admin/reminders/preview", { token });
      setPreview(res);
    } catch (e) {
      Swal.fire("Preview failed", e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    const ok = await Swal.fire({
      icon: "warning",
      title: "Send reminders now?",
      html: "This sends today's due reminder push to every subscribed device. It respects the once-per-bill-per-day rule, so already-notified bills are skipped.",
      showCancelButton: true,
      confirmButtonText: "Send now",
      confirmButtonColor: "#7c3aed",
    });
    if (!ok.isConfirmed) return;
    setBusy(true);
    try {
      const res = await apiFetch("/admin/reminders/run", { method: "POST", token, body: { dry: false } });
      Swal.fire({
        icon: "success",
        title: "Reminders sent",
        html: `Bills considered: <b>${res.considered || 0}</b><br/>Pushes sent: <b>${res.sent || 0}</b><br/>Already sent today (skipped): <b>${res.skippedAlreadySent || 0}</b>`,
      });
      setPreview(null);
    } catch (e) {
      Swal.fire("Send failed", e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Card><div className="p-4 text-sm text-slate-500">Loading reminder settings…</div></Card>;

  return (
    <Card>
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <BellRing className="text-violet-600" size={18} />
          <h3 className="text-base font-bold text-slate-800">Bill Reminders (Push Notifications)</h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Members who saved their account/meter in the app get automatic reminders: when a new bill is ready,
          a few days before the due date and collection day, and every day once overdue (until paid — it stops
          if the meter is disconnected or the account is suspended).
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Collection Day (day of month)</span>
            <input type="number" min={1} max={31} value={collectionDay}
              onChange={(e) => setCollectionDay(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            <span className="mt-1 block text-[11px] text-slate-400">The coop's scheduled collection date, in the month after the billed period.</span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Daily send time</span>
            <select value={sendHour} onChange={(e) => setSendHour(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 bg-white">
              {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-slate-400">Reminders go out once a day at this time (Philippine time).</span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Remind before collection (days)</span>
            <input type="number" min={0} max={30} value={collectionLeadDays}
              onChange={(e) => setCollectionLeadDays(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Remind before due date (days)</span>
            <input type="number" min={0} max={30} value={dueSoonDays}
              onChange={(e) => setDueSoonDays(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </label>

          <label className="flex items-center gap-2 mt-5">
            <input type="checkbox" checked={overdueDaily} onChange={(e) => setOverdueDaily(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300" />
            <span className="text-sm text-slate-700">Repeat daily while overdue</span>
          </label>

          <label className="flex items-center gap-2 mt-5">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300" />
            <span className="text-sm font-semibold text-slate-700">Reminders enabled</span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            <Save size={15} /> {saving ? "Saving…" : "Save settings"}
          </button>
          <button onClick={runPreview} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Eye size={15} /> Preview now
          </button>
          <button onClick={sendNow} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
            <Send size={15} /> Send now
          </button>
        </div>

        {preview && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-700">
              Preview — {preview.considered || 0} bill(s) would be notified
              {preview.byType && Object.keys(preview.byType).length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({Object.entries(preview.byType).map(([k, v]) => `${k}: ${v}`).join(" · ")})
                </span>
              )}
            </div>
            {Array.isArray(preview.preview) && preview.preview.length > 0 ? (
              <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Account</th>
                      <th className="px-2 py-1.5">Meter</th>
                      <th className="px-2 py-1.5">Period</th>
                      <th className="px-2 py-1.5">Type</th>
                      <th className="px-2 py-1.5">Devices</th>
                      <th className="px-2 py-1.5">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((p, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 font-mono">{p.pnNo}</td>
                        <td className="px-2 py-1.5 font-mono">{p.meterNumber}</td>
                        <td className="px-2 py-1.5">{p.periodKey}</td>
                        <td className="px-2 py-1.5">{p.type}</td>
                        <td className="px-2 py-1.5 text-center">{p.devices}</td>
                        <td className="px-2 py-1.5 text-slate-500">{p.body}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-500">No bills match a reminder today (or no devices are subscribed yet).</div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
