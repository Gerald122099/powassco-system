// Loan collections by period — today / week / month / year / custom
// calendar range. Shows the totals the operator asked for: capital,
// interest, deductions, total loans, paid vs unpaid, collections.
// Shared by the Loan System, Bookkeeper, and Manager dashboards.

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import { useAuth } from "../context/AuthContext";
import { Banknote, RefreshCw, Calendar } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This week" },
  { key: "thisMonth", label: "This month" },
  { key: "thisYear", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function rangeFor(key) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (key === "today") return { from: ymd(now), to: ymd(now) };
  if (key === "thisWeek") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const start = new Date(now); start.setDate(now.getDate() - day);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  if (key === "thisMonth") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  if (key === "thisYear") return { from: ymd(new Date(now.getFullYear(), 0, 1)), to: ymd(new Date(now.getFullYear(), 11, 31)) };
  return { from: "", to: "" };
}

function Tile({ label, value, sub, tone = "slate" }) {
  const cls = {
    slate: "border-slate-200 bg-slate-50 text-slate-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 font-mono text-lg font-extrabold">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] opacity-70">{sub}</div>}
    </div>
  );
}

export default function LoanCollectionsPanel() {
  const { token } = useAuth();
  const [preset, setPreset] = useState("thisMonth");
  const [from, setFrom] = useState(() => rangeFor("thisMonth").from);
  const [to, setTo] = useState(() => rangeFor("thisMonth").to);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      setData(await apiFetch(`/loan/collections-summary${qs.toString() ? `?${qs}` : ""}`, { token }));
    } catch { /* ignore */ } finally { setBusy(false); }
  }, [token, from, to]);
  useEffect(() => { load(); }, [load]);
  useRealtime(["payments", "loans"], load);

  function pick(k) {
    setPreset(k);
    if (k !== "custom") {
      const r = rangeFor(k);
      setFrom(r.from); setTo(r.to);
    }
  }

  const L = data?.loans || {};
  const P = data?.payments || {};
  const O = data?.outstandingNow || {};

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Banknote size={20} className="text-blue-600" /> Loan Collections by Period
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Loans released and payments collected in the selected range. Outstanding is always as of today.
          </div>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1 text-slate-500"><Calendar size={12} /> Range:</span>
        <div className="inline-flex rounded-xl border border-slate-200 p-1">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => pick(p.key)}
              className={`rounded-lg px-3 py-1 font-semibold ${preset === p.key ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="rounded-xl border border-slate-200 px-2 py-1" />
        <span className="text-slate-400">to</span>
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="rounded-xl border border-slate-200 px-2 py-1" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Total loans released" value={L.count ?? "—"} sub={`payable ${peso(L.totalPayable)}`} tone="blue" />
        <Tile label="Total capital" value={peso(L.totalCapital)} tone="blue" />
        <Tile label="Total interest" value={peso(L.totalInterest)} tone="violet" />
        <Tile label="Total loan deductions" value={peso(L.totalDeductions)} sub="charges off net proceeds" tone="amber" />
        <Tile label="Collections in range" value={peso(P.collected)} sub={`${P.count ?? 0} payment(s) · CBU excess ${peso(P.cbuExcess)}`} tone="emerald" />
        <Tile label="Paid (on range's loans)" value={peso(L.totalPaid)} tone="emerald" />
        <Tile label="Unpaid (on range's loans)" value={peso(L.totalUnpaid)} tone="rose" />
        <Tile label="Outstanding today (all)" value={peso(O.balance)} sub={`${O.count ?? 0} open loan(s)`} tone="rose" />
      </div>
    </Card>
  );
}
