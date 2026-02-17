import logo from "../../assets/logo.png";
import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "../../components/Navbar";
import WaterConsumptionChart from "../../components/WaterConsumptionChart";

const API_BASE = import.meta.env.VITE_API_BASE;

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

  // UI toggles
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [showMeterDetails, setShowMeterDetails] = useState(false);

  // debounce
  const calcTimerRef = useRef(null);

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

      // collapse details by default
      setShowAccountDetails(false);
      setShowMeterDetails(false);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
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
      
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-100 pt-24 pb-8 px-4 md:px-5">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6 mb-5">
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
                <div className="text-sm font-semibold text-green-600 flex items-center gap-2">
                  <i className="fas fa-droplet text-green-500"></i>
                  POWASSCO
                </div>
                <div className="text-2xl font-bold text-gray-800">Member Bill Inquiry</div>
                <div className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                  <i className="fas fa-info-circle text-green-500"></i>
                  Enter your PN No to view bills, payment history, and meter information.
                </div>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-gray-700 block mb-2 flex items-center gap-2">
                    <i className="fas fa-id-card text-green-600"></i>
                    PN No (Account Number)
                  </label>
                  <input
                    className="w-full rounded-2xl border border-green-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all"
                    value={pnNo}
                    onChange={(e) => setPnNo(e.target.value.toUpperCase())}
                    placeholder="e.g. PN-000123"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-gradient-to-r from-green-600 to-green-700 text-white py-3 font-semibold hover:from-green-700 hover:to-green-800 disabled:opacity-60 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i>
                        Checking...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-search"></i>
                        Check Bills
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-xl flex items-center gap-2">
                <i className="fas fa-lightbulb text-yellow-500"></i>
                Note: Enter your PN Number exactly as it appears on your bill statement.
              </div>
            </form>

            {err && (
              <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-semibold flex items-center gap-2">
                <i className="fas fa-exclamation-circle"></i>
                {err}
              </div>
            )}
          </div>

          {data && (
            <div className="space-y-5">
              {/* Account Summary */}
              <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <i className="fas fa-user-circle text-2xl text-green-600"></i>
                      <div className="text-xl font-black text-gray-800">{data.member?.accountName}</div>
                    </div>
                    <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1">
                        <i className="fas fa-hashtag text-green-500"></i>
                        PN No: <span className="font-semibold">{data.member?.pnNo}</span>
                      </span>
                      <span className="text-gray-300">•</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                          data.member?.billing?.classification === "residential"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        <i className={`fas fa-${data.member?.billing?.classification === "residential" ? "home" : "building"}`}></i>
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
                        <i className={`fas fa-${data.member?.accountStatus === "active" ? "check-circle" : "exclamation-circle"}`}></i>
                        {data.member?.accountStatus}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-start md:items-end">
                    {totalOutstanding > 0 ? (
                      <div className="text-lg font-bold text-red-600 flex items-center gap-2">
                        <i className="fas fa-exclamation-triangle"></i>
                        Outstanding: ₱{money(totalOutstanding)}
                      </div>
                    ) : (
                      <div className="text-sm font-semibold text-green-700 flex items-center gap-2">
                        <i className="fas fa-check-circle"></i>
                        No outstanding balance
                      </div>
                    )}

                    <button
                      className="mt-2 text-xs font-semibold text-green-600 hover:text-green-800 flex items-center gap-1 transition-colors"
                      onClick={() => setShowAccountDetails((v) => !v)}
                      type="button"
                    >
                      <i className={`fas fa-chevron-${showAccountDetails ? 'up' : 'down'}`}></i>
                      {showAccountDetails ? "Hide account details" : "Show account details"}
                    </button>
                  </div>
                </div>

                {/* Account Details */}
                {showAccountDetails && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-green-100 p-4 bg-gradient-to-br from-green-50 to-white">
                      <div className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                        <i className="fas fa-map-marker-alt text-green-600"></i>
                        Address
                      </div>
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
                      <div className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                        <i className="fas fa-phone-alt text-green-600"></i>
                        Contact
                      </div>
                      <div className="text-sm font-semibold text-gray-800">
                        {data.member?.contact?.mobileNumber || "—"}
                      </div>
                      <div className="text-sm font-semibold text-gray-800">{data.member?.contact?.email || ""}</div>
                    </div>

                    <div className="rounded-2xl border border-green-100 p-4 bg-gradient-to-br from-green-50 to-white">
                      <div className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                        <i className="fas fa-tag text-green-600"></i>
                        Discount
                      </div>
                      {data.member?.personal?.isSeniorCitizen ? (
                        <div className="mt-1 text-sm font-bold text-amber-700 flex items-center gap-1">
                          <i className="fas fa-user-shield"></i>
                          Senior • {data.member?.personal?.seniorDiscountRate || 5}%
                        </div>
                      ) : (
                        <div className="mt-1 text-sm font-semibold text-gray-700">None</div>
                      )}
                      <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                        <i className="fas fa-lock"></i>
                        Some info is masked for privacy.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Meter Section */}
              {activeMeters.length > 0 && (
                <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-tachometer-alt text-2xl text-green-600"></i>
                      <div>
                        <div className="text-lg font-black text-gray-800">Meters</div>
                        <div className="text-sm text-gray-600">{activeMeters.length} active billing meter(s)</div>
                      </div>
                    </div>

                    <button
                      className="text-xs font-semibold text-green-600 hover:text-green-800 flex items-center gap-1 transition-colors"
                      onClick={() => setShowMeterDetails((v) => !v)}
                      type="button"
                    >
                      <i className={`fas fa-chevron-${showMeterDetails ? 'up' : 'down'}`}></i>
                      {showMeterDetails ? "Hide meters" : "Show meters"}
                    </button>
                  </div>

                  {showMeterDetails && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeMeters.map((meter, index) => (
                        <div key={meter._id || index} className="border border-green-100 rounded-2xl p-4 hover:shadow-md transition-shadow bg-gradient-to-br from-white to-green-50">
                          <div className="flex justify-between items-start">
                            <div className="font-black text-gray-800 flex items-center gap-2">
                              <i className="fas fa-qrcode text-green-600"></i>
                              {meter.meterNumber}
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-1 text-xs font-bold">
                              <i className="fas fa-circle text-xs"></i>
                              Active
                            </span>
                          </div>

                          <div className="mt-2 text-sm text-gray-600">
                            {meter.meterBrand || ""} {meter.meterModel || ""}{" "}
                            {meter.meterSize ? `• Size: ${meter.meterSize}` : ""}
                          </div>

                          {meter.location?.description && (
                            <div className="mt-1 text-xs text-gray-500 truncate flex items-center gap-1" title={meter.location.description}>
                              <i className="fas fa-map-pin text-green-500"></i>
                              {meter.location.description}
                            </div>
                          )}

                          <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                            <i className="fas fa-wrench"></i>
                            Condition:{" "}
                            <span className={`font-bold ${meter.meterCondition === "good" ? "text-green-700" : "text-amber-700"}`}>
                              {meter.meterCondition}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                            <i className="fas fa-chart-line"></i>
                            Last Reading: <span className="font-bold text-gray-800">{meter.lastReading || 0}</span> m³
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Water Consumption Chart - New Section */}
              {bills.length > 0 && (
                <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-chart-line text-2xl text-green-600"></i>
                      <div>
                        <div className="text-lg font-black text-gray-800">Water Consumption History</div>
                        <div className="text-sm text-gray-600">Last 6 months consumption trend</div>
                      </div>
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

              {/* Billing History */}
              <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-history text-2xl text-green-600"></i>
                    <div>
                      <div className="text-lg font-black text-gray-800">Billing History</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Last 12 months • {bills.length} record(s)
                      </div>
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
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1 ${
                              activeYear === year
                                ? "bg-green-600 text-white shadow-md"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            <i className="fas fa-calendar-alt"></i>
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
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                      <i className="fas fa-calendar-check"></i>
                                      Read: {formatDate(b.readingDate)}
                                    </div>
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
                                    <div className="text-xs text-green-600 flex items-center gap-1">
                                      <i className="fas fa-tag"></i>
                                      -₱{money(b.discount)} discount
                                    </div>
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
                                    <i className={`fas fa-${b.status === "paid" ? "check-circle" : b.status === "overdue" ? "exclamation-circle" : "clock"}`}></i>
                                    {b.status}
                                  </span>
                                </td>

                                <td className="py-3 px-4">
                                  {!b.payments || b.payments.length === 0 ? (
                                    <span className="text-gray-400 text-sm">No payments</span>
                                  ) : (
                                    <div className="space-y-1">
                                      {b.payments.map((p) => (
                                        <div key={p._id || p.orNo} className="border border-green-100 rounded-lg p-2 bg-green-50/30">
                                          <div className="text-xs text-gray-600 flex items-center gap-1">
                                            <i className="fas fa-receipt"></i>
                                            OR: {p.orNo} • {p.method}
                                          </div>
                                          <div className="text-xs text-gray-500">{formatDate(p.paidAt)}</div>
                                          <div className="text-sm font-bold text-gray-800">
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

                <div className="mt-4 text-xs text-gray-500 bg-blue-50 p-3 rounded-xl flex items-center gap-2">
                  <i className="fas fa-info-circle text-blue-500"></i>
                  Note: This public inquiry shows limited information only. Contact the office for detailed bills.
                </div>
              </div>
            </div>
          )}

          {!data && (
            <div className="text-center py-8 text-gray-500 text-sm">
              <div className="mb-4 flex items-center justify-center gap-2">
                <i className="fas fa-lightbulb text-yellow-500 text-xl"></i>
                <span className="font-semibold">How to use this inquiry system:</span>
              </div>
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