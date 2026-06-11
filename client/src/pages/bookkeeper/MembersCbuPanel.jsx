// Bookkeeper "Members" tab. Unified per-account view: search by
// account number or name, see CBU balance + every receivable (AR
// Water, AR Loan, AR Product Loan) on one row. Click any row to
// drill into the full breakdown — unpaid bills, outstanding loans,
// outstanding product loans, and the CBU ledger.
//
// This is the one screen the bookkeeper opens when they need to see
// the cooperative's exposure on a specific account, mirroring the
// columns of the cash disbursement transaction sheet they used to
// maintain on paper.

import { useEffect, useState, useCallback } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Wallet, Search, RefreshCw, Droplets, Banknote, Package, AlertCircle } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const fmtDateOnly = (d) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—");

function TotalsStrip({ totals, count }) {
  if (!totals) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Accounts shown</div>
        <div className="mt-0.5 font-mono text-base font-bold text-slate-800">{count}</div>
      </div>
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-2 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-blue-700">CBU on file</div>
        <div className="mt-0.5 font-mono text-base font-bold text-blue-800">{peso(totals.cbu)}</div>
      </div>
      <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-2 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-cyan-700">AR Water</div>
        <div className="mt-0.5 font-mono text-base font-bold text-cyan-800">{peso(totals.arWater)}</div>
      </div>
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-2 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-violet-700">AR Loan</div>
        <div className="mt-0.5 font-mono text-base font-bold text-violet-800">{peso(totals.arLoan)}</div>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-amber-700">Total receivable</div>
        <div className="mt-0.5 font-mono text-base font-bold text-amber-800">{peso(totals.totalReceivable)}</div>
      </div>
    </div>
  );
}

function DetailSection({ icon: Icon, color, title, count, total, children, emptyText }) {
  return (
    <div className="rounded-2xl border border-slate-200">
      <div className={`flex items-center justify-between rounded-t-2xl px-4 py-2 bg-${color}-50 text-${color}-800`}>
        <div className="flex items-center gap-2 text-sm font-bold">
          <Icon size={16} /> {title}{count > 0 && <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px]">{count}</span>}
        </div>
        <div className="font-mono text-sm font-bold">{peso(total)}</div>
      </div>
      {count === 0 ? (
        <div className="px-4 py-4 text-center text-xs text-slate-400">{emptyText}</div>
      ) : (
        <div className="max-h-80 overflow-auto">{children}</div>
      )}
    </div>
  );
}

export default function MembersCbuPanel() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openMember, setOpenMember] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      setData(await apiFetch(`/bookkeeper/members-cbu${params}`, { token }));
    } catch {/* ignore */} finally { setBusy(false); }
  }, [q, token]);
  useEffect(() => { load(); }, [load]);

  async function openDetail(m) {
    setOpenMember(m);
    setDetail(null);
    try {
      setDetail(await apiFetch(`/bookkeeper/members-cbu/${m.pnNo}`, { token }));
    } catch {/* ignore */}
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Wallet size={20} className="text-blue-600" /> Members & Receivables
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Search an account to see CBU + every outstanding receivable in one row. Click a row for the full per-account ledger.
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Account No. or name"
              className="rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm w-72"
            />
          </div>
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </form>
      </div>

      <TotalsStrip totals={data?.totals} count={data?.count || 0} />

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Account No.</th>
                <th className="px-3 py-2">Account name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">CBU</th>
                <th className="px-3 py-2 text-right">AR Water</th>
                <th className="px-3 py-2 text-right">AR Loan</th>
                <th className="px-3 py-2 text-right">AR Product</th>
                <th className="px-3 py-2 text-right">Total receivable</th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr><td colSpan={8} className="py-10 text-center text-slate-500">Loading…</td></tr>
              ) : data.members.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-slate-500">No accounts match.</td></tr>
              ) : (
                data.members.map((m) => {
                  const hasReceivable = m.totalReceivable > 0;
                  return (
                    <tr
                      key={m.pnNo}
                      onClick={() => openDetail(m)}
                      className={`border-t cursor-pointer hover:bg-slate-50/70 ${hasReceivable ? "" : "text-slate-500"}`}
                    >
                      <td className="px-3 py-2 font-mono">{m.pnNo}</td>
                      <td className="px-3 py-2 font-semibold">{m.accountName}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${m.accountStatus === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                          {m.accountStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-blue-700">{peso(m.cbuBalance)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${m.arWater > 0 ? "text-cyan-700 font-bold" : "text-slate-400"}`}>
                        {peso(m.arWater)}{m.arWaterCount > 0 && <span className="ml-1 text-[10px] text-slate-500">({m.arWaterCount})</span>}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${m.arLoan > 0 ? "text-violet-700 font-bold" : "text-slate-400"}`}>
                        {peso(m.arLoan)}{m.arLoanCount > 0 && <span className="ml-1 text-[10px] text-slate-500">({m.arLoanCount})</span>}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${m.arProduct > 0 ? "text-orange-700 font-bold" : "text-slate-400"}`}>
                        {peso(m.arProduct)}{m.arProductCount > 0 && <span className="ml-1 text-[10px] text-slate-500">({m.arProductCount})</span>}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${hasReceivable ? "text-amber-700" : "text-slate-400"}`}>
                        {peso(m.totalReceivable)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!openMember}
        title={openMember ? openMember.accountName : ""}
        subtitle={openMember ? `${openMember.pnNo} • CBU ${peso(openMember.cbuBalance)} • Receivable ${peso(openMember.totalReceivable)}` : ""}
        onClose={() => { setOpenMember(null); setDetail(null); }}
        size="xl"
      >
        {!detail ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading ledger…</div>
        ) : (
          <div className="space-y-3">
            {/* AR Water */}
            <DetailSection
              icon={Droplets}
              color="cyan"
              title="Unpaid water bills"
              count={detail.waterBills.length}
              total={detail.waterBills.reduce((s, b) => s + Number(b.totalDue || 0), 0)}
              emptyText="No unpaid water bills."
            >
              <table className="w-full text-xs">
                <thead className="bg-white text-left text-[10px] text-slate-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5">Period</th>
                    <th className="px-3 py-1.5">Meter</th>
                    <th className="px-3 py-1.5 text-right">m³</th>
                    <th className="px-3 py-1.5">Status</th>
                    <th className="px-3 py-1.5">Due date</th>
                    <th className="px-3 py-1.5 text-right">Penalty</th>
                    <th className="px-3 py-1.5 text-right">Total due</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.waterBills.map((b) => (
                    <tr key={b._id} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{b.periodKey}</td>
                      <td className="px-3 py-1.5 font-mono">{b.meterNumber}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{b.consumption}</td>
                      <td className="px-3 py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${b.status === "overdue" ? "bg-red-100 text-red-700" : b.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">{fmtDateOnly(b.dueDate)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-red-600">{Number(b.penaltyAmount) > 0 ? peso(b.penaltyAmount) : "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-cyan-800">{peso(b.totalDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DetailSection>

            {/* AR Loan */}
            <DetailSection
              icon={Banknote}
              color="violet"
              title="Outstanding loans"
              count={detail.loans.length}
              total={detail.loans.reduce((s, l) => s + Number(l.balance || 0), 0)}
              emptyText="No outstanding loans."
            >
              <table className="w-full text-xs">
                <thead className="bg-white text-left text-[10px] text-slate-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5">Loan ID</th>
                    <th className="px-3 py-1.5 text-right">Principal</th>
                    <th className="px-3 py-1.5 text-right">Total payable</th>
                    <th className="px-3 py-1.5 text-right">Monthly</th>
                    <th className="px-3 py-1.5">Term</th>
                    <th className="px-3 py-1.5">Released</th>
                    <th className="px-3 py-1.5">Matures</th>
                    <th className="px-3 py-1.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.loans.map((l) => (
                    <tr key={l._id} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{l.loanId}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{peso(l.principal)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{peso(l.totalPayment)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{peso(l.monthlyPayment)}</td>
                      <td className="px-3 py-1.5">{l.termMonths}m</td>
                      <td className="px-3 py-1.5">{fmtDateOnly(l.releasedAt)}</td>
                      <td className="px-3 py-1.5">{fmtDateOnly(l.maturityDate)}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-violet-800">{peso(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DetailSection>

            {/* AR Product */}
            <DetailSection
              icon={Package}
              color="orange"
              title="Product loans / rentals outstanding"
              count={detail.productLoans.length}
              total={detail.productLoans.reduce((s, p) => s + Number(p.balance || 0), 0)}
              emptyText="No outstanding product loans or rentals."
            >
              <table className="w-full text-xs">
                <thead className="bg-white text-left text-[10px] text-slate-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5">Product</th>
                    <th className="px-3 py-1.5">Category</th>
                    <th className="px-3 py-1.5">Type</th>
                    <th className="px-3 py-1.5">Due / return</th>
                    <th className="px-3 py-1.5 text-right">Principal</th>
                    <th className="px-3 py-1.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.productLoans.map((p) => (
                    <tr key={p._id} className="border-t">
                      <td className="px-3 py-1.5 font-semibold">{p.productName}</td>
                      <td className="px-3 py-1.5 text-slate-500">{p.category}</td>
                      <td className="px-3 py-1.5">{p.transactionType}</td>
                      <td className="px-3 py-1.5">{fmtDateOnly(p.returnDate || p.dueDate)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{peso(p.principal)}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-orange-800">{peso(p.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DetailSection>

            {/* CBU ledger */}
            <DetailSection
              icon={Wallet}
              color="blue"
              title="CBU ledger"
              count={detail.ledger.length}
              total={openMember?.cbuBalance || 0}
              emptyText="No CBU activity yet."
            >
              <table className="w-full text-xs">
                <thead className="bg-white text-left text-[10px] text-slate-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5">When</th>
                    <th className="px-3 py-1.5">Type</th>
                    <th className="px-3 py-1.5">Source</th>
                    <th className="px-3 py-1.5">OR / ref</th>
                    <th className="px-3 py-1.5 text-right">Amount</th>
                    <th className="px-3 py-1.5 text-right">Balance after</th>
                    <th className="px-3 py-1.5">By</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.ledger.map((e) => (
                    <tr key={e._id} className="border-t">
                      <td className="px-3 py-1.5">{fmtDate(e.createdAt)}</td>
                      <td className="px-3 py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${e.type === "credit" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {e.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">{e.source}</td>
                      <td className="px-3 py-1.5 font-mono">{e.refOrNo || "—"}</td>
                      <td className={`px-3 py-1.5 text-right font-bold ${e.type === "credit" ? "text-emerald-700" : "text-amber-700"}`}>
                        {e.type === "credit" ? "+" : "−"}{peso(e.amount)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{peso(e.balanceAfter)}</td>
                      <td className="px-3 py-1.5">{e.postedBy || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DetailSection>

            {openMember && openMember.totalReceivable > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2">
                <AlertCircle size={14} />
                Total outstanding receivable across all modules:&nbsp;
                <b className="font-mono text-sm">{peso(openMember.totalReceivable)}</b>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
