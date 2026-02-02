import logo from "../../assets/logo.png";
import { useState, useEffect } from "react";
const API_BASE = import.meta.env.VITE_API_BASE; // http://localhost:5000/api

function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getMonthName(month) {
  const date = new Date(2000, month - 1, 1);
  return date.toLocaleDateString('en-PH', { month: 'long' });
}

export default function MemberInquiryPage() {
  const [pnNo, setPnNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [tariffExamples, setTariffExamples] = useState(null);
  const [calculatorForm, setCalculatorForm] = useState({
    classification: "residential",
    consumption: 0,
    isSenior: false
  });
  const [calculatorResult, setCalculatorResult] = useState(null);

  // Fetch tariff examples on component mount
  useEffect(() => {
    fetchTariffExamples("residential");
  }, []);

  async function fetchTariffExamples(classification) {
    try {
      const res = await fetch(`${API_BASE}/water/settings/tariff-examples/${classification}`);
      const json = await res.json();
      if (res.ok) {
        setTariffExamples(json);
      }
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
        body: JSON.stringify({
          pnNo: pn,
          onlyLast12: true
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Inquiry failed.");

      setData(json);
      
      // Set calculator classification based on member data
      if (json.member?.billing?.classification) {
        setCalculatorForm(prev => ({
          ...prev,
          classification: json.member.billing.classification,
          isSenior: json.member.personal?.isSeniorCitizen || false
        }));
        fetchTariffExamples(json.member.billing.classification);
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  async function calculateTariff() {
    if (calculatorForm.consumption <= 0) {
      setCalculatorResult(null);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/water/settings/calculate-example`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          classification: calculatorForm.classification,
          consumption: calculatorForm.consumption
        }
      });

      const json = await res.json();
      if (res.ok) {
        // Apply senior discount if applicable
        let finalAmount = parseFloat(json.calculatedAmount);
        let discountAmount = 0;
        let discountRate = 0;

        if (calculatorForm.isSenior) {
          // Check if consumption qualifies for senior discount
          const minDiscountTier = calculatorForm.classification === "residential" ? 31 : 31;
          if (calculatorForm.consumption >= minDiscountTier) {
            discountRate = 5; // Default 5% senior discount
            discountAmount = finalAmount * (discountRate / 100);
            finalAmount -= discountAmount;
          }
        }

        setCalculatorResult({
          ...json,
          finalAmount: finalAmount.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          discountRate,
          seniorDiscountApplied: calculatorForm.isSenior && calculatorForm.consumption >= minDiscountTier
        });
      }
    } catch (error) {
      console.error("Calculation error:", error);
    }
  }

  // Get bills for last 12 months
  const bills = (data?.bills || []).filter((b) => {
    if (!b.periodCovered) return true;
    const billDate = new Date(b.periodCovered + "-01");
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    return billDate >= twelveMonthsAgo;
  });

  // Group bills by year
  const billsByYear = bills.reduce((acc, bill) => {
    if (!bill.periodCovered) return acc;
    const year = bill.periodCovered.split('-')[0];
    if (!acc[year]) acc[year] = [];
    acc[year].push(bill);
    return acc;
  }, {});

  // Get current year and last 2 years for tabs
  const currentYear = new Date().getFullYear();
  const years = Object.keys(billsByYear).sort((a, b) => b - a);
  const [activeYear, setActiveYear] = useState(currentYear.toString());

  // Calculate total outstanding balance
  const totalOutstanding = bills
    .filter(b => b.status !== "paid")
    .reduce((sum, b) => sum + (b.totalDue || 0), 0);

  // Get active meters
  const activeMeters = data?.member?.meters?.filter(m => 
    m.meterStatus === "active" && m.isBillingActive
  ) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-4 md:p-5">
      <div className="max-w-6xl mx-auto">
        {/* Header Card */}
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6 mb-5">
          <div className="flex items-center gap-3 mb-6">
            <img
              src={logo}
              alt="POWASSCO Logo"
              className="h-12 w-12 rounded-xl object-contain"
            />
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
            {/* Account Summary Card */}
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                <div>
                  <div className="text-lg font-black text-slate-900">Account Information</div>
                  <div className="text-sm text-slate-600 mt-1">
                    PN No: {data.member?.pnNo}
                  </div>
                </div>
                
                {totalOutstanding > 0 && (
                  <div className="mt-2 md:mt-0">
                    <div className="text-lg font-bold text-red-600">
                      Total Outstanding: ₱{money(totalOutstanding)}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="text-sm text-slate-500">Account Name</div>
                  <div className="font-semibold text-slate-900">{data.member?.accountName}</div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm text-slate-500">Classification</div>
                  <div className="font-semibold text-slate-900">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
                      data.member?.billing?.classification === "residential" 
                        ? "bg-blue-100 text-blue-800" 
                        : "bg-purple-100 text-purple-800"
                    }`}>
                      {data.member?.billing?.classification || "—"}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm text-slate-500">Account Status</div>
                  <div className="font-semibold text-slate-900">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                      data.member?.accountStatus === "active" 
                        ? "bg-green-100 border-green-200 text-green-800" 
                        : "bg-red-100 border-red-200 text-red-800"
                    }`}>
                      {data.member?.accountStatus}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Senior Citizen Info */}
              {data.member?.personal?.isSeniorCitizen && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <div className="flex items-center gap-2 text-yellow-800">
                    <span className="text-lg">👴</span>
                    <div>
                      <div className="font-bold text-sm">Senior Citizen Account</div>
                      <div className="text-xs">
                        ID: {data.member.personal.seniorId || "Not provided"} • 
                        Discount Rate: {data.member.personal.seniorDiscountRate || 5}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Meters Information Card */}
            {activeMeters.length > 0 && (
              <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
                <div className="text-lg font-black text-slate-900 mb-4">Meter Information</div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeMeters.map((meter, index) => (
                    <div key={meter._id || index} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-slate-900">{meter.meterNumber}</div>
                        {meter.isBillingActive && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-1 text-xs font-bold">
                            Billing Active
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-sm">
                        {meter.meterBrand && meter.meterModel && (
                          <div className="text-slate-600">
                            {meter.meterBrand} {meter.meterModel} • Size: {meter.meterSize}
                          </div>
                        )}
                        
                        {meter.location?.description && (
                          <div className="text-slate-500 truncate" title={meter.location.description}>
                            📍 {meter.location.description}
                          </div>
                        )}
                        
                        <div className="text-slate-500">
                          Status: <span className={`font-semibold ${
                            meter.meterCondition === "good" ? "text-green-600" : "text-amber-600"
                          }`}>
                            {meter.meterCondition}
                          </span>
                        </div>
                        
                        {meter.lastReading > 0 && (
                          <div className="text-slate-500">
                            Last Reading: {meter.lastReading} m³
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bills & Payments Card */}
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                <div>
                  <div className="text-lg font-black text-slate-900">Billing History</div>
                  <div className="text-sm text-slate-600 mt-1">
                    Showing bills for the last 12 months • {bills.length} record(s)
                  </div>
                </div>
                
                {years.length > 1 && (
                  <div className="mt-2 md:mt-0">
                    <div className="flex space-x-1">
                      {years.map(year => (
                        <button
                          key={year}
                          onClick={() => setActiveYear(year)}
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
                <div className="text-center py-8 text-slate-500">
                  No bills found for the last 12 months.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="py-3 px-4 rounded-l-xl">Period</th>
                        <th className="py-3 px-4">Meter</th>
                        <th className="py-3 px-4">Consumption</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 rounded-r-xl">Payments</th>
                      </tr>
                    </thead>

                    <tbody>
                      {bills
                        .filter(bill => bill.periodCovered?.startsWith(activeYear))
                        .map((b) => (
                          <tr key={b._id} className="border-t hover:bg-slate-50/60">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{b.periodCovered}</div>
                              {b.readingDate && (
                                <div className="text-xs text-slate-500">
                                  Read: {formatDate(b.readingDate)}
                                </div>
                              )}
                            </td>
                            
                            <td className="py-3 px-4">
                              {b.meterNumber || "—"}
                            </td>
                            
                            <td className="py-3 px-4">
                              <div className="font-semibold">{b.consumed} m³</div>
                              {b.tariffUsed && (
                                <div className="text-xs text-slate-500">
                                  {b.tariffUsed.tier} Tier
                                </div>
                              )}
                            </td>
                            
                            <td className="py-3 px-4">
                              <div className="font-bold">₱{money(b.totalDue)}</div>
                              {b.discount > 0 && (
                                <div className="text-xs text-emerald-600">
                                  -₱{money(b.discount)} discount
                                </div>
                              )}
                            </td>
                            
                            <td className="py-3 px-4">
                              {b.dueDate ? formatDate(b.dueDate) : "—"}
                            </td>
                            
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                                b.status === "paid"
                                  ? "bg-green-50 border-green-200 text-green-700"
                                  : b.status === "overdue"
                                  ? "bg-red-50 border-red-200 text-red-700"
                                  : "bg-amber-50 border-amber-200 text-amber-800"
                              }`}>
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
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 text-xs text-slate-500">
                💡 Note: This public inquiry shows limited information only. Contact the office for detailed bills.
              </div>
            </div>

            {/* Tariff Calculator & Guide Card */}
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
              <div className="text-lg font-black text-slate-900 mb-4">Tariff Calculator & Guide</div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Calculator Section */}
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-700">Calculate Your Bill</div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">
                        Classification
                      </label>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                        value={calculatorForm.classification}
                        onChange={(e) => {
                          setCalculatorForm(prev => ({ ...prev, classification: e.target.value }));
                          fetchTariffExamples(e.target.value);
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
                          setCalculatorForm(prev => ({ ...prev, consumption: value }));
                          if (value > 0) {
                            setTimeout(calculateTariff, 300);
                          } else {
                            setCalculatorResult(null);
                          }
                        }}
                        placeholder="Enter consumption in cubic meters"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isSenior"
                        checked={calculatorForm.isSenior}
                        onChange={(e) => {
                          setCalculatorForm(prev => ({ ...prev, isSenior: e.target.checked }));
                          if (calculatorForm.consumption > 0) {
                            setTimeout(calculateTariff, 300);
                          }
                        }}
                        className="rounded border-slate-300"
                      />
                      <label htmlFor="isSenior" className="text-sm text-slate-700">
                        Apply Senior Citizen Discount (5%)
                      </label>
                    </div>
                    
                    <button
                      onClick={calculateTariff}
                      disabled={calculatorForm.consumption <= 0}
                      className="w-full rounded-xl bg-slate-900 text-white py-2.5 font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Calculate Bill
                    </button>
                  </div>
                  
                  {/* Calculation Result */}
                  {calculatorResult && (
                    <div className="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
                      <div className="font-bold text-slate-900 mb-2">
                        Estimated Bill: ₱{money(calculatorResult.finalAmount)}
                      </div>
                      
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Base Amount:</span>
                          <span>₱{money(calculatorResult.calculatedAmount)}</span>
                        </div>
                        
                        {calculatorResult.seniorDiscountApplied && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Senior Discount ({calculatorResult.discountRate}%):</span>
                              <span className="text-emerald-600">-₱{money(calculatorResult.discountAmount)}</span>
                            </div>
                            <div className="text-xs text-slate-500">
                              * Senior discount applies to consumption ≥ 31m³ for residential, ≥ 31m³ for commercial
                            </div>
                          </>
                        )}
                        
                        <div className="flex justify-between font-bold text-slate-900 border-t pt-2 mt-2">
                          <span>Total Amount:</span>
                          <span>₱{money(calculatorResult.finalAmount)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Tariff Guide Section */}
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-700">
                    {tariffExamples?.description || "Tariff Structure"}
                  </div>
                  
                  <div className="text-sm text-slate-600">
                    Our water tariff is designed to encourage conservation while ensuring fair pricing:
                  </div>
                  
                  <div className="space-y-2">
                    {calculatorForm.classification === "residential" ? (
                      <>
                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                          <div className="font-bold text-blue-800 text-sm">Minimum Charge</div>
                          <div className="text-xs text-blue-700 mt-1">
                            0-5 m³ = ₱74.00 (covers basic water needs)
                          </div>
                        </div>
                        
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                          <div className="font-bold text-emerald-800 text-sm">Tiered Pricing</div>
                          <div className="text-xs text-emerald-700 mt-1">
                            Higher consumption tiers have higher rates per cubic meter to encourage conservation.
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                          <div className="font-bold text-purple-800 text-sm">Minimum Charge</div>
                          <div className="text-xs text-purple-700 mt-1">
                            0-15 m³ = ₱442.50 (standard commercial rate)
                          </div>
                        </div>
                        
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                          <div className="font-bold text-emerald-800 text-sm">Tiered Pricing</div>
                          <div className="text-xs text-emerald-700 mt-1">
                            Commercial rates are higher than residential to reflect higher capacity requirements.
                          </div>
                        </div>
                      </>
                    )}
                    
                    {calculatorForm.isSenior && (
                      <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                        <div className="font-bold text-yellow-800 text-sm">Senior Citizen Discount</div>
                        <div className="text-xs text-yellow-700 mt-1">
                          5% discount applied to consumption tiers 31-40 m³ and 41+ m³ only.
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Tariff Examples Table */}
                  {tariffExamples && tariffExamples.examples && (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-slate-700 mb-2">Example Calculations:</div>
                      <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="py-2 px-3 text-left">Consumption</th>
                              <th className="py-2 px-3 text-left">Amount</th>
                              <th className="py-2 px-3 text-left">Calculation</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tariffExamples.examples.slice(0, 6).map((example, index) => (
                              <tr key={index} className="border-t border-slate-100">
                                <td className="py-2 px-3 font-medium">{example.consumption} m³</td>
                                <td className="py-2 px-3 font-bold">₱{money(example.amount)}</td>
                                <td className="py-2 px-3 text-slate-600">{example.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t border-slate-200">
                <div className="text-sm font-semibold text-slate-700 mb-2">Understanding Your Bill</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
                  <div className="space-y-1">
                    <div className="font-medium text-slate-700">1. Meter Reading</div>
                    <div>Your bill is based on the difference between current and previous meter readings.</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-slate-700">2. Consumption Tiers</div>
                    <div>The more water you use, the higher the rate per cubic meter in higher tiers.</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-slate-700">3. Discounts</div>
                    <div>Senior citizens get 5% discount on consumption above 30m³ (residential) or 30m³ (commercial).</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Note */}
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