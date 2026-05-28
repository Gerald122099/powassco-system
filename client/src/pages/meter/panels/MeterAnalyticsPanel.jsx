import { useEffect, useState } from "react";
import Card from "../../../components/Card";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import {
  RefreshCw,
  Users,
  UserCheck,
  UserX,
  CheckCircle2,
  CircleDashed,
  ReceiptText,
  AlertTriangle,
  BadgeCheck,
} from "lucide-react";

const TONES = {
  slate: "bg-slate-100 text-slate-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
};

function Stat({ icon, label, value, tone = "slate" }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon size={22} strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-tight text-slate-900">{value ?? 0}</div>
        <div className="truncate text-xs font-medium text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function thisPeriodKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MeterAnalyticsPanel() {
  const { token } = useAuth();
  const [periodKey, setPeriodKey] = useState(thisPeriodKey());
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const d = await apiFetch(`/water/analytics?periodKey=${encodeURIComponent(periodKey)}`, { token });
      setData(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [periodKey]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-slate-900">Meter Analytics</div>
          <div className="mt-0.5 text-sm text-slate-500">
            Read/unread, member status, and bills summary per month.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            placeholder="YYYY-MM"
            className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertTriangle size={16} /> {err}
        </div>
      )}

      {!data ? (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="mt-5 space-y-6">
          <Section title="Members">
            <Stat icon={Users} tone="slate" label="Total Members" value={data.members} />
            <Stat icon={UserCheck} tone="emerald" label="Active Members" value={data.activeMembers} />
            <Stat icon={UserX} tone="red" label="Disconnected" value={data.disconnectedMembers} />
          </Section>

          <Section title="Meters">
            <Stat icon={CheckCircle2} tone="emerald" label="Read Meters" value={data.readMeters} />
            <Stat icon={CircleDashed} tone="amber" label="Unread Meters" value={data.unreadMeters} />
          </Section>

          <Section title="Bills">
            <Stat icon={ReceiptText} tone="amber" label="Unpaid Bills" value={data.unpaidBills} />
            <Stat icon={AlertTriangle} tone="red" label="Overdue Bills" value={data.overdueBills} />
            <Stat icon={BadgeCheck} tone="emerald" label="Paid Bills" value={data.paidBills} />
          </Section>
        </div>
      )}
    </Card>
  );
}
