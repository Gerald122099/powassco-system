import { useEffect, useMemo, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

export default function WaterSettingsPanel() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tariffSaving, setTariffSaving] = useState(false);

  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  // Collapsible states
  const [open, setOpen] = useState(true);
  const [tariffOpen, setTariffOpen] = useState(false);

  // BASIC SETTINGS STATE
  const [penaltyType, setPenaltyType] = useState("flat");
  const [penaltyValue, setPenaltyValue] = useState(0);
  const [dueDayOfMonth, setDueDayOfMonth] = useState(15);
  const [graceDays, setGraceDays] = useState(0);
  const [readingStartDayOfMonth, setReadingStartDayOfMonth] = useState(1);
  const [readingWindowDays, setReadingWindowDays] = useState(7);

  // TARIFF SETTINGS STATE
  const [tariffs, setTariffs] = useState({
    residential: [],
    commercial: []
  });
  const [seniorSettings, setSeniorSettings] = useState({
    discountRate: 5,
    applicableTiers: ["31-40", "41+"]
  });

  // Snapshots for dirty tracking
  const [initial, setInitial] = useState(null);
  const [tariffInitial, setTariffInitial] = useState(null);

  // Confirmation modals
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tariffConfirmOpen, setTariffConfirmOpen] = useState(false);

  function clamp(n, min, max) {
    const x = Number(n);
    if (Number.isNaN(x)) return min;
    return Math.min(max, Math.max(min, x));
  }

  // Basic settings payload
  const payload = useMemo(() => {
    return {
      penaltyType,
      penaltyValue: Number(penaltyValue),
      dueDayOfMonth: clamp(dueDayOfMonth, 1, 31),
      graceDays: clamp(graceDays, 0, 60),
      readingStartDayOfMonth: clamp(readingStartDayOfMonth, 1, 31),
      readingWindowDays: clamp(readingWindowDays, 1, 31),
    };
  }, [
    penaltyType,
    penaltyValue,
    dueDayOfMonth,
    graceDays,
    readingStartDayOfMonth,
    readingWindowDays,
  ]);

  // Tariff payload
  const tariffPayload = useMemo(() => {
    return {
      tariffs,
      seniorDiscount: seniorSettings
    };
  }, [tariffs, seniorSettings]);

  const isDirty = useMemo(() => {
    if (!initial) return false;
    return JSON.stringify(payload) !== JSON.stringify(initial);
  }, [payload, initial]);

  const isTariffDirty = useMemo(() => {
    if (!tariffInitial) return false;
    return JSON.stringify(tariffPayload) !== JSON.stringify(tariffInitial);
  }, [tariffPayload, tariffInitial]);

  // Tariff examples function
  const getTariffExamples = (classification) => {
    if (classification === "residential") {
      return [
        { consumption: 5, amount: 74.00, description: "0-5 m³ = ₱74.00 (minimum charge)" },
        { consumption: 6, amount: 90.20, description: "6 m³ = ₱74.00 + (1 × ₱16.20) = ₱90.20" },
        { consumption: 10, amount: 155.00, description: "10 m³ = ₱74.00 + (5 × ₱16.20) = ₱155.00" },
        { consumption: 11, amount: 172.70, description: "11 m³ = ₱74.00 + (6 × ₱17.70) = ₱172.70" },
        { consumption: 20, amount: 332.00, description: "20 m³ = ₱74.00 + (15 × ₱17.70) = ₱332.00" },
        { consumption: 21, amount: 351.20, description: "21 m³ = ₱74.00 + (16 × ₱19.20) = ₱351.20" },
        { consumption: 30, amount: 524.00, description: "30 m³ = ₱74.00 + (25 × ₱19.20) = ₱524.00" },
        { consumption: 31, amount: 544.70, description: "31 m³ = ₱74.00 + (26 × ₱20.70) = ₱544.70" },
        { consumption: 40, amount: 731.00, description: "40 m³ = ₱74.00 + (35 × ₱20.70) = ₱731.00" },
        { consumption: 41, amount: 753.20, description: "41 m³ = ₱74.00 + (36 × ₱22.20) = ₱753.20" },
        { consumption: 50, amount: 953.00, description: "50 m³ = ₱74.00 + (45 × ₱22.20) = ₱953.00" },
        { consumption: 60, amount: 1175.00, description: "60 m³ = ₱74.00 + (55 × ₱22.20) = ₱1,175.00" },
        { consumption: 70, amount: 1397.00, description: "70 m³ = ₱74.00 + (65 × ₱22.20) = ₱1,397.00" },
        { consumption: 80, amount: 1619.00, description: "80 m³ = ₱74.00 + (75 × ₱22.20) = ₱1,619.00" }
      ];
    } else if (classification === "commercial") {
      return [
        { consumption: 15, amount: 442.50, description: "0-15 m³ = ₱442.50 (minimum charge)" },
        { consumption: 16, amount: 475.00, description: "16 m³ = ₱442.50 + (1 × ₱32.50) = ₱475.00" },
        { consumption: 20, amount: 605.00, description: "20 m³ = ₱442.50 + (5 × ₱32.50) = ₱605.00" },
        { consumption: 30, amount: 930.00, description: "30 m³ = ₱442.50 + (15 × ₱32.50) = ₱930.00" },
        { consumption: 31, amount: 965.40, description: "31 m³ = ₱442.50 + (16 × ₱35.40) = ₱965.40" },
        { consumption: 40, amount: 1284.00, description: "40 m³ = ₱442.50 + (25 × ₱35.40) = ₱1,284.00" },
        { consumption: 50, amount: 1638.00, description: "50 m³ = ₱442.50 + (35 × ₱35.40) = ₱1,638.00" },
        { consumption: 70, amount: 2346.00, description: "70 m³ = ₱442.50 + (55 × ₱35.40) = ₱2,346.00" },
        { consumption: 90, amount: 3054.00, description: "90 m³ = ₱442.50 + (75 × ₱35.40) = ₱3,054.00" }
      ];
    }
    return [];
  };

  // LOAD SETTINGS
  async function loadSettings() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiFetch("/water/settings", { token });
      
      // Ensure tariffs have all required fields
      const ensureTariffFields = (tariffList) => {
        return tariffList.map(t => ({
          ...t,
          chargeType: t.chargeType || "per_cubic",
          flatAmount: t.flatAmount || 0,
          ratePerCubic: t.ratePerCubic || 0,
          isActive: t.isActive !== undefined ? t.isActive : true
        }));
      };
      
      // Basic settings
      setPenaltyType(data.penaltyType || "flat");
      setPenaltyValue(data.penaltyValue || 0);
      setDueDayOfMonth(data.dueDayOfMonth ?? 15);
      setGraceDays(data.graceDays ?? 0);
      setReadingStartDayOfMonth(data.readingStartDayOfMonth ?? 1);
      setReadingWindowDays(data.readingWindowDays ?? 7);
      
      // Tariff settings with ensured fields
      setTariffs({
        residential: ensureTariffFields(data.tariffs?.residential || []),
        commercial: ensureTariffFields(data.tariffs?.commercial || [])
      });
      
      setSeniorSettings(data.seniorDiscount || {
        discountRate: 5,
        applicableTiers: ["31-40", "41+"]
      });
      
      // Set snapshots
      setInitial({
        penaltyType: data.penaltyType || "flat",
        penaltyValue: data.penaltyValue || 0,
        dueDayOfMonth: data.dueDayOfMonth ?? 15,
        graceDays: data.graceDays ?? 0,
        readingStartDayOfMonth: data.readingStartDayOfMonth ?? 1,
        readingWindowDays: data.readingWindowDays ?? 7,
      });
      
      setTariffInitial({
        tariffs: {
          residential: ensureTariffFields(data.tariffs?.residential || []),
          commercial: ensureTariffFields(data.tariffs?.commercial || [])
        },
        seniorDiscount: data.seniorDiscount || {
          discountRate: 5,
          applicableTiers: ["31-40", "41+"]
        }
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  // SAVE BASIC SETTINGS
  async function saveBasicSettings() {
    setErr("");
    setSaving(true);
    try {
      const saved = await apiFetch("/water/settings", {
        method: "PUT",
        token,
        body: payload,
      });

      setInitial({
        penaltyType: saved.penaltyType || payload.penaltyType,
        penaltyValue: saved.penaltyValue || payload.penaltyValue,
        dueDayOfMonth: saved.dueDayOfMonth ?? payload.dueDayOfMonth,
        graceDays: saved.graceDays ?? payload.graceDays,
        readingStartDayOfMonth: saved.readingStartDayOfMonth ?? payload.readingStartDayOfMonth,
        readingWindowDays: saved.readingWindowDays ?? payload.readingWindowDays,
      });

      setToast("✅ Basic settings saved");
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  // SAVE TARIFF SETTINGS
  async function saveTariffSettings() {
    setTariffSaving(true);
    setErr("");
    try {
      // Clean and validate tariff data with all required fields
      const cleanTariffs = {
        residential: tariffs.residential.map(t => ({
          tier: String(t.tier || '').trim(),
          minConsumption: Number(t.minConsumption) || 0,
          maxConsumption: Number(t.maxConsumption) || 0,
          chargeType: t.chargeType || "per_cubic",
          ratePerCubic: Number(t.ratePerCubic) || 0,
          flatAmount: Number(t.flatAmount) || 0,
          description: String(t.description || '').trim(),
          isActive: Boolean(t.isActive)
        })),
        commercial: tariffs.commercial.map(t => ({
          tier: String(t.tier || '').trim(),
          minConsumption: Number(t.minConsumption) || 0,
          maxConsumption: Number(t.maxConsumption) || 0,
          chargeType: t.chargeType || "per_cubic",
          ratePerCubic: Number(t.ratePerCubic) || 0,
          flatAmount: Number(t.flatAmount) || 0,
          description: String(t.description || '').trim(),
          isActive: Boolean(t.isActive)
        }))
      };

      const cleanSeniorSettings = {
        discountRate: Number(seniorSettings.discountRate) || 5,
        applicableTiers: Array.isArray(seniorSettings.applicableTiers) 
          ? seniorSettings.applicableTiers.map(t => String(t).trim()).filter(t => t)
          : ["31-40", "41+"]
      };

      // Combine with current basic settings
      const combinedPayload = {
        ...payload,
        tariffs: cleanTariffs,
        seniorDiscount: cleanSeniorSettings
      };

      console.log("Saving tariff payload:", combinedPayload);

      const saved = await apiFetch("/water/settings", {
        method: "PUT",
        token,
        body: combinedPayload,
      });

      console.log("Server response:", saved);

      // Update both snapshots
      setTariffInitial({
        tariffs: saved.tariffs || cleanTariffs,
        seniorDiscount: saved.seniorDiscount || cleanSeniorSettings
      });

      setInitial({
        penaltyType: saved.penaltyType || payload.penaltyType,
        penaltyValue: saved.penaltyValue || payload.penaltyValue,
        dueDayOfMonth: saved.dueDayOfMonth ?? payload.dueDayOfMonth,
        graceDays: saved.graceDays ?? payload.graceDays,
        readingStartDayOfMonth: saved.readingStartDayOfMonth ?? payload.readingStartDayOfMonth,
        readingWindowDays: saved.readingWindowDays ?? payload.readingWindowDays,
      });

      // Update local state with saved data
      setTariffs(saved.tariffs || cleanTariffs);
      setSeniorSettings(saved.seniorDiscount || cleanSeniorSettings);

      setToast("✅ Tariff settings saved");
      setTimeout(() => setToast(""), 2000);
    } catch (error) {
      console.error("Save error:", error);
      setErr(error.message || "Failed to save tariff settings");
    } finally {
      setTariffSaving(false);
    }
  }

  // RESET TO DEFAULTS
  async function resetToDefaults() {
    if (!confirm("Reset all settings to default values?")) return;
    
    try {
      const data = await apiFetch("/water/settings/reset", {
        method: "POST",
        token,
      });
      
      // Reload settings
      await loadSettings();
      setToast("✅ Settings reset to defaults");
      setTimeout(() => setToast(""), 2000);
    } catch (error) {
      setErr("Failed to reset settings");
    }
  }

  // TARIFF HELPER FUNCTIONS
  function updateTariff(classification, index, field, value) {
    const updated = { ...tariffs };
    let newValue = value;
    
    if (field === 'isActive') {
      newValue = value === 'true';
    } else if (field === 'minConsumption' || field === 'maxConsumption' || 
               field === 'ratePerCubic' || field === 'flatAmount') {
      newValue = Number(value);
    }
    
    updated[classification][index] = { 
      ...updated[classification][index], 
      [field]: newValue 
    };
    
    // Ensure required fields exist
    if (!updated[classification][index].chargeType) {
      updated[classification][index].chargeType = "per_cubic";
    }
    
    setTariffs(updated);
  }

  function addNewTariff(classification) {
    const updated = { ...tariffs };
    updated[classification] = [
      ...updated[classification],
      {
        tier: "",
        minConsumption: 0,
        maxConsumption: 0,
        chargeType: "per_cubic",
        ratePerCubic: 0,
        flatAmount: 0,
        description: "",
        isActive: true,
      }
    ];
    setTariffs(updated);
  }

  function removeTariff(classification, index) {
    const updated = { ...tariffs };
    updated[classification].splice(index, 1);
    setTariffs(updated);
  }

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line
  }, []);

  return (
    <Card>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black text-slate-900">Water Settings</div>
          <div className="text-xs text-slate-600 mt-1">
            Billing penalties, due dates, and tariff configuration.
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(isDirty || isTariffDirty) && !loading && (
            <div className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
              Unsaved changes
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            {open ? "▲ Hide" : "▼ Show"}
          </button>
        </div>
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
        <div className="mt-4 text-slate-600">Loading settings...</div>
      ) : (
        <>
          {/* BASIC SETTINGS */}
          <div className={[
            "overflow-hidden transition-all duration-300 ease-out",
            open ? "max-h-[2000px] opacity-100 mt-4" : "max-h-0 opacity-0 mt-0",
          ].join(" ")}>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Penalty Type */}
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Penalty Type
                </label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={penaltyType}
                  onChange={(e) => setPenaltyType(e.target.value)}
                >
                  <option value="flat">Flat Amount (₱)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
              </div>

              {/* Penalty Value */}
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Penalty Value ({penaltyType === "percent" ? "%" : "₱"})
                </label>
                <input
                  type="number"
                  min={0}
                  step={penaltyType === "percent" ? "0.1" : "0.01"}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={penaltyValue}
                  onChange={(e) => setPenaltyValue(e.target.value)}
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  {penaltyType === "percent" ? "Percentage of bill amount" : "Fixed penalty amount"}
                </div>
              </div>

              {/* Due Day */}
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

              {/* Grace Days */}
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
                <div className="mt-1 text-[11px] text-slate-500">
                  Extra days before penalty applies
                </div>
              </div>

              {/* Reading Start Day */}
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

              {/* Reading Window Days */}
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
                  Reading window = Start day + window days
                </div>
              </div>
            </div>

            {/* Basic Settings Actions */}
            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-xs text-slate-600">
                {isDirty ? (
                  <span>Basic settings changes aren't saved yet.</span>
                ) : (
                  <span>Basic settings are saved.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadSettings}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  ↻ Reload
                </button>

                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!isDirty || saving}
                  className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-black text-white hover:bg-blue-700"
                >
                  {saving ? "Saving..." : "💾 Save Basic Settings"}
                </button>
              </div>
            </div>

            {/* TARIFF SETTINGS SECTION */}
            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-md font-bold text-slate-800">Tariff Settings</h3>
                  <div className="text-xs text-slate-600 mt-1">
                    Configure tiered rates for residential and commercial accounts.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTariffOpen(!tariffOpen)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  {tariffOpen ? "▲ Hide Tariffs" : "▼ Show Tariffs"}
                </button>
              </div>
              
              {tariffOpen && (
                <div className="space-y-6">
                  {/* Senior Citizen Discount Settings */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-bold text-slate-800 mb-3">Senior Citizen Discount</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-slate-700">
                          Default Discount Rate (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                          value={seniorSettings.discountRate}
                          onChange={(e) => setSeniorSettings({
                            ...seniorSettings,
                            discountRate: parseFloat(e.target.value) || 0
                          })}
                        />
                      </div>
                      
                      <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-slate-700">
                          Applicable Tiers (comma-separated)
                        </label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                          value={seniorSettings.applicableTiers.join(", ")}
                          onChange={(e) => setSeniorSettings({
                            ...seniorSettings,
                            applicableTiers: e.target.value.split(",").map(t => t.trim()).filter(t => t)
                          })}
                          placeholder="31-40, 41+"
                        />
                        <div className="mt-1 text-[11px] text-slate-500">
                          Senior discount applies only to these tiers
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Residential Tariffs */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-blue-700">Residential Tariffs</h4>
                      <button
                        onClick={() => addNewTariff("residential")}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
                      >
                        + Add Tier
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200 mb-4">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="py-3 px-4 text-left">Tier</th>
                            <th className="py-3 px-4 text-left">Min (m³)</th>
                            <th className="py-3 px-4 text-left">Max (m³)</th>
                            <th className="py-3 px-4 text-left">Rate (₱/m³)</th>
                            <th className="py-3 px-4 text-left">Description</th>
                            <th className="py-3 px-4 text-left">Status</th>
                            <th className="py-3 px-4 text-left"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {tariffs.residential.map((tariff, index) => (
                            <tr key={`res-${index}`} className="border-t hover:bg-slate-50/60">
                              <td className="py-3 px-4">
                                <input
                                  type="text"
                                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                  value={tariff.tier}
                                  onChange={(e) => updateTariff("residential", index, 'tier', e.target.value)}
                                  placeholder="e.g., 0-5"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                  value={tariff.minConsumption}
                                  onChange={(e) => updateTariff("residential", index, 'minConsumption', e.target.value)}
                                />
                              </td>
                              <td className="py-3 px-4">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                  value={tariff.maxConsumption}
                                  onChange={(e) => updateTariff("residential", index, 'maxConsumption', e.target.value)}
                                />
                              </td>
                              <td className="py-3 px-4">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                  value={tariff.ratePerCubic}
                                  onChange={(e) => updateTariff("residential", index, 'ratePerCubic', e.target.value)}
                                />
                              </td>
                              <td className="py-3 px-4">
                                <input
                                  type="text"
                                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                  value={tariff.description}
                                  onChange={(e) => updateTariff("residential", index, 'description', e.target.value)}
                                  placeholder="Description"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                  value={tariff.isActive.toString()}
                                  onChange={(e) => updateTariff("residential", index, 'isActive', e.target.value)}
                                >
                                  <option value="true">Active</option>
                                  <option value="false">Inactive</option>
                                </select>
                              </td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => removeTariff("residential", index)}
                                  className="text-red-600 hover:text-red-800 text-sm"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Commercial Tariffs */}
                    <div className="mt-8">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-purple-700">Commercial Tariffs</h4>
                        <button
                          onClick={() => addNewTariff("commercial")}
                          className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-bold text-purple-700 hover:bg-purple-100"
                        >
                          + Add Tier
                        </button>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="py-3 px-4 text-left">Tier</th>
                              <th className="py-3 px-4 text-left">Min (m³)</th>
                              <th className="py-3 px-4 text-left">Max (m³)</th>
                              <th className="py-3 px-4 text-left">Rate (₱/m³)</th>
                              <th className="py-3 px-4 text-left">Description</th>
                              <th className="py-3 px-4 text-left">Status</th>
                              <th className="py-3 px-4 text-left"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {tariffs.commercial.map((tariff, index) => (
                              <tr key={`com-${index}`} className="border-t hover:bg-slate-50/60">
                                <td className="py-3 px-4">
                                  <input
                                    type="text"
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                    value={tariff.tier}
                                    onChange={(e) => updateTariff("commercial", index, 'tier', e.target.value)}
                                  />
                                </td>
                                <td className="py-3 px-4">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                    value={tariff.minConsumption}
                                    onChange={(e) => updateTariff("commercial", index, 'minConsumption', e.target.value)}
                                  />
                                </td>
                                <td className="py-3 px-4">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                    value={tariff.maxConsumption}
                                    onChange={(e) => updateTariff("commercial", index, 'maxConsumption', e.target.value)}
                                  />
                                </td>
                                <td className="py-3 px-4">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                    value={tariff.ratePerCubic}
                                    onChange={(e) => updateTariff("commercial", index, 'ratePerCubic', e.target.value)}
                                  />
                                </td>
                                <td className="py-3 px-4">
                                  <input
                                    type="text"
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                    value={tariff.description}
                                    onChange={(e) => updateTariff("commercial", index, 'description', e.target.value)}
                                  />
                                </td>
                                <td className="py-3 px-4">
                                  <select
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                    value={tariff.isActive.toString()}
                                    onChange={(e) => updateTariff("commercial", index, 'isActive', e.target.value)}
                                  >
                                    <option value="true">Active</option>
                                    <option value="false">Inactive</option>
                                  </select>
                                </td>
                                <td className="py-3 px-4">
                                  <button
                                    onClick={() => removeTariff("commercial", index)}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Tariff Calculation Examples */}
                  <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <h4 className="text-sm font-bold text-blue-800 mb-3">Tariff Calculation Examples</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Residential Examples */}
                      <div className="rounded-xl border border-blue-200 bg-white p-3">
                        <h5 className="text-xs font-bold text-blue-700 mb-2">Residential Examples</h5>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {getTariffExamples("residential").map((example, idx) => (
                            <div key={`res-ex-${idx}`} className="text-xs p-2 hover:bg-blue-50 rounded">
                              <div className="font-semibold">{example.consumption} m³ = ₱{example.amount.toFixed(2)}</div>
                              <div className="text-slate-600 text-[10px] truncate" title={example.description}>
                                {example.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Commercial Examples */}
                      <div className="rounded-xl border border-purple-200 bg-white p-3">
                        <h5 className="text-xs font-bold text-purple-700 mb-2">Commercial Examples</h5>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {getTariffExamples("commercial").map((example, idx) => (
                            <div key={`com-ex-${idx}`} className="text-xs p-2 hover:bg-purple-50 rounded">
                              <div className="font-semibold">{example.consumption} m³ = ₱{example.amount.toFixed(2)}</div>
                              <div className="text-slate-600 text-[10px] truncate" title={example.description}>
                                {example.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-3 text-xs text-slate-600">
                      <div className="font-semibold">Notes:</div>
                      <ul className="list-disc pl-4 mt-1 space-y-1">
                        <li>Residential: ₱74.00 minimum charge for 0-5 m³</li>
                        <li>Commercial: ₱442.50 minimum charge for 0-15 m³</li>
                        <li>Rates apply to consumption beyond minimum thresholds</li>
                        <li>Senior discounts apply to eligible tiers only (31-40, 41+)</li>
                        <li>Consumption beyond 500 m³ requires special approval</li>
                      </ul>
                    </div>
                  </div>

                  {/* Tariff Action Buttons */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <div className="text-xs text-slate-600">
                      {isTariffDirty ? (
                        <span>Tariff changes aren't saved yet.</span>
                      ) : (
                        <span>Tariff settings are saved.</span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={resetToDefaults}
                        disabled={tariffSaving}
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Reset All to Defaults
                      </button>
                      <button
                        onClick={() => setTariffConfirmOpen(true)}
                        disabled={!isTariffDirty || tariffSaving}
                        className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-black text-white hover:bg-purple-700"
                      >
                        {tariffSaving ? "Saving..." : "💾 Save Tariff Settings"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Confirmation Modal - BASIC SETTINGS */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setConfirmOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="p-5">
              <div className="text-lg font-black text-slate-900">Confirm Save</div>
              <div className="mt-2 text-sm text-slate-600">
                You're about to update the water billing settings.
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="font-bold text-slate-800 mb-2">Summary</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>Penalty: <b>{payload.penaltyType === "percent" ? `${payload.penaltyValue}%` : `₱${payload.penaltyValue}`}</b></div>
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
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  onClick={async () => {
                    await saveBasicSettings();
                    setConfirmOpen(false);
                  }}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white"
                >
                  {saving ? "Saving..." : "Yes, Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal - TARIFF SETTINGS */}
      {tariffConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !tariffSaving && setTariffConfirmOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="p-5">
              <div className="text-lg font-black text-slate-900">Confirm Tariff Save</div>
              <div className="mt-2 text-sm text-slate-600">
                You're about to update water tariffs and senior citizen discount settings.
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="font-bold text-slate-800 mb-2">Summary</div>
                <div className="space-y-2">
                  <div>Residential Tiers: <b>{tariffs.residential.length}</b></div>
                  <div>Commercial Tiers: <b>{tariffs.commercial.length}</b></div>
                  <div>Senior Discount: <b>{seniorSettings.discountRate}%</b></div>
                  <div>Applicable Tiers: <b>{seniorSettings.applicableTiers.join(", ")}</b></div>
                  
                  {/* Show default tariff examples */}
                  <div className="mt-3 pt-3 border-t">
                    <div className="font-semibold text-slate-700">Default Examples:</div>
                    <div className="text-xs text-slate-600 mt-1">
                      Residential: 10 m³ = ₱155.00 | Commercial: 30 m³ = ₱930.00
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  disabled={tariffSaving}
                  onClick={() => setTariffConfirmOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={tariffSaving}
                  onClick={async () => {
                    await saveTariffSettings();
                    setTariffConfirmOpen(false);
                  }}
                  className="rounded-xl bg-purple-600 px-5 py-2 text-sm font-black text-white"
                >
                  {tariffSaving ? "Saving..." : "Yes, Save Tariffs"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}