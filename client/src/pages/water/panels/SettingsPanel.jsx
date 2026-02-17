import { useEffect, useState } from "react";
import Card from "../../../components/Card";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";

export default function SettingsPanel() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  const [ratePerCubic, setRate] = useState(0);
  const [penaltyType, setPenaltyType] = useState("flat");
  const [penaltyValue, setPenaltyValue] = useState(0);

  // ✅ NEW
  const [dueDayOfMonth, setDueDayOfMonth] = useState(15);
  const [graceDays, setGraceDays] = useState(0);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const s = await apiFetch("/water/settings", { token });
      setRate(s.ratePerCubic || 0);
      setPenaltyType(s.penaltyType || "flat");
      setPenaltyValue(s.penaltyValue || 0);

      // ✅ NEW
      setDueDayOfMonth(s.dueDayOfMonth ?? 15);
      setGraceDays(s.graceDays ?? 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setErr("");
    try {
      await apiFetch("/water/settings", {
        method: "PUT",
        token,
        body: {
          ratePerCubic: Number(ratePerCubic),
          penaltyType,
          penaltyValue: Number(penaltyValue),

          // ✅ NEW
          dueDayOfMonth: Number(dueDayOfMonth),
          graceDays: Number(graceDays),
        },
      });
      setToast("✅ Settings saved");
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  return (
    <Card>
      <div className="text-lg font-black text-slate-900">Water Rate, Due Date & Penalty</div>
      <div className="text-xs text-slate-600 mt-1">
        Penalty applies only after due date. Bills auto-tag as overdue when past due.
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {toast}
        </div>
      )}
      {err && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {err}
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-slate-600">Loading...</div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-semibold text-slate-700">Rate (₱ per cu.m.)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={ratePerCubic}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Penalty Type</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={penaltyType}
              onChange={(e) => setPenaltyType(e.target.value)}
            >
              <option value="flat">Flat (₱)</option>
              <option value="percent">Percent (%)</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">
              Penalty Value ({penaltyType === "percent" ? "%" : "₱"})
            </label>
            <input
              type="number"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={penaltyValue}
              onChange={(e) => setPenaltyValue(e.target.value)}
            />
          </div>

          {/* ✅ NEW */}
          <div>
            <label className="text-sm font-semibold text-slate-700">Due Day of Month (1–31)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={dueDayOfMonth}
              onChange={(e) => setDueDayOfMonth(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Grace Days (0–60)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
            />
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              onClick={save}
              className="rounded-2xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
