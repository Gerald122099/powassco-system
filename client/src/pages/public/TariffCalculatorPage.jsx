// src/pages/public/TariffCalculatorPage.jsx
import { useState, useEffect } from "react";
import Navbar from "../../components/Navbar";
import logo from "../../assets/logo.png";
import { apiFetch } from "../../lib/api";

function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TariffCalculatorPage() {
  const [calculatorForm, setCalculatorForm] = useState({
    classification: "residential",
    consumption: "",
    isSenior: false,
  });
  const [calculatorResult, setCalculatorResult] = useState(null);
  const [tariffData, setTariffData] = useState(null); // { table, description }
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTariffTable("residential");
  }, []);

  async function fetchTariffTable(classification) {
    try {
      const json = await apiFetch(`/public/water/tariff-examples/${classification}`);
      setTariffData(json);
    } catch (error) {
      console.error("Failed to fetch tariff table:", error);
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
      const json = await apiFetch("/public/water/calculate-estimate", {
        method: "POST",
        body: {
          classification: calculatorForm.classification,
          consumption: c,
          isSenior: !!calculatorForm.isSenior,
        },
      });
      setCalculatorResult(json);
    } catch (error) {
      console.error("Calculation error:", error);
      setCalculatorResult({ error: true, message: error.message || "Calculation failed" });
    } finally {
      setLoading(false);
    }
  }

  const entered = Number(calculatorForm.consumption || 0);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-100 pt-24 pb-8 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6 mb-5">
            <div className="flex items-center gap-4">
              <img src={logo} alt="POWASSCO Logo" className="h-16 w-16 rounded-2xl object-contain border-2 border-green-200" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-green-600">POWASSCO</div>
                <div className="text-2xl font-bold text-gray-800">Water Tariff Calculator</div>
                <div className="text-sm text-gray-500 mt-1">
                  Estimate your bill and see exactly which tiers your consumption falls into.
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Calculator Form */}
            <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6">
              <h3 className="mb-4 text-lg font-bold text-gray-900">Calculate Your Bill</h3>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Classification</label>
                  <select
                    className="w-full rounded-xl border border-green-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={calculatorForm.classification}
                    onChange={(e) => {
                      const cls = e.target.value;
                      setCalculatorForm((prev) => ({ ...prev, classification: cls }));
                      fetchTariffTable(cls);
                      setCalculatorResult(null);
                    }}
                  >
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Monthly Consumption (m³)</label>
                  <input
                    type="number" min="0" step="0.1"
                    className="w-full rounded-xl border border-green-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={calculatorForm.consumption}
                    onChange={(e) => setCalculatorForm((prev) => ({ ...prev, consumption: e.target.value }))}
                    placeholder="Enter consumption in cubic meters"
                  />
                </div>

                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl">
                  <input
                    type="checkbox" id="isSenior"
                    checked={calculatorForm.isSenior}
                    onChange={(e) => setCalculatorForm((prev) => ({ ...prev, isSenior: e.target.checked }))}
                    className="rounded border-green-300 text-green-600 focus:ring-green-500"
                  />
                  <label htmlFor="isSenior" className="text-sm text-gray-700">Apply Senior Citizen Discount</label>
                </div>

                <button
                  onClick={calculateTariff}
                  disabled={entered <= 0 || loading}
                  className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white py-3 font-semibold hover:from-green-700 hover:to-green-800 disabled:opacity-50 transition-all"
                >
                  {loading ? "Calculating..." : "Calculate Bill"}
                </button>

                {/* Result */}
                {calculatorResult && (
                  <div className="mt-4 border border-green-100 rounded-2xl p-4 bg-gradient-to-br from-green-50 to-white">
                    {calculatorResult.error ? (
                      <div className="text-sm font-semibold text-red-700">{calculatorResult.message}</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-semibold text-gray-600">Estimated Total</div>
                          <div className="text-3xl font-black text-green-700">₱{money(calculatorResult.totalAmount)}</div>
                        </div>

                        {/* Per-tier breakdown — "what tiers is consumed" */}
                        {Array.isArray(calculatorResult.tierBreakdown) && calculatorResult.tierBreakdown.length > 0 && (
                          <div className="rounded-xl border border-green-100 bg-white overflow-hidden">
                            <div className="bg-green-50 px-3 py-2 text-xs font-bold text-green-800">
                              Consumption breakdown ({calculatorResult.consumption} m³)
                            </div>
                            <table className="w-full text-xs">
                              <tbody>
                                {calculatorResult.tierBreakdown.map((b, i) => (
                                  <tr key={i} className="border-t border-green-50">
                                    <td className="px-3 py-1.5">
                                      {b.isMinimum ? (
                                        <span className="font-semibold">0–{b.to} m³ <span className="text-gray-400">(minimum)</span></span>
                                      ) : (
                                        <span>
                                          <span className="font-semibold">{b.from}–{b.to} m³</span>
                                          <span className="text-gray-400"> · {b.units} m³ × ₱{money(b.rate)}</span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono font-semibold">₱{money(b.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="mt-3 space-y-1 text-sm">
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
                          <div className="flex justify-between py-2 mt-1 border-t-2 border-green-200 font-black text-gray-800">
                            <span>Total Amount Due</span>
                            <span>₱{money(calculatorResult.totalAmount)}</span>
                          </div>
                        </div>
                        <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-gray-500">{calculatorResult.message}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Full Tariff Table (grouped by tier) */}
            <div className="rounded-3xl bg-white border border-green-100 shadow-lg p-6">
              <h3 className="mb-1 text-lg font-bold text-gray-900">Full Tariff Table</h3>
              <p className="text-sm text-gray-600 mb-4">{tariffData?.description || "Loading the configured tariff…"}</p>

              {Array.isArray(tariffData?.table) && tariffData.table.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tariffData.table.map((group) => {
                    const isOpen = String(group.label).startsWith("over");
                    return (
                      <div key={group.tier} className="rounded-xl border border-green-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-green-50 to-green-100 px-3 py-2">
                          <div className="text-sm font-bold text-gray-800">{group.label}</div>
                          <div className="text-[11px] text-gray-500">
                            {group.chargeType === "flat" ? `Minimum ₱${money(group.flat)}` : `₱${money(group.rate)} / m³`}
                          </div>
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-white sticky top-0 text-gray-400">
                              <tr>
                                <th className="px-3 py-1.5 text-left font-medium">m³</th>
                                <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map((r, idx) => {
                                const isHit = !isOpen && Number(r.consumption) === entered && entered > 0;
                                const isHitOpen = isOpen && entered > 0 && Number(r.consumption) === entered;
                                const hit = isHit || isHitOpen;
                                return (
                                  <tr key={idx} className={`border-t border-green-50 ${hit ? "bg-amber-100 font-bold" : "hover:bg-green-50/50"}`}>
                                    <td className="px-3 py-1.5">{r.consumption}</td>
                                    <td className="px-3 py-1.5 text-right font-mono">₱{money(r.amount)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No tariff configured.</div>
              )}

              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                This table is generated live from the cooperative's Water Settings tariff. Estimates only —
                actual bills may include penalties or verified discounts.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
