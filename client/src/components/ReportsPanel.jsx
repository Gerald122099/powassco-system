// Shared Reports panel — date-preset filtered listing of cashier
// transactions with PDF + CSV export.
//
// Used by:
//   • cashier (Reports tab) — own transactions filtered by date
//   • bookkeeper (Reports tab) — all transactions filtered by date
//
// Data source: GET /bookkeeper/transactions (cashier guard widened
// in c2ecd4f). The endpoint already supports module + from/to + q.

import { useEffect, useState, useCallback } from "react";
import Card from "../components/Card";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { exportPdf, exportCsv, reportFormatters } from "../lib/reportExport";
import { FileDown, FileSpreadsheet, RefreshCw, Calendar } from "lucide-react";

const { peso, dateTime } = reportFormatters;

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This week" },
  { key: "lastWeek", label: "Last week" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "custom", label: "Custom" },
];

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeForPreset(key) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (key === "today") return { from: ymd(now), to: ymd(now) };
  if (key === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { from: ymd(y), to: ymd(y) };
  }
  if (key === "thisWeek") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  if (key === "lastWeek") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const end = new Date(now);
    end.setDate(now.getDate() - day - 1);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return { from: ymd(start), to: ymd(end) };
  }
  if (key === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: ymd(start), to: ymd(end) };
  }
  if (key === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(start), to: ymd(end) };
  }
  return { from: "", to: "" };
}

export default function ReportsPanel({ defaultTitle = "Treasurer's Report — Cash Collections" } = {}) {
  const { token, user } = useAuth();
  const [preset, setPreset] = useState("today");
  const [from, setFrom] = useState(() => rangeForPreset("today").from);
  const [to, setTo] = useState(() => rangeForPreset("today").to);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      if (moduleFilter === "pettycash") {
        // Petty cash is a separate ledger; fetch it whole and filter client-side.
        setData({ _petty: await apiFetch("/petty-cash?limit=1000", { token }) });
      } else {
        const params = new URLSearchParams({ module: moduleFilter });
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        setData(await apiFetch(`/bookkeeper/transactions?${params.toString()}`, { token }));
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [moduleFilter, from, to, token]);

  useEffect(() => { load(); }, [load]);

  function pickPreset(k) {
    setPreset(k);
    if (k !== "custom") {
      const { from: f, to: t } = rangeForPreset(k);
      setFrom(f); setTo(t);
    }
  }

  const isPetty = moduleFilter === "pettycash";
  const inRange = (dt) => {
    const d = ymd(new Date(dt));
    return (!from || d >= from) && (!to || d <= to);
  };

  // Petty cash rows for the chosen range (keeps the true cumulative balance).
  const pettyRows = data?._petty
    ? data._petty.transactions.filter((t) => inRange(t.date)).map((t) => ({ ...t, _type: "Petty" }))
    : [];
  const pettyIn = pettyRows.filter((r) => r.type === "replenish").reduce((s, r) => s + (r.amount || 0), 0);
  const pettyOut = pettyRows.filter((r) => r.type === "voucher").reduce((s, r) => s + (r.amount || 0), 0);

  // Combined rows for export — petty cash, or water + loan with a "type" marker.
  const allRows = isPetty
    ? pettyRows
    : (data && !data._petty
      ? [
          ...data.water.map((r) => ({ ...r, _type: "Water" })),
          ...data.loan.map((r) => ({ ...r, _type: "Loan" })),
        ].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
      : []);

  const pettyColumns = [
    { header: "Date", key: "date", format: (v) => dateTime(v) },
    { header: "Type", key: "type", format: (v) => (v === "replenish" ? "Replenish" : "Voucher") },
    { header: "Particulars", key: "description", format: (v, r) => v || (r.type === "replenish" ? "Fund replenishment" : "Petty cash voucher") },
    { header: "Category", key: "category" },
    { header: "Paid to", key: "payee" },
    { header: "Ref", key: "reference" },
    { header: "Cash in", key: "_in", align: "right", format: (_, r) => (r.type === "replenish" ? peso(r.amount) : "") },
    { header: "Cash out", key: "_out", align: "right", format: (_, r) => (r.type === "voucher" ? peso(r.amount) : "") },
    { header: "Balance", key: "running", align: "right", format: (v) => peso(v) },
    { header: "By", key: "recordedBy" },
  ];
  const txColumns = [
    { header: "Date / Time", key: "paidAt", format: (v) => dateTime(v) },
    { header: "OR No.", key: "orNo" },
    { header: "Type", key: "_type" },
    { header: "Account No.", key: "pnNo" },
    { header: "Account name", key: "accountName" },
    { header: "Meter / Loan", key: "_ref", format: (_, r) => r.meterNumber || r.loanId || "" },
    { header: "Amount due", key: "amountDue", align: "right", format: (v) => peso(v) },
    { header: "Amount received", key: "amountReceived", align: "right", format: (v) => peso(v) },
    { header: "CBU excess", key: "cbuExcess", align: "right", format: (v) => peso(v) },
    { header: "Cashier", key: "receivedBy" },
  ];
  const exportColumns = isPetty ? pettyColumns : txColumns;

  const exportTotals = isPetty
    ? (data?._petty
      ? [
          { label: "Replenished (in range)", value: peso(pettyIn) },
          { label: "Vouchers (in range)", value: peso(pettyOut) },
          { label: "Net (in range)", value: peso(pettyIn - pettyOut) },
          { label: "Current fund balance", value: peso(data._petty.balance) },
        ]
      : [])
    : (data && !data._petty
      ? [
          { label: "Water — transactions", value: data.totals.water.count },
          { label: "Water — received", value: peso(data.totals.water.amountReceived) },
          { label: "Loan — transactions", value: data.totals.loan.count },
          { label: "Loan — received", value: peso(data.totals.loan.amountReceived) },
          { label: "GRAND total received", value: peso(data.totals.grand.amountReceived) },
          { label: "GRAND CBU credited", value: peso(data.totals.grand.cbuExcess) },
        ]
      : []);

  const periodLabel = PRESETS.find((p) => p.key === preset)?.label || "";
  const reportTitle = isPetty
    ? "Petty Cash Report"
    : `${defaultTitle}${moduleFilter === "all" ? "" : ` — ${moduleFilter[0].toUpperCase()}${moduleFilter.slice(1)}`}`;
  const filenameSuffix = `${from || "all"}_${to || "all"}`.replace(/[^0-9A-Za-z_-]+/g, "_");

  function doExportPdf() {
    if (!allRows.length) return;
    exportPdf({
      title: reportTitle,
      fromDate: from,
      toDate: to,
      preparedBy: user?.fullName || user?.employeeId || "",
      columns: exportColumns,
      rows: allRows,
      totals: exportTotals,
      filename: `${isPetty ? "Petty_Cash_Report" : "Treasurers_Report"}_${filenameSuffix}.pdf`,
    });
  }
  function doExportCsv() {
    if (!allRows.length) return;
    exportCsv({
      title: reportTitle,
      fromDate: from,
      toDate: to,
      columns: exportColumns,
      rows: allRows,
      totals: exportTotals,
      filename: `${isPetty ? "Petty_Cash_Report" : "Treasurers_Report"}_${filenameSuffix}.csv`,
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Calendar size={20} className="text-emerald-600" /> Reports
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Generate the Treasurer's Report (PDF or Excel) for any date range. Pick a preset or set custom from-to dates.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={doExportCsv}
            disabled={!allRows.length}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Excel (.csv)
          </button>
          <button
            onClick={doExportPdf}
            disabled={!allRows.length}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <FileDown size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Preset pills + custom dates */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pickPreset(p.key)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${preset === p.key ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
        />
        <span className="text-slate-400 text-xs">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPreset("custom"); }}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
        />
        <div className="inline-flex rounded-xl border border-slate-200 ml-auto">
          {[
            { key: "all", label: "ALL" },
            { key: "water", label: "WATER" },
            { key: "loan", label: "LOAN" },
            { key: "pettycash", label: "PETTY CASH" },
          ].map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setModuleFilter(m.key)}
              className={`px-3 py-1.5 text-xs font-semibold ${moduleFilter === m.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      {err && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      {/* Summary tiles */}
      {data && !data._petty && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Transactions" value={data.totals.grand.count} />
          <Stat label="Amount due" value={peso(data.totals.grand.amountDue)} />
          <Stat label="Received" value={peso(data.totals.grand.amountReceived)} tone="emerald" />
          <Stat label="CBU credited" value={peso(data.totals.grand.cbuExcess)} tone="blue" />
        </div>
      )}
      {data && data._petty && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Replenished (range)" value={peso(pettyIn)} tone="emerald" />
          <Stat label="Vouchers (range)" value={peso(pettyOut)} tone="blue" />
          <Stat label="Net (range)" value={peso(pettyIn - pettyOut)} />
          <Stat label="Fund balance" value={peso(data._petty.balance)} tone="emerald" />
        </div>
      )}

      {/* Preview table — same format that will go into the PDF/CSV */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">
          {periodLabel} ({from || "—"} to {to || "—"}) — {allRows.length} row(s)
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-white text-left text-[10px] text-slate-500 sticky top-0">
              <tr>
                {exportColumns.map((c) => (
                  <th key={c.header} className={`px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr><td colSpan={exportColumns.length} className="py-10 text-center text-slate-500">Loading…</td></tr>
              ) : allRows.length === 0 ? (
                <tr><td colSpan={exportColumns.length} className="py-10 text-center text-slate-500">No transactions in this range.</td></tr>
              ) : allRows.map((r) => (
                <tr key={`${r._type}-${r._id}`} className="border-t">
                  {exportColumns.map((c) => (
                    <td key={c.header} className={`px-3 py-1.5 ${c.align === "right" ? "text-right font-mono" : ""}`}>
                      {c.format ? c.format(r[c.key], r) : (r[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone = "slate" }) {
  const bg = {
    slate: "bg-slate-50 border-slate-200 text-slate-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
  }[tone] || "bg-slate-50 border-slate-200";
  return (
    <div className={`rounded-2xl border p-3 text-center ${bg}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-xl font-extrabold">{value}</div>
    </div>
  );
}
