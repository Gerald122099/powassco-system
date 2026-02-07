import logo from "../../assets/logo.png";
import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE; // http://localhost:5000/api

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

export default function MemberInquiryPage() {
  const [pnNo, setPnNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // UI toggles (clean/minimal)
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [showMeterDetails, setShowMeterDetails] = useState(false);
  const [showHistoryInCalculator, setShowHistoryInCalculator] = useState(false);

  // Tariff examples + calculator
  const [tariffExamples, setTariffExamples] = useState(null);
  const [calculatorForm, setCalculatorForm] = useState({
    classification: "residential",
    consumption: 0,
    isSenior: false,
  });
  const [calculatorResult, setCalculatorResult] = useState(null);

  // debounce
  const calcTimerRef = useRef(null);

  // Fetch tariff examples on mount
  useEffect(() => {
    fetchTariffExamples("residential");
  }, []);

  async function fetchTariffExamples(classification) {
    try {
      // ✅ FIX: use public route you provided
      const res = await fetch(`${API_BASE}/public/water/tariff-examples/${classification}`);
      const json = await res.json();
      if (res.ok) setTariffExamples(json);
    } catch (error) {
      console.error("Failed to fetch tariff examples:", error);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setData(null);

    const pn = pnNo.trim();
    if (!pn) {
      setErr("Please enter PN No.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/public/water/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pnNo: pn, onlyLast12: true }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Inquiry failed.");

      setData(json);

      // set calculator defaults from member
      const cls = json.member?.billing?.classification || "residential";
      const isSenior = !!json.member?.personal?.isSeniorCitizen;

      setCalculatorForm((prev) => ({
        ...prev,
        classification: cls,
        isSenior,
        consumption: 0,
      }));

      setCalculatorResult(null);
      fetchTariffExamples(cls);

      // collapse details by default (minimal)
      setShowAccountDetails(false);
      setShowMeterDetails(false);
      setShowHistoryInCalculator(false);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  // ✅ FIXED: Calculate using your PUBLIC endpoint /calculate-estimate
  async function calculateTariffNow(nextForm = calculatorForm) {
    const c = Number(nextForm.consumption || 0);
    if (!c || c <= 0) {
      setCalculatorResult(null);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/public/water/calculate-estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classification: nextForm.classification,
          consumption: c,
          isSenior: !!nextForm.isSenior,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Failed to calculate estimate");

      setCalculatorResult(json);
    } catch (error) {
      console.error("Calculation error:", error);
      setCalculatorResult({
        error: true,
        message: error.message || "Calculation failed",
      });
    }
  }

  // ✅ Debounced auto-calc whenever inputs change
  useEffect(() => {
    if (calcTimerRef.current) clearTimeout(calcTimerRef.current);

    // only debounce if consumption > 0
    if (Number(calculatorForm.consumption || 0) > 0) {
      calcTimerRef.current = setTimeout(() => {
        calculateTariffNow(calculatorForm);
      }, 350);
    } else {
      setCalculatorResult(null);
    }

    return () => {
      if (calcTimerRef.current) clearTimeout(calcTimerRef.current);
    };
    // eslint-disable-next-line
  }, [calculatorForm.classification, calculatorForm.consumption, calculatorForm.isSenior]);

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
    // when new data loads, ensure active tab is valid
    if (years.length > 0 && !years.includes(activeYear)) {
      setActiveYear(years[0]);
    }
    // eslint-disable-next-line
  }, [years.join("|")]);

  // Mini list for calculator (last 5 bills)
  const recentBills = useMemo(() => {
    return [...bills]
      .sort((a, b) => String(b.periodCovered || "").localeCompare(String(a.periodCovered || "")))
      .slice(0, 5);
  }, [bills]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-4 md:p-5">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6 mb-5">
          <div className="flex items-center gap-3 mb-6">
            <img src={logo} alt="POWASSCO Logo" className="h-12 w-12 rounded-xl object-contain" />
            <div>
              <div className="text-sm font-semibold text-emerald-700">POWASSCO</div>
              <div className="text-xl font-bold text-slate-900">Member Bill Inquiry</div>
              <div className="text-xs text-slate-600 mt-1">
                Enter your PN No to view bills, payment history, and meter information.
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-700 block mb-2">
                  PN No (Account Number)
                </label>
                <input
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  value={pnNo}
                  onChange={(e) => setPnNo(e.target.value.toUpperCase())}
                  placeholder="e.g. PN-000123"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-emerald-600 text-white py-3 font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? "Checking..." : "Check Bills"}
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              💡 Note: Enter your PN Number exactly as it appears on your bill statement.
            </div>
          </form>

          {err && (
            <div className="mt-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm font-semibold">
              ⚠️ {err}
            </div>
          )}
        </div>

        {data && (
          <div className="space-y-5">
            {/* ✅ Minimal Account Summary */}
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-900">{data.member?.accountName}</div>
                  <div className="text-sm text-slate-600">
                    PN No: <span className="font-semibold">{data.member?.pnNo}</span> •{" "}
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
                        data.member?.billing?.classification === "residential"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {data.member?.billing?.classification || "—"}
                    </span>{" "}
                    •{" "}
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
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
                    <div className="text-lg font-bold text-red-600">
                      Outstanding: ₱{money(totalOutstanding)}
                    </div>
                  ) : (
                    <div className="text-sm font-semibold text-emerald-700">No outstanding balance</div>
                  )}

                  <button
                    className="mt-1 text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
                    onClick={() => setShowAccountDetails((v) => !v)}
                    type="button"
                  >
                    {showAccountDetails ? "Hide account details" : "Show account details"}
                  </button>
                </div>
              </div>

              {/* Details (hidden by default) */}
              {showAccountDetails && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs text-slate-500">Address</div>
                    <div className="text-sm font-semibold text-slate-900 mt-1">
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

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs text-slate-500">Contact (masked)</div>
                    <div className="text-sm font-semibold text-slate-900 mt-1">
                      {data.member?.contact?.mobileNumber || "—"}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{data.member?.contact?.email || ""}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs text-slate-500">Discount</div>
                    {data.member?.personal?.isSeniorCitizen ? (
                      <div className="mt-1 text-sm font-bold text-amber-700">
                        Senior • {data.member?.personal?.seniorDiscountRate || 5}%
                      </div>
                    ) : (
                      <div className="mt-1 text-sm font-semibold text-slate-700">None</div>
                    )}
                    <div className="text-xs text-slate-500 mt-2">
                      (Some info is masked for privacy.)
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ✅ Minimal Meter Section */}
            {activeMeters.length > 0 && (
              <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-black text-slate-900">Meters</div>
                    <div className="text-sm text-slate-600">{activeMeters.length} active billing meter(s)</div>
                  </div>

                  <button
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
                    onClick={() => setShowMeterDetails((v) => !v)}
                    type="button"
                  >
                    {showMeterDetails ? "Hide meters" : "Show meters"}
                  </button>
                </div>

                {showMeterDetails && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeMeters.map((meter, index) => (
                      <div key={meter._id || index} className="border border-slate-200 rounded-2xl p-4">
                        <div className="flex justify-between items-start">
                          <div className="font-black text-slate-900">{meter.meterNumber}</div>
                          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-1 text-xs font-bold">
                            Active
                          </span>
                        </div>

                        <div className="mt-2 text-sm text-slate-600">
                          {meter.meterBrand || ""} {meter.meterModel || ""}{" "}
                          {meter.meterSize ? `• Size: ${meter.meterSize}` : ""}
                        </div>

                        {meter.location?.description && (
                          <div className="mt-1 text-xs text-slate-500 truncate" title={meter.location.description}>
                            📍 {meter.location.description}
                          </div>
                        )}

                        <div className="mt-2 text-xs text-slate-500">
                          Condition:{" "}
                          <span className={`font-bold ${meter.meterCondition === "good" ? "text-emerald-700" : "text-amber-700"}`}>
                            {meter.meterCondition}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          Last Reading: <span className="font-bold text-slate-800">{meter.lastReading || 0}</span> m³
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Billing History */}
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                <div>
                  <div className="text-lg font-black text-slate-900">Billing History</div>
                  <div className="text-sm text-slate-600 mt-1">
                    Last 12 months • {bills.length} record(s)
                  </div>
                </div>

                {years.length > 1 && (
                  <div className="mt-2 md:mt-0">
                    <div className="flex space-x-1">
                      {years.map((year) => (
                        <button
                          key={year}
                          onClick={() => setActiveYear(year)}
                          type="button"
                          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                            activeYear === year
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
                <div className="text-center py-8 text-slate-500">No bills found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
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
                            <tr key={b._id} className={`border-t hover:bg-slate-50/60 ${rowTone}`}>
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900">{b.periodCovered}</div>
                                {b.readingDate && (
                                  <div className="text-xs text-slate-500">
                                    Read: {formatDate(b.readingDate)}
                                  </div>
                                )}
                              </td>

                              <td className="py-3 px-4">{b.meterNumber || "—"}</td>

                              <td className="py-3 px-4">
                                <div className="font-semibold">{b.consumed} m³</div>
                                {b.tariffUsed && (
                                  <div className="text-xs text-slate-500">{b.tariffUsed.tier} Tier</div>
                                )}
                              </td>

                              <td className="py-3 px-4">
                                <div className="font-bold">₱{money(b.totalDue)}</div>
                                {b.discount > 0 && (
                                  <div className="text-xs text-emerald-600">-₱{money(b.discount)} discount</div>
                                )}
                              </td>

                              <td className="py-3 px-4">{b.dueDate ? formatDate(b.dueDate) : "—"}</td>

                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                                    b.status === "paid"
                                      ? "bg-green-50 border-green-200 text-green-700"
                                      : b.status === "overdue"
                                      ? "bg-red-50 border-red-200 text-red-700"
                                      : "bg-amber-50 border-amber-200 text-amber-800"
                                  }`}
                                >
                                  {b.status}
                                </span>
                              </td>

                              <td className="py-3 px-4">
                                {!b.payments || b.payments.length === 0 ? (
                                  <span className="text-slate-400 text-sm">No payments</span>
                                ) : (
                                  <div className="space-y-1">
                                    {b.payments.map((p) => (
                                      <div key={p._id || p.orNo} className="border border-slate-200 rounded-lg p-2">
                                        <div className="text-xs text-slate-600">
                                          OR: {p.orNo} • {p.method} • {formatDate(p.paidAt)}
                                        </div>
                                        <div className="text-sm font-bold text-slate-900">
                                          ₱{money(p.amountPaid)}
                                        </div>
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

              <div className="mt-4 text-xs text-slate-500">
                💡 Note: This public inquiry shows limited information only. Contact the office for detailed bills.
              </div>
            </div>

            {/* ✅ Clean Tariff Calculator */}
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-black text-slate-900">Tariff Calculator</div>

                {bills.length > 0 && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
                    onClick={() => setShowHistoryInCalculator((v) => !v)}
                  >
                    {showHistoryInCalculator ? "Hide billing history" : "Show billing history"}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Calculator */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">
                        Classification
                      </label>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={calculatorForm.classification}
                        onChange={(e) => {
                          const cls = e.target.value;
                          setCalculatorForm((prev) => ({ ...prev, classification: cls }));
                          fetchTariffExamples(cls);
                          setCalculatorResult(null);
                        }}
                      >
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">
                        Monthly Consumption (m³)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={calculatorForm.consumption}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setCalculatorForm((prev) => ({ ...prev, consumption: value }));
                        }}
                        placeholder="Enter consumption in cubic meters"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isSenior"
                        checked={calculatorForm.isSenior}
                        onChange={(e) =>
                          setCalculatorForm((prev) => ({ ...prev, isSenior: e.target.checked }))
                        }
                        className="rounded border-slate-300"
                      />
                      <label htmlFor="isSenior" className="text-sm text-slate-700">
                        Apply Senior Citizen Discount (5%)
                      </label>
                    </div>

                    <button
                      onClick={() => calculateTariffNow(calculatorForm)}
                      disabled={Number(calculatorForm.consumption || 0) <= 0}
                      className="w-full rounded-xl bg-slate-900 text-white py-2.5 font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      type="button"
                    >
                      Calculate Bill
                    </button>
                  </div>

                  {/* Result */}
                  {calculatorResult && (
                    <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                      {calculatorResult.error ? (
                        <div className="text-sm font-semibold text-red-700">
                          ⚠️ {calculatorResult.message || "Calculation failed"}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-700">Estimated Total</div>
                            <div className="text-lg font-black text-slate-900">
                              ₱{money(calculatorResult.totalAmount)}
                            </div>
                          </div>

                          <div className="mt-3 space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-600">Tier</span>
                              <span className="font-semibold">{calculatorResult.tier}</span>
                            </div>

                            <div className="flex justify-between">
                              <span className="text-slate-600">Base Amount</span>
                              <span className="font-bold">₱{money(calculatorResult.breakdown?.baseAmount)}</span>
                            </div>

                            {calculatorResult.seniorDiscount?.applied && (
                              <div className="flex justify-between">
                                <span className="text-slate-600">
                                  Senior Discount ({calculatorResult.seniorDiscount.rate}%)
                                </span>
                                <span className="font-bold text-emerald-700">
                                  -₱{money(calculatorResult.seniorDiscount.amount)}
                                </span>
                              </div>
                            )}

                            <div className="pt-2 mt-2 border-t flex justify-between font-black text-slate-900">
                              <span>Total</span>
                              <span>₱{money(calculatorResult.totalAmount)}</span>
                            </div>

                            <div className="text-xs text-slate-500 mt-2">
                              {calculatorResult.message}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Billing History inside calculator (toggle) */}
                  {showHistoryInCalculator && recentBills.length > 0 && (
                    <div className="border border-slate-200 rounded-2xl p-4">
                      <div className="text-sm font-black text-slate-900 mb-2">Recent Bills (Last 5)</div>
                      <div className="space-y-2">
                        {recentBills.map((b) => (
                          <div
                            key={b._id}
                            className={`rounded-xl border p-3 ${
                              b.status === "overdue"
                                ? "border-red-200 bg-red-50/40"
                                : b.status !== "paid"
                                ? "border-amber-200 bg-amber-50/30"
                                : "border-slate-200"
                            }`}
                          >
                            <div className="flex justify-between text-xs text-slate-600">
                              <span>{b.periodCovered} • {b.meterNumber || "—"}</span>
                              <span className="font-bold">{b.status}</span>
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-sm font-semibold text-slate-900">{b.consumed} m³</span>
                              <span className="text-sm font-black text-slate-900">₱{money(b.totalDue)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tariff Guide */}
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-700">
                    {tariffExamples?.description || "Tariff Structure"}
                  </div>

                  {tariffExamples?.examples?.length > 0 && (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                        Example Calculations
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white">
                            <tr className="text-slate-500">
                              <th className="py-2 px-4 text-left">Consumption</th>
                              <th className="py-2 px-4 text-left">Amount</th>
                              <th className="py-2 px-4 text-left">Formula</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tariffExamples.examples.slice(0, 9).map((ex, idx) => (
                              <tr key={idx} className="border-t border-slate-100">
                                <td className="py-2 px-4 font-semibold">{ex.consumption} m³</td>
                                <td className="py-2 px-4 font-black">₱{money(ex.amount)}</td>
                                <td className="py-2 px-4 text-slate-600">{ex.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-slate-500">
                    Note: Calculator is an estimate. Final billing may include penalties, adjustments, or verified discounts.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!data && (
          <div className="text-center py-8 text-slate-500 text-sm">
            <div className="mb-2">💡 How to use this inquiry system:</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="font-semibold text-slate-700">1. Enter PN No</div>
                <div className="text-xs mt-1">Find your PN Number on your bill statement</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="font-semibold text-slate-700">2. View Bills</div>
                <div className="text-xs mt-1">See your last 12 months of bills and payments</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="font-semibold text-slate-700">3. Use Calculator</div>
                <div className="text-xs mt-1">Understand how your bill is calculated</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
