// src/pages/public/TariffCalculatorPage.jsx
import { useState, useEffect } from "react";
import Navbar from "../../components/Navbar";
import logo from "../../assets/logo.png";

const API_BASE = import.meta.env.VITE_API_BASE;

function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TariffCalculatorPage() {
  const [calculatorForm, setCalculatorForm] = useState({
    classification: "residential",
    consumption: 0,
    isSenior: false,
  });
  const [calculatorResult, setCalculatorResult] = useState(null);
  const [tariffExamples, setTariffExamples] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTariffExamples("residential");
  }, []);

  async function fetchTariffExamples(classification) {
    try {
      const res = await fetch(`${API_BASE}/public/water/tariff-examples/${classification}`);
      const json = await res.json();
      if (res.ok) setTariffExamples(json);
    } catch (error) {
      console.error("Failed to fetch tariff examples:", error);
    }
  }

  async function calculateTariff() {
    const c = Number(calculatorForm.consumption || 0);
    if (!c || c <= 0) {
      setCalculatorResult(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/public/water/calculate-estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classification: calculatorForm.classification,
          consumption: c,
          isSenior: !!calculatorForm.isSenior,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to calculate estimate");

      setCalculatorResult(json);
    } catch (error) {
      console.error("Calculation error:", error);
      setCalculatorResult({
        error: true,
        message: error.message || "Calculation failed",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-100 pt-24 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6 mb-5">
            <div className="flex items-center gap-4">
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
                  <i className="fas fa-calculator text-green-500"></i>
                  POWASSCO
                </div>
                <div className="text-2xl font-bold text-gray-800">Water Tariff Calculator</div>
                <div className="text-sm text-gray-500 mt-1">
                  Estimate your water bill based on consumption and classification
                </div>
              </div>
            </div>
          </div>

          {/* Calculator Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Calculator Form */}
            <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6">
              <h3 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
                <i className="fas fa-sliders-h text-green-600"></i>
                Calculate Your Bill
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2 flex items-center gap-1">
                    <i className="fas fa-tag text-green-600"></i>
                    Classification
                  </label>
                  <select
                    className="w-full rounded-xl border border-green-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={calculatorForm.classification}
                    onChange={(e) => {
                      const cls = e.target.value;
                      setCalculatorForm(prev => ({ ...prev, classification: cls }));
                      fetchTariffExamples(cls);
                      setCalculatorResult(null);
                    }}
                  >
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2 flex items-center gap-1">
                    <i className="fas fa-chart-bar text-green-600"></i>
                    Monthly Consumption (m³)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="w-full rounded-xl border border-green-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={calculatorForm.consumption}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      setCalculatorForm(prev => ({ ...prev, consumption: value }));
                    }}
                    placeholder="Enter consumption in cubic meters"
                  />
                </div>

                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl">
                  <input
                    type="checkbox"
                    id="isSenior"
                    checked={calculatorForm.isSenior}
                    onChange={(e) =>
                      setCalculatorForm(prev => ({ ...prev, isSenior: e.target.checked }))
                    }
                    className="rounded border-green-300 text-green-600 focus:ring-green-500"
                  />
                  <label htmlFor="isSenior" className="text-sm text-gray-700 flex items-center gap-1">
                    <i className="fas fa-user-shield text-green-600"></i>
                    Apply Senior Citizen Discount (5%)
                  </label>
                </div>

                <button
                  onClick={calculateTariff}
                  disabled={Number(calculatorForm.consumption || 0) <= 0 || loading}
                  className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white py-3 font-semibold hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Calculating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-calculator"></i>
                      Calculate Bill
                    </>
                  )}
                </button>

                {/* Result */}
                {calculatorResult && (
                  <div className="mt-4 border border-green-100 rounded-2xl p-4 bg-gradient-to-br from-green-50 to-white">
                    {calculatorResult.error ? (
                      <div className="text-sm font-semibold text-red-700 flex items-center gap-2">
                        <i className="fas fa-exclamation-triangle"></i>
                        {calculatorResult.message}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-semibold text-gray-600">Estimated Total</div>
                          <div className="text-3xl font-black text-green-700">
                            ₱{money(calculatorResult.totalAmount)}
                          </div>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between py-1 border-b border-green-100">
                            <span className="text-gray-600">Tier</span>
                            <span className="font-semibold">{calculatorResult.tier}</span>
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-gray-600">Base Amount</span>
                            <span className="font-bold">₱{money(calculatorResult.breakdown?.baseAmount)}</span>
                          </div>
                          {calculatorResult.seniorDiscount?.applied && (
                            <div className="flex justify-between py-1 text-green-700">
                              <span>Senior Discount ({calculatorResult.seniorDiscount.rate}%)</span>
                              <span className="font-bold">-₱{money(calculatorResult.seniorDiscount.amount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between py-2 mt-2 border-t-2 border-green-200 font-black text-gray-800">
                            <span>Total Amount Due</span>
                            <span>₱{money(calculatorResult.totalAmount)}</span>
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-gray-500 bg-blue-50 p-2 rounded-lg flex items-center gap-1">
                          <i className="fas fa-info-circle text-blue-500"></i>
                          {calculatorResult.message}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tariff Guide */}
            <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6">
              <h3 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
                <i className="fas fa-book-open text-green-600"></i>
                Tariff Guide
              </h3>

              <p className="text-sm text-gray-600 mb-4">
                {tariffExamples?.description || "Select a classification to see example calculations"}
              </p>

              {tariffExamples?.examples?.length > 0 && (
                <div className="border border-green-100 rounded-xl overflow-hidden">
                  <div className="bg-gradient-to-r from-green-50 to-green-100 px-4 py-3 text-sm font-bold text-gray-700">
                    Example Calculations ({calculatorForm.classification})
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white sticky top-0">
                        <tr className="text-gray-500">
                          <th className="py-2 px-4 text-left">Consumption</th>
                          <th className="py-2 px-4 text-left">Amount</th>
                          <th className="py-2 px-4 text-left">Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tariffExamples.examples.map((ex, idx) => (
                          <tr key={idx} className="border-t border-green-50 hover:bg-green-50/50">
                            <td className="py-2 px-4 font-semibold">{ex.consumption} m³</td>
                            <td className="py-2 px-4 font-bold text-green-700">₱{money(ex.amount)}</td>
                            <td className="py-2 px-4 text-gray-600">{ex.tier || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-4 text-xs text-gray-500 bg-amber-50 p-3 rounded-xl flex items-start gap-2">
                <i className="fas fa-exclamation-triangle text-amber-600 mt-0.5"></i>
                <span>This calculator provides estimates only. Actual bills may include additional charges, penalties, or verified discounts.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}