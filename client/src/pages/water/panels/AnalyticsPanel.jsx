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

export default function AnalyticsPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const d = await apiFetch("/water/analytics/", { token });
      setData(d);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-black text-slate-900">Analytics</div>
          <div className="text-xs text-slate-600 mt-1">Quick totals for members, unpaid, and collections.</div>
        </div>
        <button
          onClick={load}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          Refresh
        </button>
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
          <Stat label="Unpaid Bills" value={data.unpaidBills} />
          <Stat label="Paid Bills" value={data.paidBills} />
          <Stat label="Unpaid Amount" value={`₱ ${Number(data.unpaidAmount || 0).toFixed(2)}`} />
          <Stat label="Collected Amount" value={`₱ ${Number(data.collectedAmount || 0).toFixed(2)}`} />
        </div>
      )}
    </Card>
  );
}
