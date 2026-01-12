import { useEffect, useMemo, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

export default function WaterSettingsPanel() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  // Form fields
  const [ratePerCubic, setRate] = useState(0);
  const [penaltyType, setPenaltyType] = useState("flat");
  const [penaltyValue, setPenaltyValue] = useState(0);

  const [dueDayOfMonth, setDueDayOfMonth] = useState(15);
  const [graceDays, setGraceDays] = useState(0);

  const [readingStartDayOfMonth, setReadingStartDayOfMonth] = useState(1);
  const [readingWindowDays, setReadingWindowDays] = useState(7);

  // Snapshot for "dirty" tracking + reset
  const [initial, setInitial] = useState(null);

  // Confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);

  function clamp(n, min, max) {
    const x = Number(n);
    if (Number.isNaN(x)) return min;
    return Math.min(max, Math.max(min, x));
  }

  const payload = useMemo(() => {
    return {
      ratePerCubic: Number(ratePerCubic),
      penaltyType,
      penaltyValue: Number(penaltyValue),
      dueDayOfMonth: clamp(dueDayOfMonth, 1, 31),
      graceDays: clamp(graceDays, 0, 60),
      readingStartDayOfMonth: clamp(readingStartDayOfMonth, 1, 31),
      readingWindowDays: clamp(readingWindowDays, 1, 31),
    };
  }, [
    ratePerCubic,
    penaltyType,
    penaltyValue,
    dueDayOfMonth,
    graceDays,
    readingStartDayOfMonth,
    readingWindowDays,
  ]);

  const isDirty = useMemo(() => {
    if (!initial) return false;
    return JSON.stringify(payload) !== JSON.stringify(initial);
  }, [payload, initial]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const s = await apiFetch("/water/settings", { token });

      const next = {
        ratePerCubic: Number(s.ratePerCubic || 0),
        penaltyType: s.penaltyType || "flat",
        penaltyValue: Number(s.penaltyValue || 0),
        dueDayOfMonth: s.dueDayOfMonth ?? 15,
        graceDays: s.graceDays ?? 0,
        readingStartDayOfMonth: s.readingStartDayOfMonth ?? 1,
        readingWindowDays: s.readingWindowDays ?? 7,
      };

      // Set form
      setRate(next.ratePerCubic);
      setPenaltyType(next.penaltyType);
      setPenaltyValue(next.penaltyValue);

      setDueDayOfMonth(next.dueDayOfMonth);
      setGraceDays(next.graceDays);

      setReadingStartDayOfMonth(next.readingStartDayOfMonth);
      setReadingWindowDays(next.readingWindowDays);

      // Set initial snapshot
      setInitial(next);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function resetToLoaded() {
    if (!initial) return;
    setRate(initial.ratePerCubic);
    setPenaltyType(initial.penaltyType);
    setPenaltyValue(initial.penaltyValue);

    setDueDayOfMonth(initial.dueDayOfMonth);
    setGraceDays(initial.graceDays);

    setReadingStartDayOfMonth(initial.readingStartDayOfMonth);
    setReadingWindowDays(initial.readingWindowDays);
  }

  async function doSave() {
    setErr("");
    setSaving(true);
    try {
      const saved = await apiFetch("/water/settings", {
        method: "PUT",
        token,
        body: payload,
      });

      const nextInitial = {
        ratePerCubic: Number(saved.ratePerCubic || payload.ratePerCubic),
        penaltyType: saved.penaltyType || payload.penaltyType,
        penaltyValue: Number(saved.penaltyValue || payload.penaltyValue),
        dueDayOfMonth: saved.dueDayOfMonth ?? payload.dueDayOfMonth,
        graceDays: saved.graceDays ?? payload.graceDays,
        readingStartDayOfMonth:
          saved.readingStartDayOfMonth ?? payload.readingStartDayOfMonth,
        readingWindowDays: saved.readingWindowDays ?? payload.readingWindowDays,
      };

      setInitial(nextInitial);

      setToast("✅ Settings saved");
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  return (
    <Card>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black text-slate-900">Water Settings</div>
          <div className="text-xs text-slate-600 mt-1">
            Billing (rate/due/penalty) + Meter Reading window schedule.
          </div>
        </div>

        {isDirty && !loading && (
          <div className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
            Unsaved changes
          </div>
        )}
      </div>

      {/* Toast / Errors */}
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
        <>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Rate (₱ per cu.m.)
              </label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                value={ratePerCubic}
                onChange={(e) => setRate(e.target.value)}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Must be ≥ 0.
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">
                Penalty Type
              </label>
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
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                value={penaltyValue}
                onChange={(e) => setPenaltyValue(e.target.value)}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Must be ≥ 0. Use % if type is Percent.
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">
                Due Day of Month (1–31)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                value={dueDayOfMonth}
                onChange={(e) => setDueDayOfMonth(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">
                Grace Days (0–60)
              </label>
              <input
                type="number"
                min={0}
                max={60}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">
                Reading Start Day (1–31)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                value={readingStartDayOfMonth}
                onChange={(e) => setReadingStartDayOfMonth(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">
                Reading Window Days (1–31)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                value={readingWindowDays}
                onChange={(e) => setReadingWindowDays(e.target.value)}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Reading window = Start day + window days.
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-xs text-slate-600">
              {isDirty ? (
                <span>
                  Changes aren’t saved yet. Click <b>Save</b> to apply.
                </span>
              ) : (
                <span>All changes are saved.</span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={load}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                ↻ Reload
              </button>

              <button
                onClick={resetToLoaded}
                disabled={!isDirty || saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                ↩ Reset
              </button>

              <button
                onClick={() => setConfirmOpen(true)}
                disabled={!isDirty || saving}
                className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "💾 Save"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !saving && setConfirmOpen(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="p-5">
              <div className="text-lg font-black text-slate-900">
                Confirm Save
              </div>
              <div className="mt-2 text-sm text-slate-600">
                You’re about to update the water billing settings. This will
                affect billing computations.
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="font-bold text-slate-800 mb-2">Summary</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>Rate: <b>₱{payload.ratePerCubic}</b></div>
                  <div>
                    Penalty:{" "}
                    <b>
                      {payload.penaltyType === "percent"
                        ? `${payload.penaltyValue}%`
                        : `₱${payload.penaltyValue}`}
                    </b>
                  </div>
                  <div>Due day: <b>{payload.dueDayOfMonth}</b></div>
                  <div>Grace days: <b>{payload.graceDays}</b></div>
                  <div>Reading start: <b>{payload.readingStartDayOfMonth}</b></div>
                  <div>Reading window: <b>{payload.readingWindowDays} days</b></div>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  disabled={saving}
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  onClick={async () => {
                    await doSave();
                    setConfirmOpen(false);
                  }}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Yes, Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
