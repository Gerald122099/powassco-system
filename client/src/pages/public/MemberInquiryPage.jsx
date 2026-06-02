import logo from "../../assets/logo.png";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import WaterConsumptionChart from "../../components/WaterConsumptionChart";
import PayOnlineModal from "../../components/PayOnlineModal";
import { printWaterReceipt, printLoanReceipt } from "../../lib/paymentReceiptPrint";
import { apiFetch } from "../../lib/api";
import { enablePushForItems, updatePushItems, disablePush, getCurrentSubscription, pushSupported } from "../../lib/pushClient";
import { ChevronUp, ChevronDown, Bell, BellOff } from "lucide-react";

function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Saved items live in localStorage so a returning visitor auto-pulls
// their dues without re-typing. We keep a small list of mixed handles:
//   { kind: "pn" | "meter", value, label?: friendly name on first fetch }
// On mount, the page expands the first item; the rest sit as quick-pick
// chips. Removing an item is one tap.
const SAVED_KEY = "pow_inquiry_saved";
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; }
}
function persistSaved(list) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 12)));
}

export default function MemberInquiryPage() {
  // 'pn' (default) or 'meter' — toggles which input + endpoint we use.
  const [mode, setMode] = useState("pn");
  const [pnNo, setPnNo] = useState("");
  const [meterNo, setMeterNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // Saved-locally list — quick-pick chips so users don't retype.
  const [saved, setSaved] = useState(() => loadSaved());
  // Push notification state — whether THIS device is currently
  // subscribed for any of the saved handles.
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushErr, setPushErr] = useState("");
  useEffect(() => {
    if (!pushSupported()) return;
    getCurrentSubscription().then((sub) => setPushOn(!!sub)).catch(() => {});
  }, []);

  // Whenever the saved list changes AND we already have a subscription
  // active, push the updated items list to the server so newly-saved
  // meters start receiving notifications without re-prompting permission.
  useEffect(() => {
    if (!pushOn) return;
    updatePushItems(saved.map((s) => ({ kind: s.kind, value: s.value }))).catch(() => {});
  }, [saved, pushOn]);

  async function toggleNotifications() {
    setPushErr("");
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        if (saved.length === 0) {
          setPushErr("Save a PN or meter first, then enable notifications.");
          return;
        }
        await enablePushForItems(saved.map((s) => ({ kind: s.kind, value: s.value })));
        setPushOn(true);
      }
    } catch (e) {
      setPushErr(e.message || "Could not change notifications setting.");
    } finally {
      setPushBusy(false);
    }
  }

  // Online payment
  const [payTarget, setPayTarget] = useState(null);

  // UI toggles
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [showMeterDetails, setShowMeterDetails] = useState(false);

  // Shared fetch — `kind` is "pn" or "meter".
  async function runInquiry(kind, value) {
    setErr("");
    setData(null);
    const v = String(value || "").trim().toUpperCase();
    if (!v) {
      setErr(kind === "meter" ? "Please enter the meter number." : "Please enter PN No.");
      return null;
    }
    try {
      setLoading(true);
      const path = kind === "meter" ? "/public/water/inquiry-meter" : "/public/water/inquiry";
      const body = kind === "meter" ? { meterNumber: v, onlyLast12: true } : { pnNo: v, onlyLast12: true };
      const json = await apiFetch(path, { method: "POST", body });
      // Shim: meter-only response uses {account, meter, bills}. Map onto
      // the {member, bills} shape the rest of this page already renders.
      const shaped = kind === "meter"
        ? {
            ...json,
            member: {
              pnNo: json.account?.pnNo,
              accountName: json.account?.accountName,
              billing: { classification: json.account?.classification },
              accountStatus: "active",
              address: {
                barangay: json.account?.barangay,
                municipalityCity: json.account?.municipalityCity,
              },
              meters: json.meter ? [{
                meterNumber: json.meter.meterNumber,
                meterBrand: json.meter.meterBrand,
                meterModel: json.meter.meterModel,
                meterSize: json.meter.meterSize,
                meterStatus: json.meter.meterStatus,
                lastReading: json.meter.lastReading,
                isBillingActive: true,
              }] : [],
            },
          }
        : json;
      setData({ ...shaped, _kind: kind, _value: v });
      setShowAccountDetails(false);
      setShowMeterDetails(false);
      return json;
    } catch (e2) {
      setErr(e2.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const v = mode === "meter" ? meterNo : pnNo;
    await runInquiry(mode, v);
  }

  // Auto-open the most-recently-saved entry on page mount so a returning
  // visitor sees their dues right away. Other saved items stay as chips.
  useEffect(() => {
    if (saved.length === 0) return;
    const first = saved[0];
    setMode(first.kind);
    if (first.kind === "meter") setMeterNo(first.value);
    else setPnNo(first.value);
    runInquiry(first.kind, first.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh when the page becomes visible again (e.g. user
  // backgrounded the PWA and came back to it) and on a slow 5-min
  // interval while open — so a newly-posted reading shows up without
  // a manual refresh.
  useEffect(() => {
    if (!data?._value) return;
    const refetch = () => {
      if (document.visibilityState !== "visible") return;
      runInquiry(data._kind, data._value);
    };
    const interval = setInterval(refetch, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", refetch);
    window.addEventListener("focus", refetch);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refetch);
      window.removeEventListener("focus", refetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?._kind, data?._value]);

  // ----- Save / remove local entries -----
  const isCurrentSaved = data && saved.some((s) => s.kind === data._kind && s.value === data._value);
  function saveCurrent() {
    if (!data?._value) return;
    const label = data._kind === "meter" ? (data.account?.accountName || data._value) : (data.member?.accountName || data._value);
    const next = [
      { kind: data._kind, value: data._value, label, savedAt: Date.now() },
      ...saved.filter((s) => !(s.kind === data._kind && s.value === data._value)),
    ];
    setSaved(next);
    persistSaved(next);
  }
  function unsaveCurrent() {
    if (!data?._value) return;
    const next = saved.filter((s) => !(s.kind === data._kind && s.value === data._value));
    setSaved(next);
    persistSaved(next);
  }
  function openSaved(s) {
    setMode(s.kind);
    if (s.kind === "meter") setMeterNo(s.value);
    else setPnNo(s.value);
    runInquiry(s.kind, s.value);
  }
  function removeSaved(s) {
    const next = saved.filter((x) => !(x.kind === s.kind && x.value === s.value));
    setSaved(next);
    persistSaved(next);
  }

  // ---- Derived Data ----
  const bills = useMemo(() => (data?.bills || []), [data]);
  const activeMeters = useMemo(
    () =>
      data?.member?.meters?.filter((m) => m.meterStatus === "active" && m.isBillingActive) || [],
    [data]
  );

  const totalOutstanding = useMemo(() => {
    return bills
      .filter((b) => b.status !== "paid")
      .reduce((sum, b) => sum + (b.totalDue || 0), 0);
  }, [bills]);

  const billsByYear = useMemo(() => {
    return bills.reduce((acc, bill) => {
      if (!bill.periodCovered) return acc;
      const year = bill.periodCovered.split("-")[0];
      if (!acc[year]) acc[year] = [];
      acc[year].push(bill);
      return acc;
    }, {});
  }, [bills]);

  const years = useMemo(() => Object.keys(billsByYear).sort((a, b) => b - a), [billsByYear]);
  const defaultYear = years[0] || String(new Date().getFullYear());
  const [activeYear, setActiveYear] = useState(defaultYear);

  useEffect(() => {
    if (years.length > 0 && !years.includes(activeYear)) {
      setActiveYear(years[0]);
    }
  }, [years.join("|")]);

  // Calculate average consumption
  const averageConsumption = useMemo(() => {
    if (bills.length === 0) return 0;
    const total = bills.reduce((sum, b) => sum + (b.consumed || 0), 0);
    return Math.round(total / bills.length);
  }, [bills]);

  // Calculate total consumption
  const totalConsumption = useMemo(() => {
    return bills.reduce((sum, b) => sum + (b.consumed || 0), 0);
  }, [bills]);

  return (
    <>
      <Navbar />
      <PayOnlineModal open={!!payTarget} target={payTarget} onClose={() => setPayTarget(null)} />

      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-100 pt-24 pb-8 px-4 md:px-5">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-4 sm:p-6 mb-5">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-green-500 rounded-2xl blur-sm opacity-20"></div>
                <img 
                  src={logo} 
                  alt="POWASSCO Logo" 
                  className="h-16 w-16 rounded-2xl object-contain relative z-10 border-2 border-green-200" 
                />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-green-600">POWASSCO</div>
                <div className="text-2xl font-bold text-gray-900">Member Bill Inquiry</div>
                <div className="mt-1 text-sm text-gray-500">
                  Search by your PN No to see the full account, or by your meter number to see that meter only.
                </div>
              </div>
            </div>

            {/* Mode toggle — PN (whole account) vs single meter (tenant view). */}
            <div className="mb-3 inline-flex rounded-2xl border border-green-200 bg-green-50 p-1 text-sm font-semibold">
              <button type="button" onClick={() => setMode("pn")}
                className={`px-4 py-2 rounded-xl transition ${mode === "pn" ? "bg-green-600 text-white shadow-sm" : "text-green-700 hover:bg-green-100"}`}>
                PN / Account
              </button>
              <button type="button" onClick={() => setMode("meter")}
                className={`px-4 py-2 rounded-xl transition ${mode === "meter" ? "bg-green-600 text-white shadow-sm" : "text-green-700 hover:bg-green-100"}`}>
                Meter Number
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    {mode === "meter" ? "Meter Number" : "PN No (Account Number)"}
                  </label>
                  {mode === "meter" ? (
                    <input
                      key="meter"
                      className="w-full rounded-2xl border border-green-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all"
                      value={meterNo}
                      onChange={(e) => setMeterNo(e.target.value.toUpperCase())}
                      placeholder="e.g. 0009876"
                    />
                  ) : (
                    <input
                      key="pn"
                      className="w-full rounded-2xl border border-green-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all"
                      value={pnNo}
                      onChange={(e) => setPnNo(e.target.value.toUpperCase())}
                      placeholder="e.g. PN-000123"
                    />
                  )}
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-gradient-to-r from-green-600 to-green-700 text-white py-3 font-semibold hover:from-green-700 hover:to-green-800 disabled:opacity-60 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {loading ? "Checking..." : "Check Bills"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-xs text-gray-500">
                {mode === "meter"
                  ? "Tip: tenants can search by their meter number to see only their meter's bills, not the whole account."
                  : "Enter your PN Number exactly as it appears on your bill statement."}
              </div>

              {/* Saved-locally chips — open with one tap, auto-displayed
                  on page mount so a return visit just shows the dues. */}
              {saved.length > 0 && (
                <div className="rounded-2xl border border-green-100 bg-green-50/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-green-700">Saved on this phone</div>
                    {pushSupported() && (
                      <button
                        type="button"
                        onClick={toggleNotifications}
                        disabled={pushBusy}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition ${
                          pushOn
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "border border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                        }`}
                        title={pushOn ? "Turn off notifications on this device" : "Get a push when a new reading or due date is posted"}
                      >
                        {pushOn ? <Bell size={12} /> : <BellOff size={12} />}
                        {pushBusy ? "…" : pushOn ? "Notifications on" : "Enable notifications"}
                      </button>
                    )}
                  </div>
                  {pushErr && (
                    <div className="mt-1.5 text-[11px] text-red-700">{pushErr}</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {saved.map((s) => (
                      <div key={`${s.kind}-${s.value}`} className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-white pl-3 pr-1 py-1 text-xs font-semibold text-green-800">
                        <button type="button" onClick={() => openSaved(s)} className="inline-flex items-center gap-1.5 max-w-[220px]">
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${s.kind === "meter" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{s.kind === "meter" ? "METER" : "PN"}</span>
                          <span className="font-mono truncate">{s.value}</span>
                          {s.label && <span className="text-slate-500 truncate">· {s.label}</span>}
                        </button>
                        <button type="button" onClick={() => removeSaved(s)} aria-label="Remove" className="ml-1 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </form>

            {err && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {err}
              </div>
            )}
          </div>

          {data && (
            <div className="space-y-5">
              {/* Account Summary */}
              <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-4 sm:p-6">
                {/* Save toggle — pin this lookup so the next visit auto-loads. */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Showing {data._kind === "meter" ? "single meter view" : "full account"}
                  </div>
                  {isCurrentSaved ? (
                    <button onClick={unsaveCurrent} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">
                      ★ Saved on this phone — tap to remove
                    </button>
                  ) : (
                    <button onClick={saveCurrent} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700">
                      ☆ Save on this phone (auto-load next time)
                    </button>
                  )}
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="mb-2 text-xl font-bold text-gray-900">{data.member?.accountName || data.account?.accountName}</div>
                    <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
                      {data._kind === "meter" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-xs font-bold">
                          Meter {data.meter?.meterNumber}
                        </span>
                      )}
                      <span>PN No: <span className="font-semibold">{data.member?.pnNo || data.account?.pnNo}</span></span>
                      <span className="text-gray-300">•</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                          data.member?.billing?.classification === "residential"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {data.member?.billing?.classification || "—"}
                      </span>
                      <span className="text-gray-300">•</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${
                          data.member?.accountStatus === "active"
                            ? "bg-green-100 border-green-200 text-green-800"
                            : "bg-red-100 border-red-200 text-red-800"
                        }`}
                      >
                        {data.member?.accountStatus}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-start md:items-end">
                    {totalOutstanding > 0 ? (
                      <div className="text-lg font-bold text-red-600">Outstanding: ₱{money(totalOutstanding)}</div>
                    ) : (
                      <div className="text-sm font-semibold text-green-700">No outstanding balance</div>
                    )}

                    <button
                      className="mt-2 text-xs font-semibold text-green-600 hover:text-green-800 flex items-center gap-1 transition-colors"
                      onClick={() => setShowAccountDetails((v) => !v)}
                      type="button"
                    >
                      {showAccountDetails ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                      {showAccountDetails ? "Hide account details" : "Show account details"}
                    </button>
                  </div>
                </div>

                {/* Account Details */}
                {showAccountDetails && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-green-100 p-4 bg-gradient-to-br from-green-50 to-white">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Address</div>
                      <div className="text-sm font-semibold text-gray-800">
                        {[
                          data.member?.address?.houseLotNo,
                          data.member?.address?.streetSitioPurok,
                          data.member?.address?.barangay,
                          data.member?.address?.municipalityCity,
                          data.member?.address?.province,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-green-100 p-4 bg-gradient-to-br from-green-50 to-white">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Contact</div>
                      <div className="text-sm font-semibold text-gray-800">
                        {data.member?.contact?.mobileNumber || "—"}
                      </div>
                      <div className="text-sm font-semibold text-gray-800">{data.member?.contact?.email || ""}</div>
                    </div>

                    <div className="rounded-2xl border border-green-100 p-4 bg-gradient-to-br from-green-50 to-white">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Discount</div>
                      {data.member?.personal?.isSeniorCitizen ? (
                        <div className="mt-1 text-sm font-bold text-amber-700">
                          Senior • {data.member?.personal?.seniorDiscountRate || 5}%
                        </div>
                      ) : (
                        <div className="mt-1 text-sm font-semibold text-gray-700">None</div>
                      )}
                      <div className="mt-2 text-xs text-gray-400">Some info is masked for privacy.</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Meter Section */}
              {activeMeters.length > 0 && (
                <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-gray-900">Meters</div>
                      <div className="text-sm text-gray-500">{activeMeters.length} active billing meter(s)</div>
                    </div>
                    <button
                      className="text-sm font-semibold text-green-600 transition-colors hover:text-green-800"
                      onClick={() => setShowMeterDetails((v) => !v)}
                      type="button"
                    >
                      {showMeterDetails ? "Hide" : "Show"}
                    </button>
                  </div>

                  {showMeterDetails && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeMeters.map((meter, index) => (
                        <div key={meter._id || index} className="border border-green-100 rounded-2xl p-4 hover:shadow-md transition-shadow bg-gradient-to-br from-white to-green-50">
                          <div className="flex items-start justify-between">
                            <div className="font-mono font-bold text-gray-900">{meter.meterNumber}</div>
                            <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">Active</span>
                          </div>

                          <div className="mt-2 text-sm text-gray-600">
                            {meter.meterBrand || ""} {meter.meterModel || ""}{" "}
                            {meter.meterSize ? `• Size: ${meter.meterSize}` : ""}
                          </div>

                          {meter.location?.description && (
                            <div className="mt-1 truncate text-xs text-gray-500" title={meter.location.description}>
                              {meter.location.description}
                            </div>
                          )}

                          <div className="mt-2 text-xs text-gray-500">
                            Condition:{" "}
                            <span className={`font-bold ${meter.meterCondition === "good" ? "text-green-700" : "text-amber-700"}`}>
                              {meter.meterCondition}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            Last Reading: <span className="font-bold text-gray-800">{meter.lastReading || 0}</span> m³
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Billing History - BELOW METERS */}
              <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-4 sm:p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                  <div>
                    <div className="text-lg font-bold text-gray-900">Billing History</div>
                    <div className="mt-1 text-sm text-gray-500">Last 12 months • {bills.length} record(s)</div>
                  </div>

                  {years.length > 1 && (
                    <div className="mt-2 md:mt-0">
                      <div className="flex space-x-1">
                        {years.map((year) => (
                          <button
                            key={year}
                            onClick={() => setActiveYear(year)}
                            type="button"
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                              activeYear === year
                                ? "bg-green-600 text-white shadow-md"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {bills.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No bills found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gradient-to-r from-green-50 to-green-100 text-left text-gray-600">
                        <tr>
                          <th className="py-3 px-4 rounded-l-xl">Period</th>
                          <th className="py-3 px-4">Meter</th>
                          <th className="py-3 px-4">Consumption</th>
                          <th className="py-3 px-4">Total</th>
                          <th className="py-3 px-4">Due Date</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 rounded-r-xl">Payments</th>
                        </tr>
                      </thead>

                      <tbody>
                        {bills
                          .filter((bill) => bill.periodCovered?.startsWith(activeYear))
                          .map((b) => {
                            const rowTone =
                              b.status === "overdue"
                                ? "bg-red-50/40"
                                : b.status !== "paid"
                                ? "bg-amber-50/30"
                                : "";

                            return (
                              <tr key={b._id} className={`border-t hover:bg-green-50/60 transition-colors ${rowTone}`}>
                                <td className="py-3 px-4">
                                  <div className="font-bold text-gray-800">{b.periodCovered}</div>
                                  {b.readingDate && (
                                    <div className="text-xs text-gray-500">Read: {formatDate(b.readingDate)}</div>
                                  )}
                                </td>

                                <td className="py-3 px-4">{b.meterNumber || "—"}</td>

                                <td className="py-3 px-4">
                                  <div className="font-semibold">{b.consumed} m³</div>
                                  {b.tariffUsed && (
                                    <div className="text-xs text-gray-500">{b.tariffUsed.tier} Tier</div>
                                  )}
                                </td>

                                <td className="py-3 px-4">
                                  <div className="font-bold">₱{money(b.totalDue)}</div>
                                  {b.discount > 0 && (
                                    <div className="text-xs text-green-600">-₱{money(b.discount)} discount</div>
                                  )}
                                </td>

                                <td className="py-3 px-4">{b.dueDate ? formatDate(b.dueDate) : "—"}</td>

                                <td className="py-3 px-4">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                                      b.status === "paid"
                                        ? "bg-green-50 border-green-200 text-green-700"
                                        : b.status === "overdue"
                                        ? "bg-red-50 border-red-200 text-red-700"
                                        : "bg-amber-50 border-amber-200 text-amber-800"
                                    }`}
                                  >
                                    {b.status}
                                  </span>
                                  {b.status !== "paid" &&
                                    (b.onlinePending ? (
                                      <span className="mt-1 block rounded-lg bg-blue-50 px-2.5 py-1 text-center text-xs font-semibold text-blue-700">Pending review</span>
                                    ) : (
                                      <button
                                        onClick={() => setPayTarget({ module: "water", label: `${b.periodCovered} • ${b.meterNumber || ""}`, amountDue: b.totalDue, pnNo: data.member?.pnNo, meterNumber: b.meterNumber, periodKey: b.periodCovered })}
                                        className="mt-1 block rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                      >
                                        Pay Online
                                      </button>
                                    ))}
                                </td>

                                <td className="py-3 px-4">
                                  {!b.payments || b.payments.length === 0 ? (
                                    <span className="text-gray-400 text-sm">No payments</span>
                                  ) : (
                                    <div className="space-y-1">
                                      {b.payments.map((p) => (
                                        <div key={p._id || p.orNo} className="border border-green-100 rounded-lg p-2 bg-green-50/30">
                                          <div className="text-xs text-gray-600">OR: {p.orNo} • {p.method}</div>
                                          <div className="text-xs text-gray-500">{formatDate(p.paidAt)}</div>
                                          <div className="text-sm font-bold text-gray-800">
                                            ₱{money(p.amountPaid)}
                                          </div>
                                          <button
                                            onClick={() => printWaterReceipt({ member: data.member, bill: b, payment: p })}
                                            className="mt-1 rounded-lg border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                          >
                                            Download Receipt
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-gray-500">
                  This public inquiry shows limited information only. Contact the office for detailed bills.
                </div>
              </div>

              {/* Loans */}
              {(data.loans || []).length > 0 && (
                <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-4 sm:p-6">
                  <div className="mb-4">
                    <div className="text-lg font-bold text-gray-900">My Loans</div>
                    <div className="text-sm text-gray-500">{data.loans.length} loan record(s)</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gradient-to-r from-green-50 to-green-100 text-left text-gray-600">
                        <tr>
                          <th className="py-3 px-4 rounded-l-xl">Loan</th>
                          <th className="py-3 px-4">Principal</th>
                          <th className="py-3 px-4">Monthly</th>
                          <th className="py-3 px-4">Balance</th>
                          <th className="py-3 px-4">Due Date</th>
                          <th className="py-3 px-4 rounded-r-xl">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.loans.map((ln) => {
                          const overdue =
                            ln.maturityDate &&
                            new Date(ln.maturityDate) < new Date() &&
                            (ln.balance || 0) > 0 &&
                            ln.status === "released";
                          return (
                            <tr key={ln.loanId} className={`border-t ${overdue ? "bg-red-50/40" : ""}`}>
                              <td className="py-3 px-4">
                                <div className="font-bold text-gray-800 font-mono">{ln.loanId}</div>
                                <div className="text-xs text-gray-500">{formatDate(ln.createdAt)}</div>
                              </td>
                              <td className="py-3 px-4">₱{money(ln.principal)}</td>
                              <td className="py-3 px-4">₱{money(ln.monthlyPayment)}</td>
                              <td className="py-3 px-4 font-bold">₱{money(ln.balance)}</td>
                              <td className="py-3 px-4">
                                {ln.maturityDate ? formatDate(ln.maturityDate) : "—"}
                                {overdue && <span className="ml-1 text-xs font-bold text-red-600">OVERDUE</span>}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                                    ln.status === "closed"
                                      ? "bg-green-50 border-green-200 text-green-700"
                                      : ln.status === "released"
                                      ? "bg-blue-50 border-blue-200 text-blue-700"
                                      : ln.status === "rejected"
                                      ? "bg-red-50 border-red-200 text-red-700"
                                      : "bg-amber-50 border-amber-200 text-amber-800"
                                  }`}
                                >
                                  {ln.status}
                                </span>
                                {(ln.balance || 0) > 0 && ln.status === "released" &&
                                  (ln.onlinePending ? (
                                    <span className="mt-1 block rounded-lg bg-blue-50 px-2.5 py-1 text-center text-xs font-semibold text-blue-700">Pending review</span>
                                  ) : (
                                    <button
                                      onClick={() => setPayTarget({ module: "loan", label: ln.loanId, amountDue: ln.balance, loanId: ln.loanId })}
                                      className="mt-1 block rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                    >
                                      Pay Online
                                    </button>
                                  ))}
                                {ln.payments?.length > 0 && (
                                  <button
                                    onClick={() => printLoanReceipt({ loan: ln, payment: ln.payments[0] })}
                                    className="mt-1 block rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                  >
                                    Download Receipt
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                    Please settle on or before the due date to avoid penalties and water disconnection.
                  </div>
                </div>
              )}

              {/* Water Consumption History - BELOW BILLING HISTORY */}
              {bills.length > 0 && (
                <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-lg font-bold text-gray-900">Water Consumption History</div>
                      <div className="text-sm text-gray-500">Last 6 months consumption trend</div>
                    </div>
                    
                    {/* Summary Stats */}
                    <div className="flex gap-4">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Average</div>
                        <div className="font-bold text-green-700">
                          {averageConsumption} m³
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Total</div>
                        <div className="font-bold text-blue-700">
                          {totalConsumption} m³
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Chart Component */}
                  <WaterConsumptionChart bills={bills} />

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-xs text-gray-600">Normal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="text-xs text-gray-600">Overdue</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-700 rounded-full"></div>
                      <span className="text-xs text-gray-600">Paid</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!data && (
            <div className="text-center py-8 text-gray-500 text-sm">
              <div className="mb-4 font-semibold">How to use this inquiry system</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                <div className="p-4 bg-white rounded-xl shadow-sm border border-green-100">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="font-bold text-green-700">1</span>
                  </div>
                  <div className="font-semibold text-gray-700">Enter PN No</div>
                  <div className="text-xs mt-1 text-gray-500">Find your PN Number on your bill statement</div>
                </div>
                <div className="p-4 bg-white rounded-xl shadow-sm border border-green-100">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="font-bold text-green-700">2</span>
                  </div>
                  <div className="font-semibold text-gray-700">View Bills</div>
                  <div className="text-xs mt-1 text-gray-500">See your last 12 months of bills and payments</div>
                </div>
                <div className="p-4 bg-white rounded-xl shadow-sm border border-green-100">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="font-bold text-green-700">3</span>
                  </div>
                  <div className="font-semibold text-gray-700">Check Chart</div>
                  <div className="text-xs mt-1 text-gray-500">View your water consumption trends</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}