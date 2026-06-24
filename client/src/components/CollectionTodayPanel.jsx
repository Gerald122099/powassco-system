// Daily collection summary shared by Cashier, Water Bill Officer, and Loan
// Officer dashboards. Caller passes a `module` prop ("all" | "water" | "loan")
// and an optional `defaultMine` to scope to the signed-in user's postings.
import { useCallback, useEffect, useState } from "react";
import Card from "./Card";
import { printHtmlDoc } from "../lib/printHtmlDoc";
import { apiFetch } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import { useAuth } from "../context/AuthContext";
import { Banknote, CreditCard, RefreshCw, ReceiptText, Printer, Filter, ArrowDownUp } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function CollectionTodayPanel({ module = "all", defaultMine = false }) {
  const { token, user } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [mine, setMine] = useState(defaultMine);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const params = new URLSearchParams({ date, module, ...(mine ? { mine: "1" } : {}) }).toString();
      const res = await apiFetch(`/collections/today?${params}`, { token });
      setData(res);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [date, module, mine, token]);

  useEffect(() => { load(); }, [load]);
  // Live: refresh the moment any payment is posted anywhere in the system.
  useRealtime(["payments"], load);

  function printReport() {
    if (!data) return;
    const water = data.waterPayments || [];
    const loan = data.loanPayments || [];
    const row = (p, kind) => `<tr><td>${fmtTime(p.paidAt)}</td><td>${p.orNo}</td><td>${kind}</td><td>${p.method}</td><td>${kind === "Water" ? `${p.pnNo} / ${p.meterNumber}` : `${p.loanId}`}</td><td>${p.receivedBy || "—"}</td><td style="text-align:right">${peso(p.amountPaid)}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Collection Report — ${data.date}</title>
      <style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}
      h1{font-size:16px;color:#0f766e;margin:0 0 6px}.muted{color:#64748b;font-size:11px}
      table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}
      th,td{border-bottom:1px solid #e2e8f0;padding:4px 6px;text-align:left}
      .totals{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
      .box{border:1px solid #e2e8f0;border-radius:8px;padding:8px}
      .grand{font-weight:bold;font-size:14px;color:#0f766e;text-align:right;margin-top:8px}
      </style></head><body>
      <h1>POWASSCO — Daily Collection Report</h1>
      <div class="muted">Date: ${data.date} ${data.scope.mine ? `• collector: ${data.scope.actor}` : "• whole house"} ${module !== "all" ? `• ${module.toUpperCase()} only` : ""} • printed ${new Date().toLocaleString()}</div>
      <div class="totals">
        <div class="box"><div class="muted">Cash collected</div><div style="font-size:16px;font-weight:bold">${peso(data.totals.cash)}</div></div>
        <div class="box"><div class="muted">Online posted</div><div style="font-size:16px;font-weight:bold">${peso(data.totals.online)}</div></div>
        <div class="box"><div class="muted">Sales/Product</div><div style="font-size:16px;font-weight:bold">${peso(data.totals.productCash || 0)}</div></div>
        <div class="box"><div class="muted">Grand total</div><div style="font-size:16px;font-weight:bold;color:#0f766e">${peso((data.totals.grand || 0) + (data.totals.productCash || 0))}</div></div>
      </div>
      <table><thead><tr><th>Time</th><th>OR No</th><th>Module</th><th>Method</th><th>Reference</th><th>Posted by</th><th style="text-align:right">Amount</th></tr></thead><tbody>
        ${water.map((p) => row(p, "Water")).join("")}
        ${loan.map((p) => row(p, "Loan")).join("")}
      </tbody></table>
      <div class="grand">GRAND TOTAL: ${peso((data.totals.grand || 0) + (data.totals.productCash || 0))}</div>
      </body></html>`;
    printHtmlDoc(html);
  }

  if (err) return <Card><div className="text-sm text-red-700">{err}</div></Card>;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <ReceiptText size={20} className="text-emerald-600" />
            {module === "water" ? "Water Collection" : module === "loan" ? "Loan Collection" : "Collection"} — {data?.date || date}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            {mine ? <>Showing posts by <b>{user?.fullName || user?.employeeId}</b>.</> : "Showing the whole house total."} Cash and online are added together.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setDate(todayStr())} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${date === todayStr() ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>Today</button>
          <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Yesterday</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            <Filter size={14} />
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine only
          </label>
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={printReport} disabled={!data || busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* Totals row */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700"><Banknote size={14}/> Cash</div>
          <div className="mt-1 text-2xl font-extrabold text-amber-800">{peso(data?.totals?.cash || 0)}</div>
          <div className="text-xs text-amber-700">{(data?.counts?.water?.cash || 0) + (data?.counts?.loan?.cash || 0)} payment(s)</div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700"><CreditCard size={14}/> Online</div>
          <div className="mt-1 text-2xl font-extrabold text-blue-800">{peso(data?.totals?.online || 0)}</div>
          <div className="text-xs text-blue-700">{(data?.counts?.water?.online || 0) + (data?.counts?.loan?.online || 0)} payment(s)</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700"><ArrowDownUp size={14}/> Grand Total</div>
          <div className="mt-1 text-3xl font-extrabold text-emerald-800">{peso((data?.totals?.grand || 0) + (data?.totals?.productCash || 0))}</div>
          <div className="text-xs text-emerald-700">
            {(data?.counts?.water?.total || 0) + (data?.counts?.loan?.total || 0)} payment(s)
            {Number(data?.totals?.productCash) > 0 ? ` · incl. ${peso(data.totals.productCash)} sales/product` : ""}
          </div>
        </div>
      </div>

      {/* Module split (only shows what's relevant for the caller) */}
      {(module === "all" || module === "water") && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Water</div>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <div><div className="text-[10px] text-slate-500">Cash</div><div className="font-bold">{peso(data?.totals?.water?.cash || 0)}</div></div>
              <div><div className="text-[10px] text-slate-500">Online</div><div className="font-bold">{peso(data?.totals?.water?.online || 0)}</div></div>
              <div><div className="text-[10px] text-slate-500">Total</div><div className="font-bold text-emerald-700">{peso(data?.totals?.water?.total || 0)}</div></div>
            </div>
          </div>
          {module === "all" && (
            <div className="rounded-2xl border border-slate-200 p-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loan</div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <div><div className="text-[10px] text-slate-500">Cash</div><div className="font-bold">{peso(data?.totals?.loan?.cash || 0)}</div></div>
                <div><div className="text-[10px] text-slate-500">Online</div><div className="font-bold">{peso(data?.totals?.loan?.online || 0)}</div></div>
                <div><div className="text-[10px] text-slate-500">Total</div><div className="font-bold text-emerald-700">{peso(data?.totals?.loan?.total || 0)}</div></div>
              </div>
            </div>
          )}
          {module === "all" && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">Sales & Product loans (cash)</div>
              <div className="mt-1 text-lg font-bold text-orange-700">{peso(data?.totals?.productCash || 0)}</div>
              <div className="text-[10px] text-slate-500">Counter product sales + product-loan payments collected in cash today.</div>
            </div>
          )}
        </div>
      )}
      {module === "loan" && (
        <div className="mt-4 rounded-2xl border border-slate-200 p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loan</div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <div><div className="text-[10px] text-slate-500">Cash</div><div className="font-bold">{peso(data?.totals?.loan?.cash || 0)}</div></div>
            <div><div className="text-[10px] text-slate-500">Online</div><div className="font-bold">{peso(data?.totals?.loan?.online || 0)}</div></div>
            <div><div className="text-[10px] text-slate-500">Total</div><div className="font-bold text-emerald-700">{peso(data?.totals?.loan?.total || 0)}</div></div>
          </div>
        </div>
      )}

      {/* Collectors breakdown */}
      {data?.collectors?.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">By collector</div>
          <div className="overflow-auto rounded-2xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="px-3 py-2">Posted by</th><th className="px-3 py-2 text-right">Water</th><th className="px-3 py-2 text-right">Loan</th><th className="px-3 py-2 text-right">Count</th><th className="px-3 py-2 text-right">Total</th></tr>
              </thead>
              <tbody>
                {data.collectors.map((c) => (
                  <tr key={c.receivedBy} className="border-t">
                    <td className="px-3 py-2 font-semibold">{c.receivedBy}</td>
                    <td className="px-3 py-2 text-right">{peso(c.water)}</td>
                    <td className="px-3 py-2 text-right">{peso(c.loan)}</td>
                    <td className="px-3 py-2 text-right">{c.count}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700">{peso(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment lines */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(module === "all" || module === "water") && (
          <PaymentLines title="Water payments" rows={data?.waterPayments || []} refKey={(p) => `${p.pnNo} / ${p.meterNumber} • ${p.periodKey}`} />
        )}
        {(module === "all" || module === "loan") && (
          <PaymentLines title="Loan payments" rows={data?.loanPayments || []} refKey={(p) => `${p.loanId} • ${p.borrowerPnNo || ""}`} />
        )}
      </div>
    </Card>
  );
}

function PaymentLines({ title, rows, refKey }) {
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">{title} ({rows.length})</div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-slate-500">No payments yet for the selected day.</div>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-white text-left text-xs text-slate-500 sticky top-0">
              <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">OR No</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Posted by</th><th className="px-3 py-2 text-right">Amount</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p._id || p.orNo} className="border-t">
                  <td className="px-3 py-2 text-xs">{fmtTime(p.paidAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.orNo}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.method === "online" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{p.method}</span>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">{refKey(p)}</td>
                  <td className="px-3 py-2 text-xs">{p.receivedBy || "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{peso(p.amountPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
