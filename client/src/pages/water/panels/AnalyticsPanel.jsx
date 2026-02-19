// AnalyticsPanel.jsx (FIXED PDF generation)
import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/Card";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";

// ✅ Charts (screen only)
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function num(n) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString() : "0";
}
function pct(n) {
  const x = Number(n || 0);
  return `${x.toFixed(1)}%`;
}
function fmtDateTime(d) {
  try {
    return new Date(d).toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function StatCard({ label, value, sub, tone = "slate" }) {
  const toneMap = {
    slate: "border-slate-200 bg-white",
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
    blue: "border-blue-200 bg-blue-50",
    violet: "border-violet-200 bg-violet-50",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone] || toneMap.slate}`}>
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="text-2xl font-black text-slate-900 mt-1">{value}</div>
      {sub ? <div className="text-xs text-slate-600 mt-1">{sub}</div> : null}
    </div>
  );
}

function SectionTitle({ title, desc }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-black text-slate-900">{title}</div>
      {desc ? <div className="text-xs text-slate-600 mt-0.5">{desc}</div> : null}
    </div>
  );
}

function RowKV({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-b-0">
      <div className="text-sm text-slate-600">{k}</div>
      <div className="text-sm font-bold text-slate-900 text-right">{v}</div>
    </div>
  );
}

/**
 * ✅ FIXED: Build “numbers-only” HTML for A4 print with proper money formatting
 */
function buildReportHtml({ title, periodLabel, generatedAt, data }) {
  const bills = data?.bills || {};
  const membersBy = data?.membersByClassification || {};
  const meterStats = data?.meterStats || {};
  const series = Array.isArray(data?.series) ? data.series : [];

  // Helper functions for print window (redefined here to be available in HTML)
  const money = (n) => {
    const x = Number(n || 0);
    return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  
  const num = (n) => {
    const x = Number(n || 0);
    return Number.isFinite(x) ? x.toLocaleString() : "0";
  };

  const safe = (v) => (v === null || v === undefined ? "" : String(v));

  // NOTE: Print CSS: A4, margins, clean table, strong page-break control
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safe(title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
    .muted { color: #475569; }
    .small { font-size: 12px; }
    .tiny { font-size: 11px; }
    .h1 { font-size: 20px; font-weight: 800; margin: 0; }
    .h2 { font-size: 13px; font-weight: 800; margin: 0 0 8px; }
    .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .grid4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; }
    .kv { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #e2e8f0; }
    .kv:last-child { border-bottom: none; }
    .k { color: #475569; font-size: 12px; }
    .v { font-weight: 800; font-size: 12px; text-align: right; }
    .big { font-size: 16px; font-weight: 900; }
    .mt8 { margin-top: 8px; }
    .mt10 { margin-top: 10px; }
    .mt12 { margin-top: 12px; }
    .mt14 { margin-top: 14px; }
    .mt16 { margin-top: 16px; }

    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border-top: 1px solid #e2e8f0; padding: 6px 6px; }
    thead th { background: #f1f5f9; border-top: none; text-align: left; color: #334155; }
    td.r, th.r { text-align: right; }
    .badgeRow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .badge { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; }
    .badge .lbl { font-size: 11px; color: #475569; }
    .badge .val { font-size: 14px; font-weight: 900; margin-top: 2px; }

    /* ✅ Page break control */
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    .page-break { page-break-after: always; break-after: page; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="card avoid-break">
    <div class="row">
      <div>
        <div class="small muted" style="font-weight:700;">POWASSCO MULTIPURPOSE COOPERATIVE</div>
        <p class="h1">${safe(title)}</p>
        <div class="small muted mt8">${safe(periodLabel)}</div>
      </div>
      <div style="text-align:right;">
        <div class="tiny muted">Generated</div>
        <div class="small" style="font-weight:800;">${safe(generatedAt)}</div>
      </div>
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="card avoid-break mt12">
    <p class="h2">Executive Summary</p>

    <div class="grid2">
      <div class="card">
        <div class="tiny muted">Billed Amount (Total Due)</div>
        <div class="big">₱ ${money(bills.billedAmount || 0)}</div>
      </div>
      <div class="card">
        <div class="tiny muted">Collected Amount</div>
        <div class="big">₱ ${money(bills.collectedAmount || 0)}</div>
      </div>
      <div class="card">
        <div class="tiny muted">Unpaid + Overdue Amount</div>
        <div class="big">₱ ${money(bills.unpaidAmount || 0)}</div>
      </div>
      <div class="card">
        <div class="tiny muted">Total Discounts</div>
        <div class="big">₱ ${money(bills.totalDiscounts || 0)}</div>
      </div>
    </div>

    <div class="badgeRow mt10">
      <div class="badge">
        <div class="lbl">Paid Bills</div>
        <div class="val">${num(bills.paidBills || 0)}</div>
      </div>
      <div class="badge">
        <div class="lbl">Unpaid Bills</div>
        <div class="val">${num(bills.unpaidBills || 0)}</div>
      </div>
      <div class="badge">
        <div class="lbl">Overdue Bills</div>
        <div class="val">${num(bills.overdueBills || 0)}</div>
      </div>
      <div class="badge">
        <div class="lbl">Partial Bills</div>
        <div class="val">${num(bills.partialBills || 0)}</div>
      </div>
    </div>
  </div>

  <!-- Members -->
  <div class="card avoid-break mt12">
    <p class="h2">Members</p>
    <div>
      <div class="kv"><div class="k">Total Members</div><div class="v">${num(data.members)}</div></div>
      <div class="kv"><div class="k">Active Members</div><div class="v">${num(data.activeMembers)}</div></div>
      <div class="kv"><div class="k">Disconnected Members (Total)</div><div class="v">${num(data.disconnectedMembers)}</div></div>
      <div class="kv"><div class="k">Disconnected (In Report Range)</div><div class="v">${num(data.disconnectedWithinRange)}</div></div>
      <div class="kv"><div class="k">Total Seniors</div><div class="v">${num(data.seniors)}</div></div>
    </div>

    <div class="card mt10">
      <div class="tiny" style="font-weight:800; color:#334155;">By Classification</div>
      <div class="grid2 mt8">
        <div class="kv"><div class="k">Residential</div><div class="v">${num(membersBy.residential || 0)}</div></div>
        <div class="kv"><div class="k">Commercial</div><div class="v">${num(membersBy.commercial || 0)}</div></div>
        <div class="kv"><div class="k">Institutional</div><div class="v">${num(membersBy.institutional || 0)}</div></div>
        <div class="kv"><div class="k">Government</div><div class="v">${num(membersBy.government || 0)}</div></div>
      </div>
    </div>
  </div>

  <!-- Meters & Readings -->
  <div class="card avoid-break mt12">
    <p class="h2">Meters & Readings</p>
    <div>
      <div class="kv"><div class="k">Total Meters</div><div class="v">${num(data.totalMeters)}</div></div>
      <div class="kv"><div class="k">Active Billing Meters</div><div class="v">${num(data.totalActiveMeters)}</div></div>
      <div class="kv"><div class="k">Inactive / Removed Meters</div><div class="v">${num(meterStats.inactiveMeters || 0)}</div></div>
      <div class="kv"><div class="k">New Meters Installed (In Range)</div><div class="v">${num(data.newMetersInstalled)}</div></div>
      <div class="kv"><div class="k">Meters Read (In Range)</div><div class="v">${num(data.readMeters)}</div></div>
      <div class="kv"><div class="k">Meters Unread (In Range)</div><div class="v">${num(data.unreadMeters)}</div></div>
    </div>
  </div>

  <!-- Bills & Finance -->
  <div class="card avoid-break mt12">
    <p class="h2">Bills & Finance</p>
    <div>
      <div class="kv"><div class="k">Total Consumption</div><div class="v">${money(bills.totalConsumption || 0)} m³</div></div>
      <div class="kv"><div class="k">Billed Amount (Total Due)</div><div class="v">₱ ${money(bills.billedAmount || 0)}</div></div>
      <div class="kv"><div class="k">Collected Amount</div><div class="v">₱ ${money(bills.collectedAmount || 0)}</div></div>
      <div class="kv"><div class="k">Unpaid + Overdue Amount</div><div class="v">₱ ${money(bills.unpaidAmount || 0)}</div></div>
      <div class="kv"><div class="k">Total Discounts</div><div class="v">₱ ${money(bills.totalDiscounts || 0)}</div></div>
    </div>
  </div>

  ${
    series.length
      ? `
  <!-- Period Breakdown (table) -->
  <div class="card mt12">
    <p class="h2">Period Breakdown</p>
    <div class="tiny muted">Numbers only (for audit / reconciliation)</div>

    <div class="mt10">
      <table>
        <thead>
          <tr>
            <th>Period</th>
            <th class="r">Billed</th>
            <th class="r">Collected</th>
            <th class="r">Unpaid</th>
            <th class="r">Discounts</th>
            <th class="r">Consumption</th>
            <th class="r">Read</th>
            <th class="r">Unread</th>
          </tr>
        </thead>
        <tbody>
          ${series
            .map(
              (r) => `
            <tr>
              <td style="font-weight:800;">${safe(r.periodKey)}</td>
              <td class="r">₱ ${money(r.billedAmount || 0)}</td>
              <td class="r">₱ ${money(r.collectedAmount || 0)}</td>
              <td class="r">₱ ${money(r.unpaidAmount || 0)}</td>
              <td class="r">₱ ${money(r.discounts || 0)}</td>
              <td class="r">${money(r.consumption || 0)} m³</td>
              <td class="r">${num(r.readMeters || 0)}</td>
              <td class="r">${num(r.unreadMeters || 0)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="tiny muted mt10">
      This report is system-generated for internal use. Values reflect recorded bills, payments, and readings within the selected period.
    </div>
  </div>
  `
      : ""
  }

  <!-- Signature -->
  <div class="mt14 tiny muted">
    Prepared by: ___________________________ &nbsp;&nbsp;&nbsp; Approved by: ___________________________
  </div>

</body>
</html>
`;
}

/**
 * Opens new window -> writes report only -> prints.
 * ✅ GUARANTEED: no app header/nav/tabs included.
 * ✅ FIXED: money() function now properly defined in print window
 */
function printReportWindow({ title, periodLabel, data }) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=980,height=720");
  if (!w) return;

  const html = buildReportHtml({
    title,
    periodLabel,
    generatedAt: fmtDateTime(new Date()),
    data,
  });

  w.document.open();
  w.document.write(html);
  w.document.close();

  // Give browser a tick to render before printing
  setTimeout(() => {
    w.focus();
    w.print();
    // Optional: auto-close after print dialog
    setTimeout(() => w.close(), 300);
  }, 250);
}

export default function AnalyticsPanel() {
  const { token } = useAuth();

  // Filters
  const [mode, setMode] = useState("last12"); // last12 | month | year
  const [periodKey, setPeriodKey] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [year, setYear] = useState(() => String(new Date().getFullYear()));

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const query = useMemo(() => {
    if (mode === "month") return `?mode=month&periodKey=${encodeURIComponent(periodKey)}`;
    if (mode === "year") return `?mode=year&year=${encodeURIComponent(year)}`;
    return `?mode=last12`;
  }, [mode, periodKey, year]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const d = await apiFetch(`/water/analytics/${query}`, { token });
      setData(d);
    } catch (e) {
      setErr(e.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    
  }, [query]);

  const reportTitle = useMemo(() => {
    if (mode === "month") return `Analytics Report — ${periodKey}`;
    if (mode === "year") return `Analytics Report — Year ${year}`;
    return "Analytics Report — Last 12 Months";
  }, [mode, periodKey, year]);

  const reportPeriodLabel = useMemo(() => {
    if (mode === "month") return `Period: ${periodKey}`;
    if (mode === "year") return `Year: ${year}`;
    return "Period: Last 12 months";
  }, [mode, periodKey, year]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const bills = data.bills || {};
    const billedAmount = Number(bills.billedAmount || 0);
    const collectedAmount = Number(bills.collectedAmount || 0);
    const unpaidAmount = Number(bills.unpaidAmount || 0);
    const totalDiscounts = Number(bills.totalDiscounts || 0);

    const collectionRate = billedAmount > 0 ? (collectedAmount / billedAmount) * 100 : 0;
    const discountRate = billedAmount > 0 ? (totalDiscounts / billedAmount) * 100 : 0;

    const totalActiveMeters = Number(data.totalActiveMeters || 0);
    const readMeters = Number(data.readMeters || 0);
    const coverage = totalActiveMeters > 0 ? (readMeters / totalActiveMeters) * 100 : 0;

    return {
      billedAmount,
      collectedAmount,
      unpaidAmount,
      totalDiscounts,
      collectionRate,
      discountRate,
      coverage,
    };
  }, [data]);

  // ✅ Chart data (monthly bars) — expects backend provides `data.series`
  const chartRows = useMemo(() => {
    if (!data?.series || !Array.isArray(data.series)) return [];
    return data.series.map((r) => ({
      period: r.periodKey,
      consumption: Number(r.consumption || 0),
      collected: Number(r.collectedAmount || 0),
    }));
  }, [data]);

  return (
    <Card>
      {/* Top controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-black text-slate-900">Analytics</div>
          <div className="text-xs text-slate-600 mt-1">
            Enhanced totals + yearly trends for consumption and collections.
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"
          >
            <option value="last12">Last 12 Months</option>
            <option value="month">Specific Month</option>
            <option value="year">Whole Year</option>
          </select>

          {mode === "month" && (
            <input
              type="month"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          )}

          {mode === "year" && (
            <input
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              placeholder="YYYY"
              className="w-28 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          )}

          <button
            onClick={load}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            Refresh
          </button>

          {/* ✅ PDF = numbers only and NEVER includes your top header/tabs */}
          <button
            onClick={() => data && printReportWindow({ title: reportTitle, periodLabel: reportPeriodLabel, data })}
            disabled={!data || loading}
            className="rounded-2xl bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            title="Opens a clean A4 report window (numbers only) then prints to PDF."
          >
            Generate PDF (A4)
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {err}
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-slate-600">Loading...</div>
      ) : !data ? (
        <div className="mt-4 text-slate-600">No data.</div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard
              label="Collected Amount"
              value={`₱ ${money(kpis?.collectedAmount || 0)}`}
              sub={`Collection Rate: ${pct(kpis?.collectionRate || 0)}`}
              tone="emerald"
            />
            <StatCard
              label="Unpaid + Overdue Amount"
              value={`₱ ${money(kpis?.unpaidAmount || 0)}`}
              sub={`Unpaid: ${num(data?.bills?.unpaidBills)} • Overdue: ${num(data?.bills?.overdueBills)}`}
              tone="red"
            />
            <StatCard
              label="Total Discounts"
              value={`₱ ${money(kpis?.totalDiscounts || 0)}`}
              sub={`Discount Rate: ${pct(kpis?.discountRate || 0)}`}
              tone="amber"
            />
          </div>

          {/* ✅ Year / Last12 Trends (Bar Graphs) */}
          {(mode === "year" || mode === "last12") && (
            <div className="rounded-3xl border border-slate-100 bg-white p-5">
              <SectionTitle
                title="Trends"
                desc="Monthly totals (screen only): Consumption and Collected Amount"
              />

              {chartRows.length === 0 ? (
                <div className="text-sm text-slate-600">
                  No trend series available yet. Your backend should return <b>data.series</b> with
                  periodKey, consumption, collectedAmount.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Consumption Bar */}
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-sm font-black text-slate-900 mb-2">
                      Total Consumption (m³)
                    </div>
                    <div style={{ width: "100%", height: 260 }}>
                      <ResponsiveContainer>
                        <BarChart data={chartRows}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="consumption" name="Consumption (m³)" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Collected Bar */}
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-sm font-black text-slate-900 mb-2">
                      Total Collected (₱)
                    </div>
                    <div style={{ width: "100%", height: 260 }}>
                      <ResponsiveContainer>
                        <BarChart data={chartRows}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="collected" name="Collected (₱)" fill="#10b981" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Core stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-3xl border border-slate-100 bg-white p-5">
              <SectionTitle title="Members" desc="Account totals and classifications" />
              <div className="space-y-1">
                <RowKV k="Total Members" v={num(data.members)} />
                <RowKV k="Active Members" v={num(data.activeMembers)} />
                <RowKV k="Disconnected Members" v={num(data.disconnectedMembers)} />
                <RowKV k="Disconnected (In Range)" v={num(data.disconnectedWithinRange)} />
                <RowKV k="Total Seniors" v={num(data.seniors)} />
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold text-slate-700 mb-2">By Classification</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Residential</span>
                    <b>{num(data.membersByClassification?.residential || 0)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Commercial</span>
                    <b>{num(data.membersByClassification?.commercial || 0)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Institutional</span>
                    <b>{num(data.membersByClassification?.institutional || 0)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Government</span>
                    <b>{num(data.membersByClassification?.government || 0)}</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-5">
              <SectionTitle title="Meters" desc="Installation and meter status summary" />
              <div className="space-y-1">
                <RowKV k="Total Meters" v={num(data.totalMeters)} />
                <RowKV k="Active Billing Meters" v={num(data.totalActiveMeters)} />
                <RowKV k="Inactive/Removed Meters" v={num(data.meterStats?.inactiveMeters || 0)} />
                <RowKV k="New Meters Installed (In Range)" v={num(data.newMetersInstalled)} />
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-xs font-bold text-blue-800">Reading Coverage</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="text-sm text-blue-700">
                    Read: <b>{num(data.readMeters)}</b> • Unread: <b>{num(data.unreadMeters)}</b>
                  </div>
                  <div className="text-sm font-black text-blue-900">
                    {pct(kpis?.coverage || 0)}
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, Number(kpis?.coverage || 0)))}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-5">
              <SectionTitle title="Bills & Collections" desc="Bill status and financial totals" />
              <div className="space-y-1">
                <RowKV k="Billed Amount (Total Due)" v={`₱ ${money(data.bills?.billedAmount || 0)}`} />
                <RowKV k="Collected Amount" v={`₱ ${money(data.bills?.collectedAmount || 0)}`} />
                <RowKV k="Unpaid + Overdue Amount" v={`₱ ${money(data.bills?.unpaidAmount || 0)}`} />
                <RowKV k="Total Discounts" v={`₱ ${money(data.bills?.totalDiscounts || 0)}`} />
                <RowKV k="Total Consumption" v={`${money(data.bills?.totalConsumption || 0)} m³`} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <StatCard label="Paid Bills" value={num(data.bills?.paidBills || 0)} tone="emerald" />
                <StatCard label="Unpaid Bills" value={num(data.bills?.unpaidBills || 0)} tone="amber" />
                <StatCard label="Overdue Bills" value={num(data.bills?.overdueBills || 0)} tone="red" />
                <StatCard label="Partial Bills" value={num(data.bills?.partialBills || 0)} tone="violet" />
              </div>
            </div>
          </div>

          {/* Period breakdown table (screen) */}
          {Array.isArray(data.series) && data.series.length > 0 && (
            <div className="rounded-3xl border border-slate-100 bg-white p-5">
              <SectionTitle title="Period Breakdown" desc="Numbers only (screen table) for quick audit" />
              <div className="overflow-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-left">
                    <tr>
                      <th className="py-3 px-4">Period</th>
                      <th className="py-3 px-4">Billed</th>
                      <th className="py-3 px-4">Collected</th>
                      <th className="py-3 px-4">Unpaid</th>
                      <th className="py-3 px-4">Discounts</th>
                      <th className="py-3 px-4">Consumption</th>
                      <th className="py-3 px-4">Read</th>
                      <th className="py-3 px-4">Unread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.series.map((r) => (
                      <tr key={r.periodKey} className="border-t">
                        <td className="py-3 px-4 font-bold text-slate-900">{r.periodKey}</td>
                        <td className="py-3 px-4">₱ {money(r.billedAmount)}</td>
                        <td className="py-3 px-4">₱ {money(r.collectedAmount)}</td>
                        <td className="py-3 px-4">₱ {money(r.unpaidAmount)}</td>
                        <td className="py-3 px-4">₱ {money(r.discounts)}</td>
                        <td className="py-3 px-4">{money(r.consumption)} m³</td>
                        <td className="py-3 px-4">{num(r.readMeters)}</td>
                        <td className="py-3 px-4">{num(r.unreadMeters)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                PDF export prints a clean A4 report (numbers only) and will never include header/tabs.
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}