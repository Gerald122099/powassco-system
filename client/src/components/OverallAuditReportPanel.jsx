// Overall Audit Report — the audit committee's single comprehensive
// view for a date range: collections, expenses, loans, product
// inventory (incl. unsold capital), treasury balances, CBU, savings —
// plus a comparison chart and a "Sign as audited" action that freezes
// the figures into a permanent record.

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "./Toast";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { ClipboardCheck, RefreshCw, Calendar, PenLine } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRESETS = [
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisYear", label: "This year" },
  { key: "custom", label: "Custom" },
];
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function rangeFor(key) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (key === "thisMonth") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  if (key === "lastMonth") return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (key === "thisYear") return { from: ymd(new Date(now.getFullYear(), 0, 1)), to: ymd(new Date(now.getFullYear(), 11, 31)) };
  return { from: "", to: "" };
}

function Stat({ label, value, tone = "slate" }) {
  const cls = {
    slate: "border-slate-200 bg-slate-50 text-slate-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 font-mono text-base font-extrabold">{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">{title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export default function OverallAuditReportPanel() {
  const { token } = useAuth();
  const [preset, setPreset] = useState("thisMonth");
  const [from, setFrom] = useState(() => rangeFor("thisMonth").from);
  const [to, setTo] = useState(() => rangeFor("thisMonth").to);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [findings, setFindings] = useState("");
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      setData(await apiFetch(`/audit-report/summary?${qs}`, { token }));
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }, [token, from, to]);
  useEffect(() => { load(); }, [load]);

  function pick(k) {
    setPreset(k);
    if (k !== "custom") { const r = rangeFor(k); setFrom(r.from); setTo(r.to); }
  }

  async function sign() {
    if (!from || !to) return toast.error("Pick a period first.");
    setSigning(true);
    try {
      await apiFetch("/audit-report/sign", { method: "POST", token, body: { from, to, label: label.trim(), findings: findings.trim() } });
      toast.success("Report signed and archived.");
      setSignOpen(false); setLabel(""); setFindings("");
    } catch (e) { toast.error(e.message); } finally { setSigning(false); }
  }

  const c = data?.collections || {};
  const ex = data?.expenses || {};
  const ln = data?.loans || {};
  const inv = data?.inventory || {};
  const tr = data?.treasury || {};
  const dis = data?.disbursements || {};

  const totalCollections = (c.waterCash || 0) + (c.waterOnline || 0) + (c.loanCash || 0) + (c.loanOnline || 0) +
    (c.savingsIn || 0) + (c.productCashSale || 0) + (c.productLoanRevenue || 0);

  const chartData = data ? [
    { name: "Collections", value: Math.round(totalCollections) },
    { name: "Expenses", value: Math.round(ex.total || 0) },
    { name: "Loan capital", value: Math.round(ln.capital || 0) },
    { name: "Loan interest", value: Math.round(ln.interest || 0) },
    { name: "Loan unpaid", value: Math.round(ln.outstandingNow || 0) },
    { name: "Unsold capital", value: Math.round(inv.capitalUnsold || 0) },
  ] : [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <ClipboardCheck size={20} className="text-violet-600" /> Overall Audit Report
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Every money figure + inventory for the selected period. Sign it to freeze and archive the audit.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setSignOpen(true)} disabled={!data} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
            <PenLine size={14} /> Sign as Audited
          </button>
        </div>
      </div>

      {/* Range */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1 text-slate-500"><Calendar size={12} /> Period:</span>
        <div className="inline-flex rounded-xl border border-slate-200 p-1">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => pick(p.key)}
              className={`rounded-lg px-3 py-1 font-semibold ${preset === p.key ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="rounded-xl border border-slate-200 px-2 py-1" />
        <span className="text-slate-400">to</span>
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="rounded-xl border border-slate-200 px-2 py-1" />
      </div>

      {/* Headline + chart */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total collections" value={peso(totalCollections)} tone="emerald" />
        <Stat label="Total expenses" value={peso(ex.total)} tone="rose" />
        <Stat label="Loan capital released" value={peso(ln.capital)} tone="blue" />
        <Stat label="Loan outstanding (now)" value={peso(ln.outstandingNow)} tone="amber" />
      </div>

      <div className="mt-4 h-64 rounded-2xl border border-slate-200 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
            <Tooltip formatter={(v) => peso(v)} />
            <Legend />
            <Bar dataKey="value" name="Amount (₱)" fill="#7c3aed" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* General disbursements — total OUT, per-stream breakdown */}
      <div className="mt-4 rounded-2xl border-2 border-rose-200">
        <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50 px-4 py-2">
          <span className="text-xs font-bold uppercase tracking-wide text-rose-800">General Disbursements (period)</span>
          <span className="font-mono text-base font-extrabold text-rose-800">{peso(dis.grandTotal)}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-1 flex items-center justify-between text-sm font-bold text-slate-800">
              <span>Payroll</span><span className="font-mono">{peso(dis.payroll?.total)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600"><span>Payslips ({dis.payroll?.payslips?.count ?? 0})</span><span className="font-mono">{peso(dis.payroll?.payslips?.total)}</span></div>
            <div className="flex justify-between text-xs text-slate-600"><span>Cash advances ({dis.payroll?.advances?.count ?? 0})</span><span className="font-mono">{peso(dis.payroll?.advances?.total)}</span></div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-1 flex items-center justify-between text-sm font-bold text-slate-800">
              <span>Loan proceeds paid ({dis.loanProceeds?.count ?? 0})</span><span className="font-mono">{peso(dis.loanProceeds?.total)}</span>
            </div>
            <div className="mt-2 mb-1 flex items-center justify-between text-sm font-bold text-slate-800">
              <span>Member fees collected ({dis.memberFees?.count ?? 0})</span><span className="font-mono text-emerald-700">{peso(dis.memberFees?.total)}</span>
            </div>
            <div className="text-[10px] text-slate-400">membership {peso(dis.memberFees?.membership)} + tapping {peso(dis.memberFees?.tapping)} (inflow)</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
            <div className="mb-1 flex items-center justify-between text-sm font-bold text-slate-800">
              <span>Expenses {dis.expenses ? `(cash ${peso(dis.expenses.cash)} · bank ${peso(dis.expenses.bank)})` : ""}</span>
              <span className="font-mono">{peso(dis.expenses?.total)}</span>
            </div>
            <table className="mt-1 w-full text-xs">
              <tbody>
                {(dis.expenses?.byCategory || []).length === 0 ? (
                  <tr><td className="py-1 text-slate-400">No expense disbursements in this period.</td></tr>
                ) : dis.expenses.byCategory.map((e) => (
                  <tr key={e.category} className="border-t border-slate-100">
                    <td className="py-1 text-slate-600">{e.category} <span className="text-slate-400">({e.count})</span></td>
                    <td className="py-1 text-right font-mono">{peso(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail sections */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Collections (period)">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="py-1.5">Water — cash</td><td className="py-1.5 text-right font-mono">{peso(c.waterCash)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Water — online</td><td className="py-1.5 text-right font-mono">{peso(c.waterOnline)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Loan — cash</td><td className="py-1.5 text-right font-mono">{peso(c.loanCash)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Loan — online</td><td className="py-1.5 text-right font-mono">{peso(c.loanOnline)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Product sales</td><td className="py-1.5 text-right font-mono">{peso(c.productCashSale)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Product loan revenue</td><td className="py-1.5 text-right font-mono">{peso(c.productLoanRevenue)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Savings deposits</td><td className="py-1.5 text-right font-mono">{peso(c.savingsIn)}</td></tr>
              <tr><td className="py-1.5">Savings withdrawals</td><td className="py-1.5 text-right font-mono text-rose-700">−{peso(c.savingsOut)}</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="Loans (period)">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="py-1.5">Loans released</td><td className="py-1.5 text-right font-mono">{ln.released ?? 0}</td></tr>
              <tr className="border-b"><td className="py-1.5">Capital</td><td className="py-1.5 text-right font-mono">{peso(ln.capital)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Interest</td><td className="py-1.5 text-right font-mono">{peso(ln.interest)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Deductions</td><td className="py-1.5 text-right font-mono">{peso(ln.deductions)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Paid</td><td className="py-1.5 text-right font-mono text-emerald-700">{peso(ln.paid)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Unpaid (on these)</td><td className="py-1.5 text-right font-mono text-rose-700">{peso(ln.unpaid)}</td></tr>
              <tr><td className="py-1.5">Outstanding now (all loans)</td><td className="py-1.5 text-right font-mono font-bold">{peso(ln.outstandingNow)}</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="Product Inventory (live)">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="py-1.5">Catalog items</td><td className="py-1.5 text-right font-mono">{inv.catalogItems ?? 0}</td></tr>
              <tr className="border-b"><td className="py-1.5">Stock units remaining</td><td className="py-1.5 text-right font-mono">{inv.stockUnits ?? 0}</td></tr>
              <tr className="border-b"><td className="py-1.5">Capital tied in unsold stock</td><td className="py-1.5 text-right font-mono text-blue-700">{peso(inv.capitalUnsold)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Retail value unsold</td><td className="py-1.5 text-right font-mono">{peso(inv.retailUnsold)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Potential profit unsold</td><td className="py-1.5 text-right font-mono text-emerald-700">{peso(inv.profitPotential)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Sold as SALE (period)</td><td className="py-1.5 text-right font-mono">{peso(inv.sold?.sale?.revenue)} ({inv.sold?.sale?.count ?? 0})</td></tr>
              <tr className="border-b"><td className="py-1.5">Sold as LOAN (period)</td><td className="py-1.5 text-right font-mono">{peso(inv.sold?.loan?.revenue)} ({inv.sold?.loan?.count ?? 0})</td></tr>
              <tr><td className="py-1.5">Product paid / unpaid</td><td className="py-1.5 text-right font-mono">{peso(inv.paid)} / <span className="text-rose-700">{peso(inv.unpaid)}</span></td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="Treasury, CBU & Savings (balances now)">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="py-1.5">Cash Vault</td><td className="py-1.5 text-right font-mono">{peso(tr.vaultBalance)}</td></tr>
              {(tr.bankAccounts || []).map((b) => (
                <tr key={b._id || b.accountNumber} className="border-b"><td className="py-1.5">{b.bankName} ····{String(b.accountNumber).slice(-4)}</td><td className="py-1.5 text-right font-mono">{peso(b.balance)}</td></tr>
              ))}
              <tr className="border-b"><td className="py-1.5 font-bold">Bank total</td><td className="py-1.5 text-right font-mono font-bold">{peso(tr.bankTotal)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Expenses — cash</td><td className="py-1.5 text-right font-mono text-rose-700">−{peso(ex.cash)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Expenses — bank/cheque</td><td className="py-1.5 text-right font-mono text-rose-700">−{peso(ex.bank)}</td></tr>
              <tr className="border-b"><td className="py-1.5">Total CBU on file</td><td className="py-1.5 text-right font-mono">{peso(data?.cbu?.total)} ({data?.cbu?.members ?? 0})</td></tr>
              <tr><td className="py-1.5">Total savings on file</td><td className="py-1.5 text-right font-mono">{peso(data?.savings?.total)} ({data?.savings?.accounts ?? 0})</td></tr>
            </tbody>
          </table>
        </Section>
      </div>

      <Modal open={signOpen} title="Sign Audit Report" onClose={() => setSignOpen(false)}>
        <div className="space-y-3">
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
            Signing freezes the figures above for <b>{from || "…"} → {to || "…"}</b> into a permanent record under your name. It does not change any data.
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Report label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. June 2026 Audit" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Findings / remarks (optional)</label>
            <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} placeholder="Observations, discrepancies, recommendations…" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setSignOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={sign} disabled={signing} className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
              {signing ? "Signing…" : "Sign & Archive"}
            </button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
