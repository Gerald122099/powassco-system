import { useCallback, useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useRealtime } from "../../lib/realtime";
import { useAuth } from "../../context/AuthContext";
import { Receipt, RefreshCw, Filter, Search } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function TransactionsPanel() {
  const { token } = useAuth();
  const [moduleFilter, setModuleFilter] = useState("all"); // all / water / loan
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const params = new URLSearchParams({ module: moduleFilter });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (q.trim()) params.set("q", q.trim());
      setData(await apiFetch(`/bookkeeper/transactions?${params.toString()}`, { token }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleFilter, from, to, token]);

  useEffect(() => { load(); }, [load]);
  // Live: a new payment anywhere refreshes the transaction feed.
  useRealtime(["payments"], load);

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
            {["all", "water", "loan"].map((m) => (
              <button key={m} onClick={() => setModuleFilter(m)} className={`px-3 py-1.5 text-xs font-semibold ${moduleFilter === m ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{m.toUpperCase()}</button>
            ))}
          </div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
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
