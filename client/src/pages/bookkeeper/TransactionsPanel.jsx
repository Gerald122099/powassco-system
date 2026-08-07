import { useCallback, useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useRealtime } from "../../lib/realtime";
import { useAuth } from "../../context/AuthContext";
import { Receipt, RefreshCw, Filter, Search, Hash, ArrowUpNarrowWide, ArrowDownWideNarrow, CalendarClock } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

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

export default function TransactionsPanel() {
  const { token } = useAuth();
  const [moduleFilter, setModuleFilter] = useState("all"); // all / water / loan / product / savings
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // OR-number range: the physical booklet doesn't line up with calendar
  // dates (an OR from May's booklet sometimes gets keyed in during June), so
  // this filters by the OR NUMBER itself instead of the date it was typed.
  const [orFrom, setOrFrom] = useState("");
  const [orTo, setOrTo] = useState("");
  const [orMonth, setOrMonth] = useState(""); // selected month for the auto-fill picker
  const [orMonthBusy, setOrMonthBusy] = useState(false);
  const [orMonthInfo, setOrMonthInfo] = useState(""); // small note after auto-fill
  // Sort: "Newest first" (date desc, default/unchanged) or OR-number
  // ascending/descending — lets the bookkeeper read the report in true
  // booklet sequence to spot gaps or out-of-order entries.
  const [sortBy, setSortBy] = useState("date"); // date | or
  const [sortDir, setSortDir] = useState("desc"); // asc | desc
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const params = new URLSearchParams({ module: moduleFilter, sortBy, sortDir });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (orFrom.trim()) params.set("orFrom", orFrom.trim());
      if (orTo.trim()) params.set("orTo", orTo.trim());
      if (q.trim()) params.set("q", q.trim());
      setData(await apiFetch(`/bookkeeper/transactions?${params.toString()}`, { token }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleFilter, from, to, orFrom, orTo, sortBy, sortDir, token]);

  useEffect(() => { load(); }, [load]);
  // Live: a new payment anywhere refreshes the transaction feed.
  useRealtime(["payments"], load);

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

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Receipt size={20} className="text-blue-600" /> Cashier Transactions
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Every payment the cashier posted — water and loan. The CBU column shows excess credited to the member's Capital Build-Up.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200">
            {["all", "water", "loan", "product", "savings"].map((m) => (
              <button key={m} onClick={() => setModuleFilter(m)} className={`px-3 py-1.5 text-xs font-semibold ${moduleFilter === m ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{m.toUpperCase()}</button>
            ))}
          </div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" title="Date from" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" title="Date to" />
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* OR-number range — filters by the physical OR booklet number instead
          of the date it was typed in (a May OR often gets keyed in June). */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2">
        <Hash size={14} className="text-blue-600" />
        <span className="text-xs font-semibold text-blue-800">OR range</span>
        <input
          value={orFrom}
          onChange={(e) => { setOrFrom(e.target.value.replace(/[^0-9]/g, "")); setOrMonthInfo(""); }}
          placeholder="from (e.g. 40760)"
          inputMode="numeric"
          className="w-32 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-mono"
        />
        <span className="text-xs text-blue-400">to</span>
        <input
          value={orTo}
          onChange={(e) => { setOrTo(e.target.value.replace(/[^0-9]/g, "")); setOrMonthInfo(""); }}
          placeholder="to (e.g. 41200)"
          inputMode="numeric"
          className="w-32 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-mono"
        />
        {(orFrom || orTo) && (
          <button onClick={() => { setOrFrom(""); setOrTo(""); setOrMonth(""); setOrMonthInfo(""); }} className="text-xs font-semibold text-blue-600 hover:underline">
            Clear
          </button>
        )}
        <span className="mx-1 h-4 w-px bg-blue-200" />
        <CalendarClock size={13} className="text-blue-600" />
        <select
          value={orMonth}
          onChange={(e) => pickOrMonth(e.target.value)}
          disabled={orMonthBusy}
          className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-50"
        >
          <option value="">Auto-fill from month…</option>
          {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        {orMonthInfo && <span className="text-[10px] text-blue-600">{orMonthInfo}</span>}
        <span className="ml-auto text-[10px] text-blue-500">Combines with the date range and search above, if set.</span>
      </div>

      {/* Sort — read the report in true OR-booklet sequence to spot gaps. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">Sort:</span>
        <div className="inline-flex rounded-xl border border-slate-200">
          <button
            onClick={() => { setSortBy("date"); setSortDir("desc"); }}
            className={`px-3 py-1.5 text-xs font-semibold ${sortBy === "date" ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Newest first
          </button>
          <button
            onClick={() => { setSortBy("or"); setSortDir("asc"); }}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold ${sortBy === "or" && sortDir === "asc" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <ArrowUpNarrowWide size={12} /> OR ascending
          </button>
          <button
            onClick={() => { setSortBy("or"); setSortDir("desc"); }}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold ${sortBy === "or" && sortDir === "desc" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <ArrowDownWideNarrow size={12} /> OR descending
          </button>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mt-3">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search OR No, PN, meter, loan ID…" className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm" />
        </div>
      </form>

      {err && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      {data && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Total transactions" value={data.totals.grand.count} />
          <Stat label="Amount due" value={peso(data.totals.grand.amountDue)} tone="slate" />
          <Stat label="Amount received" value={peso(data.totals.grand.amountReceived)} tone="emerald" />
          <Stat label="CBU credited" value={peso(data.totals.grand.cbuExcess)} tone="blue" />
        </div>
      )}

      {/* Water table */}
      {(moduleFilter === "all" || moduleFilter === "water") && (
        <Table
          title="Water payments"
          rows={data?.water || []}
          columns={[
            ["When", (r) => fmtDateTime(r.paidAt)],
            ["OR No", (r) => <span className="font-mono">{r.orNo}</span>],
            ["Account", (r) => <><div className="font-semibold">{r.accountName}</div><div className="text-[11px] text-slate-500 font-mono">{r.pnNo}</div></>],
            ["Meter / Period", (r) => <><div className="font-mono">{r.meterNumber}</div><div className="text-[11px] text-slate-500">{r.periodKey}</div></>],
            ["Due", (r) => peso(r.amountDue), "right"],
            ["Received", (r) => peso(r.amountReceived), "right"],
            ["CBU excess", (r) => peso(r.cbuExcess), "right", "text-blue-700 font-bold"],
            ["Cashier", (r) => r.receivedBy || "—"],
          ]}
          loading={busy && !data}
        />
      )}

      {/* Loan table */}
      {(moduleFilter === "all" || moduleFilter === "loan") && (
        <Table
          title="Loan payments"
          rows={data?.loan || []}
          columns={[
            ["When", (r) => fmtDateTime(r.paidAt)],
            ["OR No", (r) => <span className="font-mono">{r.orNo}</span>],
            ["Borrower", (r) => <><div className="font-semibold">{r.accountName}</div><div className="text-[11px] text-slate-500 font-mono">{r.pnNo}</div></>],
            ["Loan / Periods", (r) => <><div className="font-mono">{r.loanId}</div><div className="text-[11px] text-slate-500">{r.periodsCovered} period(s)</div></>],
            ["Due", (r) => peso(r.amountDue), "right"],
            ["Received", (r) => peso(r.amountReceived), "right"],
            ["CBU excess", (r) => peso(r.cbuExcess), "right", "text-blue-700 font-bold"],
            ["Cashier", (r) => r.receivedBy || "—"],
          ]}
          loading={busy && !data}
        />
      )}

      {/* Product loan / sale payments */}
      {moduleFilter === "product" && (
        <Table
          title="Product loan / sale payments"
          rows={data?.product || []}
          columns={[
            ["When", (r) => fmtDateTime(r.paidAt)],
            ["OR No", (r) => <span className="font-mono">{r.orNo}</span>],
            ["Account", (r) => <><div className="font-semibold">{r.accountName}</div>{r.pnNo && <div className="text-[11px] text-slate-500 font-mono">{r.pnNo}</div>}</>],
            ["Product / Type", (r) => <><div>{r.productName}</div><div className="text-[11px] uppercase text-slate-500">{r.transactionType} · qty {r.quantity}</div></>],
            ["Received", (r) => peso(r.amountReceived), "right"],
            ["Cashier", (r) => r.receivedBy || "—"],
          ]}
          loading={busy && !data}
        />
      )}

      {/* Savings deposits / withdrawals */}
      {moduleFilter === "savings" && (
        <Table
          title="Savings deposits / withdrawals"
          rows={data?.savings || []}
          columns={[
            ["When", (r) => fmtDateTime(r.paidAt)],
            ["OR No", (r) => <span className="font-mono">{r.orNo}</span>],
            ["Account", (r) => <><div className="font-semibold">{r.accountName}</div><div className="text-[11px] text-slate-500 font-mono">{r.pnNo}</div></>],
            ["Type", (r) => <span className={`text-[11px] font-bold uppercase ${r.type === "deposit" ? "text-emerald-600" : "text-red-600"}`}>{r.type}</span>],
            ["Deposit", (r) => (r.amountReceived ? peso(r.amountReceived) : "—"), "right"],
            ["Withdrawal", (r) => (r.amountOut ? peso(r.amountOut) : "—"), "right"],
            ["Cashier", (r) => r.receivedBy || "—"],
          ]}
          loading={busy && !data}
        />
      )}
    </Card>
  );
}

function Stat({ label, value, tone = "slate" }) {
  const bg = { slate: "bg-slate-50 border-slate-200 text-slate-800", emerald: "bg-emerald-50 border-emerald-200 text-emerald-800", blue: "bg-blue-50 border-blue-200 text-blue-800" }[tone] || "bg-slate-50";
  return (
    <div className={`rounded-2xl border p-3 text-center ${bg}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-xl font-extrabold">{value}</div>
    </div>
  );
}

function Table({ title, rows, columns, loading }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
      <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">{title} ({rows.length})</div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-white text-left text-xs text-slate-500">
            <tr>
              {columns.map(([h, , align]) => (
                <th key={h} className={`px-3 py-2 ${align === "right" ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="py-10 text-center text-slate-500">No transactions in range.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r._id} className="border-t">
                  {columns.map(([, fn, align, extra], i) => (
                    <td key={i} className={`px-3 py-2 ${align === "right" ? "text-right" : ""} ${extra || ""}`}>{fn(r)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
