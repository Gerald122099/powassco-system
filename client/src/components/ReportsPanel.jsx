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
import { exportPdf, exportExcel, reportFormatters } from "../lib/reportExport";
import { FileDown, FileSpreadsheet, RefreshCw, Calendar, Hash, ArrowUpNarrowWide, ArrowDownWideNarrow, CalendarClock } from "lucide-react";

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

// Last `n` months (this month first) as { key: "YYYY-MM", label: "Month YYYY" }
// — feeds the "auto-fill OR range from a month" picker.
function recentMonths(n = 18) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    });
  }
  return out;
}
const MONTHS = recentMonths();

// Numeric OR value from the leading digit run (mirrors the server's
// extraction) — used to re-sort the client-merged water+loan list by OR
// sequence. Non-numeric ORs sort last regardless of direction.
function orNumOf(orNo) {
  const m = String(orNo || "").match(/^\d+/);
  return m ? parseInt(m[0], 10) : null;
}

const sum = (arr) => arr.reduce((s, x) => s + (Number(x) || 0), 0);

// A member paying multiple meters/periods on one OR (see `orCbuTotal`, the
// TRUE CBU total for that OR from the ledger) needs a place to show that
// number that isn't "buried on whichever sub-row happened to carry the extra
// cash". Since this flat row list feeds BOTH the on-screen preview and the
// exported PDF/Excel (same rows + columns, no separate print layout), the
// grouping has to live in the DATA: a bold "main" row goes FIRST (combined
// due/received + the OR-level CBU total), then each meter/period's own line
// follows underneath as a sub-row — same order as the on-screen Transactions
// view. Sub-row text is kept plain ASCII: the embedded PDF font is a small
// Latin-only subset, and an arrow/symbol glyph outside it can corrupt the
// position of every character after it in that PDF text run. Single-line ORs
// (the common case) are left untouched, just with cbuExcess corrected to the
// ledger total.
function withOrGroupTotals(rows) {
  const order = [];
  const map = new Map();
  for (const r of rows) {
    const key = `${r.pnNo}|${r.orNo}`;
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(r);
  }
  const out = [];
  for (const key of order) {
    const grp = map.get(key);
    if (grp.length === 1) {
      const r = grp[0];
      out.push({ ...r, cbuExcess: r.orCbuTotal ?? r.cbuExcess ?? 0 });
      continue;
    }
    const subLabel = `${grp.length} sub-transactions`;
    out.push({
      _id: `${key}-main`, _type: grp[0]._type, _isGroupMain: true,
      orNo: grp[0].orNo, pnNo: grp[0].pnNo, accountName: grp[0].accountName,
      meterNumber: subLabel, loanId: subLabel, periodsCovered: "",
      amountDue: sum(grp.map((r) => r.amountDue)),
      amountReceived: sum(grp.map((r) => r.amountReceived)),
      cbuExcess: grp[0].orCbuTotal || 0,
      receivedBy: grp[0].receivedBy,
      paidAt: grp[grp.length - 1].paidAt,
    });
    for (const r of grp) out.push({ ...r, _isSubRow: true, orNo: "", pnNo: "", accountName: "", cbuExcess: 0 });
  }
  return out;
}

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
  // Period mode: "date" (presets/custom, as before) or "or" — the physical OR
  // booklet doesn't line up with calendar dates (a May OR often gets keyed in
  // during June), so "or" mode selects the period by OR NUMBER instead and
  // ignores the date range entirely, avoiding that exact misfile.
  const [periodMode, setPeriodMode] = useState("date");
  const [orFrom, setOrFrom] = useState("");
  const [orTo, setOrTo] = useState("");
  const [orMonth, setOrMonth] = useState(""); // selected month for the auto-fill picker
  const [orMonthBusy, setOrMonthBusy] = useState(false);
  const [orMonthInfo, setOrMonthInfo] = useState("");
  // Sort: "Newest first" (date desc, default/unchanged) or OR-number
  // ascending/descending — reads the report in true booklet sequence.
  const [sortBy, setSortBy] = useState("date"); // date | or
  const [sortDir, setSortDir] = useState("desc"); // asc | desc
  // Header period label — manual override for what prints as the report's
  // period line ("For the period: ...") in the PDF/Excel AND the on-screen
  // preview. Independent of the actual date/OR filter above: an OR is often
  // keyed in late (typed in July for a June receipt), so the filter that
  // correctly PULLS the data isn't always the label that correctly
  // DESCRIBES it — this lets the bookkeeper just type/pick "June 2026".
  const [periodOverride, setPeriodOverride] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isPetty = moduleFilter === "pettycash";
  const useOrRange = periodMode === "or" && !isPetty; // petty cash has no OR concept

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      if (moduleFilter === "pettycash") {
        // Petty cash is a separate ledger; fetch it whole and filter client-side.
        setData({ _petty: await apiFetch("/petty-cash?limit=1000", { token }) });
      } else {
        const params = new URLSearchParams({ module: moduleFilter, sortBy, sortDir });
        if (useOrRange) {
          if (orFrom.trim()) params.set("orFrom", orFrom.trim());
          if (orTo.trim()) params.set("orTo", orTo.trim());
        } else {
          if (from) params.set("from", from);
          if (to) params.set("to", to);
        }
        setData(await apiFetch(`/bookkeeper/transactions?${params.toString()}`, { token }));
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [moduleFilter, from, to, useOrRange, orFrom, orTo, sortBy, sortDir, token]);

  useEffect(() => { load(); }, [load]);

  // Pick a month -> ask the server what OR numbers were actually used that
  // month, and pre-fill the range inputs (still editable — it's a suggestion).
  async function pickOrMonth(key) {
    setOrMonth(key);
    if (!key) return;
    setOrMonthBusy(true); setOrMonthInfo("");
    try {
      const r = await apiFetch(`/bookkeeper/or-range-for-period?period=${key}&module=${moduleFilter}`, { token });
      if (r.orFrom || r.orTo) {
        setOrFrom(r.orFrom); setOrTo(r.orTo);
        setOrMonthInfo(`Suggested from ${r.count} OR${r.count === 1 ? "" : "s"} found that month — adjust if needed.`);
      } else {
        setOrMonthInfo("No OR numbers found for that month/module.");
      }
    } catch (e) { setOrMonthInfo(e.message); } finally { setOrMonthBusy(false); }
  }

  function pickPreset(k) {
    setPreset(k);
    if (k !== "custom") {
      const { from: f, to: t } = rangeForPreset(k);
      setFrom(f); setTo(t);
    }
  }
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

  const isProduct = moduleFilter === "product";
  const isSavings = moduleFilter === "savings";
  const isCbu = moduleFilter === "cbu";

  // Combined rows for export — petty cash, product, savings, CBU, or water +
  // loan with a "type" marker.
  const allRows = isPetty
    ? pettyRows
    : isProduct
    ? (data?.product || []).map((r) => ({ ...r, _type: "Product" }))
    : isSavings
    ? (data?.savings || []).map((r) => ({ ...r, _type: "Savings" }))
    : isCbu
    ? (data?.cbu || []).map((r) => ({ ...r, _type: "CBU" }))
    : (data && !data._petty
      ? withOrGroupTotals(
          [
            ...data.water.map((r) => ({ ...r, _type: "Water" })),
            ...data.loan.map((r) => ({ ...r, _type: "Loan" })),
          ].sort((a, b) => {
            // Water + loan are fetched separately then merged here, so the
            // server's own per-collection sort doesn't carry over — re-sort
            // the merged list the same way the user picked.
            if (sortBy === "or") {
              const an = orNumOf(a.orNo), bn = orNumOf(b.orNo);
              if (an == null && bn == null) return 0;
              if (an == null) return 1; // non-numeric ORs sort last either way
              if (bn == null) return -1;
              return sortDir === "asc" ? an - bn : bn - an;
            }
            return new Date(b.paidAt) - new Date(a.paidAt);
          })
        )
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
  const productColumns = [
    { header: "Date / Time", key: "paidAt", format: (v) => dateTime(v) },
    { header: "OR No.", key: "orNo" },
    { header: "Account No.", key: "pnNo" },
    { header: "Account / Customer", key: "accountName" },
    { header: "Product", key: "productName" },
    { header: "Transaction", key: "transactionType" },
    { header: "Qty", key: "quantity", align: "right" },
    { header: "Amount received", key: "amountReceived", align: "right", format: (v) => peso(v) },
    { header: "Cashier", key: "receivedBy" },
  ];
  const savingsColumns = [
    { header: "Date / Time", key: "paidAt", format: (v) => dateTime(v) },
    { header: "OR No.", key: "orNo" },
    { header: "Account No.", key: "pnNo" },
    { header: "Account name", key: "accountName" },
    { header: "Type", key: "type" },
    { header: "Deposit", key: "amountReceived", align: "right", format: (v) => (v ? peso(v) : "") },
    { header: "Withdrawal", key: "amountOut", align: "right", format: (v) => (v ? peso(v) : "") },
    { header: "Cashier", key: "receivedBy" },
  ];
  const cbuColumns = [
    { header: "Date / Time", key: "paidAt", format: (v) => dateTime(v) },
    { header: "OR No.", key: "orNo" },
    { header: "Account No.", key: "pnNo" },
    { header: "Account name", key: "accountName" },
    { header: "Source", key: "source", format: (v) => String(v || "").replace(/_/g, " ") },
    { header: "Credit", key: "amountReceived", align: "right", format: (v) => (v ? peso(v) : "") },
    { header: "Debit", key: "amountOut", align: "right", format: (v) => (v ? peso(v) : "") },
    { header: "Balance after", key: "balanceAfter", align: "right", format: (v) => peso(v) },
    { header: "By", key: "receivedBy" },
  ];
  const exportColumns = isPetty ? pettyColumns : isProduct ? productColumns : isSavings ? savingsColumns : isCbu ? cbuColumns : txColumns;

  const exportTotals = isPetty
    ? (data?._petty
      ? [
          { label: "Replenished (in range)", value: peso(pettyIn) },
          { label: "Vouchers (in range)", value: peso(pettyOut) },
          { label: "Net (in range)", value: peso(pettyIn - pettyOut) },
          { label: "Current fund balance", value: peso(data._petty.balance) },
        ]
      : [])
    : isProduct
    ? (data
      ? [
          { label: "Product — transactions", value: data.totals.product.count },
          { label: "Product — received", value: peso(data.totals.product.amountReceived) },
        ]
      : [])
    : isSavings
    ? (data
      ? [
          { label: "Savings — deposits", value: peso(data.totals.savings.amountReceived) },
          { label: "Savings — withdrawals", value: peso(data.totals.savings.amountOut) },
          { label: "Savings — net", value: peso(data.totals.savings.amountReceived - data.totals.savings.amountOut) },
        ]
      : [])
    : isCbu
    ? (data
      ? [
          { label: "CBU — credits", value: peso(data.totals.cbu.amountReceived) },
          { label: "CBU — debits", value: peso(data.totals.cbu.amountOut) },
          { label: "CBU — net", value: peso(data.totals.cbu.amountReceived - data.totals.cbu.amountOut) },
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
  // OR-range mode's period line — replaces the date-range line entirely on
  // screen and in the exported PDF/Excel header.
  const orRangeLabel = orFrom && orTo
    ? `OR # ${orFrom} to ${orTo}`
    : orFrom
    ? `OR # ${orFrom} onward`
    : orTo
    ? `OR # up to ${orTo}`
    : "OR # range not set";
  // The manual override wins over everything when set — it's what actually
  // prints as the period line, on screen and in the export.
  const headerPeriodLabel = periodOverride.trim()
    ? periodOverride.trim()
    : useOrRange
    ? orRangeLabel
    : "";
  const reportTitle = isPetty
    ? "Petty Cash Report"
    : `${defaultTitle}${moduleFilter === "all" ? "" : ` — ${moduleFilter[0].toUpperCase()}${moduleFilter.slice(1)}`}`;
  const filenameSuffix = periodOverride.trim()
    ? periodOverride.trim().replace(/[^0-9A-Za-z_-]+/g, "_")
    : useOrRange
    ? `OR${orFrom || "start"}-${orTo || "end"}`
    : `${from || "all"}_${to || "all"}`.replace(/[^0-9A-Za-z_-]+/g, "_");

  const [exporting, setExporting] = useState("");
  const baseName = isPetty ? "Petty_Cash_Report" : "Treasurers_Report";
  const exportPayload = () => ({
    title: reportTitle,
    fromDate: headerPeriodLabel ? undefined : from,
    toDate: headerPeriodLabel ? undefined : to,
    periodLabel: headerPeriodLabel || undefined,
    preparedBy: user?.fullName || user?.employeeId || "",
    columns: exportColumns,
    rows: allRows,
    totals: exportTotals,
  });
  async function doExportPdf() {
    if (!allRows.length || exporting) return;
    setExporting("pdf"); setErr("");
    try { await exportPdf({ ...exportPayload(), filename: `${baseName}_${filenameSuffix}.pdf` }); }
    catch (e) { setErr(`PDF export failed: ${e.message}`); }
    finally { setExporting(""); }
  }
  async function doExportExcel() {
    if (!allRows.length || exporting) return;
    setExporting("xlsx"); setErr("");
    try { await exportExcel({ ...exportPayload(), filename: `${baseName}_${filenameSuffix}.xlsx` }); }
    catch (e) { setErr(`Excel export failed: ${e.message}`); }
    finally { setExporting(""); }
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
            onClick={doExportExcel}
            disabled={!allRows.length || !!exporting}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> {exporting === "xlsx" ? "Exporting…" : "Excel (.xlsx)"}
          </button>
          <button
            onClick={doExportPdf}
            disabled={!allRows.length || !!exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <FileDown size={14} /> {exporting === "pdf" ? "Exporting…" : "PDF"}
          </button>
        </div>
      </div>

      {/* Period mode — date range (as before) or OR-number range. The OR
          booklet doesn't line up with calendar dates (a May OR sometimes
          gets keyed in during June), so OR mode reports the exact period a
          physical OR range covers instead of guessing from the typed date. */}
      {!isPetty && (
        <div className="mt-4 inline-flex rounded-xl border border-slate-200 p-1">
          <button
            type="button"
            onClick={() => setPeriodMode("date")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold ${periodMode === "date" ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
          >
            Date range
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode("or")}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold ${periodMode === "or" ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
          >
            <Hash size={11} /> OR number range
          </button>
        </div>
      )}

      {/* Preset pills + custom dates (date mode) / OR from-to (OR mode) */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {useOrRange ? (
          <>
            <span className="text-xs font-semibold text-blue-800">OR</span>
            <input
              value={orFrom}
              onChange={(e) => { setOrFrom(e.target.value.replace(/[^0-9]/g, "")); setOrMonthInfo(""); }}
              placeholder="from (e.g. 40760)"
              inputMode="numeric"
              className="w-32 rounded-xl border border-blue-200 px-3 py-1.5 text-xs font-mono"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              value={orTo}
              onChange={(e) => { setOrTo(e.target.value.replace(/[^0-9]/g, "")); setOrMonthInfo(""); }}
              placeholder="to (e.g. 41200)"
              inputMode="numeric"
              className="w-32 rounded-xl border border-blue-200 px-3 py-1.5 text-xs font-mono"
            />
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <CalendarClock size={13} className="text-blue-600" />
            <select
              value={orMonth}
              onChange={(e) => pickOrMonth(e.target.value)}
              disabled={orMonthBusy}
              className="rounded-xl border border-blue-200 px-2 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-50"
            >
              <option value="">Auto-fill from month…</option>
              {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            {orMonthInfo && <span className="text-[10px] text-blue-600">{orMonthInfo}</span>}
          </>
        ) : (
          <>
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
          </>
        )}
        <div className="inline-flex rounded-xl border border-slate-200 ml-auto">
          {[
            { key: "all", label: "ALL" },
            { key: "water", label: "WATER" },
            { key: "loan", label: "LOAN" },
            { key: "product", label: "PRODUCT" },
            { key: "savings", label: "SAVINGS" },
            { key: "cbu", label: "CBU" },
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

      {/* Sort — read the report in true OR-booklet sequence to spot gaps. */}
      {!isPetty && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Sort:</span>
          <div className="inline-flex rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => { setSortBy("date"); setSortDir("desc"); }}
              className={`px-3 py-1.5 text-xs font-semibold ${sortBy === "date" ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Newest first
            </button>
            <button
              type="button"
              onClick={() => { setSortBy("or"); setSortDir("asc"); }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold ${sortBy === "or" && sortDir === "asc" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <ArrowUpNarrowWide size={12} /> OR ascending
            </button>
            <button
              type="button"
              onClick={() => { setSortBy("or"); setSortDir("desc"); }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold ${sortBy === "or" && sortDir === "desc" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <ArrowDownWideNarrow size={12} /> OR descending
            </button>
          </div>
        </div>
      )}

      {/* Header period label — manual override for the PDF/Excel + on-screen
          period line. An OR often gets keyed in late (a June receipt typed
          in July), so the filter that correctly PULLS the data isn't always
          the label that correctly DESCRIBES it — type or pick the real month. */}
      {!isPetty && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2">
          <CalendarClock size={14} className="text-amber-600" />
          <span className="text-xs font-semibold text-amber-800">Header period</span>
          <select
            value=""
            onChange={(e) => { if (e.target.value) setPeriodOverride(MONTHS.find((mo) => mo.key === e.target.value)?.label || ""); }}
            className="rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs font-semibold text-amber-800"
          >
            <option value="">Pick a month…</option>
            {MONTHS.map((mo) => <option key={mo.key} value={mo.key}>{mo.label}</option>)}
          </select>
          <input
            value={periodOverride}
            onChange={(e) => setPeriodOverride(e.target.value)}
            placeholder="or type it — e.g. June 2026"
            className="min-w-[12rem] flex-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
          />
          {periodOverride && (
            <button onClick={() => setPeriodOverride("")} className="text-xs font-semibold text-amber-700 hover:underline">
              Clear
            </button>
          )}
          <span className="basis-full text-[10px] text-amber-600">
            Optional. Prints as the report's period line instead of the date/OR range above — use when the OR was keyed in late and doesn't match the actual month.
          </span>
        </div>
      )}

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
          {headerPeriodLabel || `${periodLabel} (${from || "—"} to ${to || "—"})`} — {allRows.length} row(s)
          {periodOverride.trim() && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">manual period</span>}
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
                <tr key={`${r._type}-${r._id}`} className={`border-t ${r._isGroupMain ? "bg-blue-50/60 font-bold text-blue-800" : r._isSubRow ? "bg-slate-50/70 text-slate-500" : ""}`}>
                  {exportColumns.map((c, i) => (
                    <td key={c.header} className={`px-3 py-1.5 ${c.align === "right" ? "text-right font-mono" : ""} ${r._isSubRow && i === 0 ? "pl-6" : ""}`}>
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
