import { useEffect, useState } from "react";
import Card from "../../../components/Card";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-black text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function thisPeriodKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function MeterAnalyticsPanel() {
  const { token } = useAuth();
  const [periodKey, setPeriodKey] = useState(thisPeriodKey());
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const d = await apiFetch(`/water/analytics?periodKey=${encodeURIComponent(periodKey)}`, { token });
      setData(d);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [periodKey]);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-lg font-black text-slate-900">Meter Analytics</div>
          <div className="text-xs text-slate-600 mt-1">Read/unread + member status + bills summary per month.</div>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            placeholder="YYYY-MM"
            className="w-32 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
          />
          <button
            onClick={load}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {err}
        </div>
      )}

      {!data ? (
        <div className="mt-4 text-slate-600">Loading...</div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat label="Total Members" value={data.members} />
          <Stat label="Active Members" value={data.activeMembers} />
          <Stat label="Disconnected Members" value={data.disconnectedMembers} />

          <Stat label="Read Meters" value={data.readMeters} />
          <Stat label="Unread Meters" value={data.unreadMeters} />

          <Stat label="Unpaid Bills" value={data.unpaidBills} />
          <Stat label="Overdue Bills" value={data.overdueBills} />
          <Stat label="Paid Bills" value={data.paidBills} />
        </div>
      )}
    </Card>
  );
}
