// Public "Check Balance" — member enters Account Number + 4-digit PIN
// and sees their savings balance, CBU (Share Capital) balance, and
// recent debit/credit history for both. PIN is bcrypt-compared on
// the server; failure returns the same generic error as
// account-not-found to prevent enumeration.

import { useState } from "react";
import Navbar from "../../components/Navbar";
import { apiFetch } from "../../lib/api";
import { PiggyBank, Wallet, KeyRound, RefreshCw } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function CheckBalancePage() {
  const [pnNo, setPnNo] = useState("");
  const [pin, setPin] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function check(e) {
    e?.preventDefault?.();
    setErr(""); setBusy(true); setData(null);
    try {
      const res = await apiFetch("/public/savings-inquiry", {
        method: "POST",
        body: { pnNo: pnNo.trim().toUpperCase(), pin: pin.trim() },
      });
      setData(res);
    } catch (e2) {
      setErr(e2.message || "Inquiry failed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setData(null); setErr(""); setPin("");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="mx-auto max-w-4xl px-5 pt-24 pb-12">
        <div className="mb-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-100 text-pink-700 shadow-sm">
            <PiggyBank size={28} />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Check My Balance</h1>
          <p className="mt-1 text-sm text-slate-500">
            See your voluntary savings, Share Capital (CBU), and recent activity. Enter your account number and 4-digit PIN.
          </p>
        </div>

        {!data ? (
          <form onSubmit={check} className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Account Number</label>
                <input
                  value={pnNo}
                  onChange={(e) => setPnNo(e.target.value)}
                  placeholder="e.g. ABC123"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">4-digit PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-center font-mono text-2xl tracking-widest"
                  required
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  PIN is set when you open a savings account at the cooperative. If you forgot it, ask the cashier or admin to reset.
                </div>
              </div>
              {err && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
              )}
              <button
                disabled={busy || !pnNo.trim() || pin.length !== 4}
                className="w-full rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-pink-700 disabled:opacity-50"
              >
                <KeyRound size={14} className="-mt-0.5 mr-1 inline" /> {busy ? "Checking…" : "Check Balance"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Account</div>
                <div className="font-bold text-slate-900">{data.account.accountName}</div>
                <div className="font-mono text-xs text-slate-500">{data.account.pnNo}</div>
              </div>
              <button onClick={reset} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
                <RefreshCw size={12} /> Check another
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4">
                <div className="flex items-center gap-2 text-pink-800">
                  <PiggyBank size={18} /> <span className="text-sm font-bold">Voluntary Savings</span>
                </div>
                <div className="mt-2 font-mono text-2xl font-extrabold text-pink-900">{peso(data.account.balance)}</div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center gap-2 text-blue-800">
                  <Wallet size={18} /> <span className="text-sm font-bold">Share Capital (CBU)</span>
                </div>
                <div className="mt-2 font-mono text-2xl font-extrabold text-blue-900">{peso(data.cbu.balance)}</div>
              </div>
            </div>

            <Section title="Savings — recent activity" rows={data.savingsLedger || []} kind="savings" />
            <Section title="Share Capital (CBU) — recent activity" rows={data.cbuLedger || []} kind="cbu" />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, rows, kind }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">{title}</div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">No activity yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white text-left text-[10px] text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">OR / Ref</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const isCredit = kind === "savings"
                  ? t.type === "deposit"
                  : t.type === "credit";
                return (
                  <tr key={t._id || i} className="border-t">
                    <td className="px-3 py-1.5">{fmtDate(t.paidAt || t.createdAt)}</td>
                    <td className="px-3 py-1.5 font-mono">{t.orNo || t.refOrNo || "—"}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isCredit ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {isCredit ? "CREDIT (+)" : "DEBIT (−)"}
                      </span>
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono font-bold ${isCredit ? "text-emerald-700" : "text-amber-700"}`}>
                      {isCredit ? "+" : "−"}{peso(t.amount)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{peso(t.balanceAfter)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
