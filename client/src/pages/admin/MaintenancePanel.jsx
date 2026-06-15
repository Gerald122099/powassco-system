// Admin-only Maintenance panel. Hosts one-shot data fixes for state
// that drifted before a code change landed and needs to be reconciled.
//
// Each action is a separate "card" with a Dry-run / Apply two-step:
//   1. Regenerate loan amortization — fixes centavo-drift on schedules
//      that predate the whole-peso amortization fix (commit 5cc9225).
//   2. Rebuild charges breakdown — replaces the single-line
//      "Deductions (legacy)" entry on imported loans with the standard
//      6-line cooperative breakdown (₱620), adding an "Other loan
//      deductions" line if the actual deduction exceeded ₱620.

import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Wrench, Play, CheckCircle2, AlertCircle, Receipt, Upload, Droplets, FileSpreadsheet } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const peso2 = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ActionCard({
  title,
  icon: Icon,
  iconClass,
  description,
  warnText,
  endpoint,
  confirmPhrase,
  applyConfirmMsg,
  renderTable,
}) {
  const { token } = useAuth();
  const [all, setAll] = useState(false);
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);

  async function call(dry) {
    if (!dry && !window.confirm(
      applyConfirmMsg(result?.changes?.length || 0)
    )) return;
    setWorking(true);
    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        token,
        body: { confirm: confirmPhrase, all, dry },
      });
      setResult(res);
      toast.success(
        dry
          ? `Dry run: ${res.changes.length} loan(s) would change.`
          : `Updated ${res.updated} loan(s).`
      );
    } catch (e) {
      toast.error(e.message);
    } finally {
      setWorking(false);
    }
  }

  const changes = result?.changes || [];
  const isDry = result?.mode?.dry !== false;

  return (
    <Card>
      <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
        <Icon size={20} className={iconClass} /> {title}
      </div>
      <div className="mt-0.5 text-sm text-slate-600">{description}</div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div>
          <b>Always dry-run first.</b> {warnText}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span>Widen scan to every released loan (not just imported)</span>
        </label>
        <div className="flex-1" />
        <button
          onClick={() => call(true)}
          disabled={working}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          <Play size={14} /> Dry run
        </button>
        <button
          onClick={() => call(false)}
          disabled={working || !result || changes.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          title={!result ? "Dry-run first" : changes.length === 0 ? "Nothing to write" : ""}
        >
          <CheckCircle2 size={14} /> Apply ({changes.length})
        </button>
      </div>

      {result && (
        <div className="mt-4 rounded-2xl border border-slate-200">
          <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>
              {isDry ? "Dry run" : "Applied"} — scanned <b>{result.scanned}</b>, drifted <b>{changes.length}</b>
              {!isDry && <>, updated <b>{result.updated}</b></>}, skipped <b>{result.skipped}</b>
            </span>
            {!isDry && changes.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                WROTE
              </span>
            )}
          </div>
          {changes.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              Nothing to do — every scanned loan already matches.
            </div>
          ) : (
            renderTable(changes)
          )}
        </div>
      )}
    </Card>
  );
}

function AmortizationTable({ changes }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-white text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2">Loan ID</th>
            <th className="px-3 py-2">Borrower</th>
            <th className="px-3 py-2 text-right">Principal</th>
            <th className="px-3 py-2 text-right">Term</th>
            <th className="px-3 py-2 text-right">Monthly: before → after</th>
            <th className="px-3 py-2 text-right">Total: before → after</th>
            <th className="px-3 py-2 text-right">Balance: before → after</th>
            <th className="px-3 py-2 text-right">Paid</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => {
            const monthlyMoved = c.monthlyBefore !== c.monthlyAfter;
            const totalMoved = c.totalBefore !== c.totalAfter;
            const balanceMoved = c.balanceBefore !== c.balanceAfter;
            return (
              <tr key={c.loanId} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{c.loanId}</td>
                <td className="px-3 py-2">{c.borrower}</td>
                <td className="px-3 py-2 text-right font-mono">{peso(c.principal)}</td>
                <td className="px-3 py-2 text-right font-mono">{c.term}m</td>
                <td className={`px-3 py-2 text-right font-mono ${monthlyMoved ? "text-amber-700" : ""}`}>
                  {peso(c.monthlyBefore)} → <b>{peso(c.monthlyAfter)}</b>
                </td>
                <td className={`px-3 py-2 text-right font-mono ${totalMoved ? "text-amber-700" : ""}`}>
                  {peso(c.totalBefore)} → <b>{peso(c.totalAfter)}</b>
                </td>
                <td className={`px-3 py-2 text-right font-mono ${balanceMoved ? "text-amber-700" : ""}`}>
                  {peso(c.balanceBefore)} → <b>{peso(c.balanceAfter)}</b>
                </td>
                <td className="px-3 py-2 text-right font-mono text-emerald-700">{peso(c.totalPaid)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChargesTable({ changes }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-white text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2">Loan ID</th>
            <th className="px-3 py-2">Borrower</th>
            <th className="px-3 py-2 text-right">Principal</th>
            <th className="px-3 py-2 text-right">Total charges</th>
            <th className="px-3 py-2 text-right">Standard</th>
            <th className="px-3 py-2 text-right">Excess (Other)</th>
            <th className="px-3 py-2 text-right">New lines</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.loanId} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">{c.loanId}</td>
              <td className="px-3 py-2">{c.borrower}</td>
              <td className="px-3 py-2 text-right font-mono">{peso(c.principal)}</td>
              <td className="px-3 py-2 text-right font-mono">{peso(c.totalCharges)}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-500">{peso(c.standardTotal)}</td>
              <td className={`px-3 py-2 text-right font-mono ${c.excess > 0 ? "text-amber-700" : "text-slate-400"}`}>
                {c.excess > 0 ? peso(c.excess) : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono">{c.newLines}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MaintenancePanel() {
  return (
    <div className="space-y-4">
      <ActionCard
        title="Maintenance — Loan Amortization Regen"
        icon={Wrench}
        iconClass="text-amber-600"
        description="The Jan-2026 paper-ledger import was created before the whole-peso amortization fix, so those imported loans have schedules with centavo drift. Run this once per environment to rebuild the schedules from the loans' principal / rate / term, preserving original due dates and any paid installments."
        warnText="The dry run reports which loans drift and what the new monthly / total / balance values will be. Only the second click actually writes."
        endpoint="/admin/maintenance/regen-loan-amortization"
        confirmPhrase="REGEN AMORT"
        applyConfirmMsg={(n) => `This rewrites amortizationSchedule on ${n} loan(s). The original due dates and recorded payments are preserved. Proceed?`}
        renderTable={(changes) => <AmortizationTable changes={changes} />}
      />

      <ActionCard
        title="Maintenance — Rebuild Charges Breakdown"
        icon={Receipt}
        iconClass="text-blue-600"
        description="The legacy paper-ledger import stored deductions as a single 'Deductions (legacy)' line because the paper sheet didn't keep a per-item breakdown. This rewrites that line into the cooperative's standard 6-item breakdown (Service Fee ₱100 + Capital Build-up ₱100 + Filing Fee ₱100 + Collateral Risk Fund ₱100 + Notarial Fee ₱200 + Processing Fee ₱20 = ₱620). Loans with deductions ABOVE ₱620 also get an 'Other loan deductions' line for the excess. Loans BELOW ₱620 are left alone."
        warnText="Loans whose current breakdown is already multi-line are skipped (idempotent). Only loans still on the single 'Deductions (legacy)' line are rewritten."
        endpoint="/admin/maintenance/rebuild-loan-charges"
        confirmPhrase="REBUILD CHARGES"
        applyConfirmMsg={(n) => `This rewrites the charges[] breakdown on ${n} imported loan(s). The total deduction amount is preserved — only how it's itemized changes. Proceed?`}
        renderTable={(changes) => <ChargesTable changes={changes} />}
      />

      <LegacyLoanImportCard />

      <RecomputeWaterBillsCard />

      <LegacyWaterImportCard />
    </div>
  );
}

// Import legacy water bills + payments from the embedded LoocSur ledger.
// Dry-run shows matched/unmatched accounts and per-account paid/unpaid +
// outstanding vs the ledger receivable (reconcile flags). Apply inserts
// (idempotent on existing pn/period/meter bills).
function LegacyWaterImportCard() {
  const { token } = useAuth();
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);

  async function call(dry) {
    if (!dry && !window.confirm(
      `Insert legacy water bills + payments for ${result?.matched || 0} matched account(s). Unmatched names are skipped. Re-running is safe (existing bills are not duplicated). Proceed?`
    )) return;
    setWorking(true);
    try {
      const res = await apiFetch("/admin/maintenance/import-legacy-water", {
        method: "POST", token, body: { confirm: "IMPORT LEGACY WATER", dry },
      });
      setResult(res);
      toast.success(dry
        ? `Dry run: ${res.matched}/${res.accounts} matched, ${res.unmatched.length} unmatched, ${res.reconcileFlags.length} to review.`
        : `Inserted ${res.billsInserted} bill(s) + ${res.paymentsInserted} payment(s).`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setWorking(false);
    }
  }

  const isDry = result?.dry !== false;

  return (
    <Card>
      <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
        <FileSpreadsheet size={20} className="text-emerald-600" /> Maintenance — Import Legacy Water Bills (LoocSur)
      </div>
      <div className="mt-0.5 text-sm text-slate-600">
        Imports the LoocSur ledger (Jan–May 2026 readings, bills, and payments) into existing accounts,
        matched by name. Each account gets an opening-balance bill (Dec 2025) + monthly bills using the
        ledger's recorded amounts; paid bills get their OR# + date, unpaid bills become the current dues.
        Tariff is stamped per period (₱74 ≤ Mar, ₱135 ≥ Apr).
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div>
          <b>Always dry-run first.</b> The dry run shows which names matched, the meter assigned, and each
          account's computed outstanding vs the ledger receivable (mismatches are flagged for review).
          Unmatched names need a name→account override before they import. Only <b>Apply</b> writes;
          re-running never duplicates.
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex-1" />
        <button onClick={() => call(true)} disabled={working}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          <Play size={14} /> Dry run
        </button>
        <button onClick={() => call(false)} disabled={working || !result || result.matched === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          title={!result ? "Dry-run first" : ""}>
          <CheckCircle2 size={14} /> Apply ({result?.matched || 0})
        </button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">
            {isDry ? "Dry run" : "Applied"} — accounts <b>{result.accounts}</b>, matched <b>{result.matched}</b>,
            unmatched <b className={result.unmatched.length ? "text-red-600" : ""}>{result.unmatched.length}</b>,
            to review <b className={result.reconcileFlags.length ? "text-amber-700" : ""}>{result.reconcileFlags.length}</b>
            {!isDry && <>, inserted <b>{result.billsInserted}</b> bills + <b>{result.paymentsInserted}</b> payments (existing skipped {result.billsSkipped}, flagged deferred {result.deferredOnApply})</>}
          </div>

          {/* sample matched */}
          {result.sample?.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-white text-left text-slate-500">
                  <tr><th className="px-3 py-2">Ledger name</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">Meter</th><th className="px-3 py-2 text-right">Bills</th><th className="px-3 py-2 text-right">Paid/Unpaid</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2 text-right">Ledger</th><th className="px-3 py-2">OK</th></tr>
                </thead>
                <tbody>
                  {result.sample.map((s, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{s.name}</td>
                      <td className="px-3 py-1.5"><span className="font-mono">{s.pnNo}</span> <span className="text-slate-400">{s.accountName}</span></td>
                      <td className="px-3 py-1.5 font-mono">{s.meter}</td>
                      <td className="px-3 py-1.5 text-right">{s.bills}</td>
                      <td className="px-3 py-1.5 text-right">{s.paid}/{s.unpaid}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{peso2(s.outstanding)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500">{peso2(s.sheetReceivable)}</td>
                      <td className="px-3 py-1.5">{s.reconciles ? "✅" : <span className="text-amber-600">⚠️</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-1.5 text-[11px] text-slate-400">Showing first {result.sample.length} matched accounts.</div>
            </div>
          )}

          {/* reconcile flags */}
          {result.reconcileFlags?.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2">
              <div className="px-2 py-1 text-xs font-bold text-amber-800">To review — computed outstanding ≠ ledger receivable ({result.reconcileFlags.length})</div>
              <div className="max-h-40 overflow-auto text-xs">
                {result.reconcileFlags.map((f, i) => (
                  <div key={i} className="px-2 py-1 font-mono">{f.name} ({f.pnNo}): computed {peso2(f.computed)} vs ledger {peso2(f.sheet)} (Δ {peso2(f.diff)})</div>
                ))}
              </div>
            </div>
          )}

          {/* unmatched */}
          {result.unmatched?.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-2">
              <div className="px-2 py-1 text-xs font-bold text-red-700">Unmatched names — need a name→account override ({result.unmatched.length})</div>
              <div className="max-h-40 overflow-auto text-xs">
                {result.unmatched.map((u, i) => (
                  <div key={i} className="px-2 py-1">
                    <span className="font-semibold">{u.name}</span> <span className="text-slate-400">→ {u.target}</span>{" "}
                    <span className={u.reason === "ambiguous" ? "text-amber-700" : "text-red-600"}>[{u.reason}]</span>
                    {u.candidates?.length > 0 && <span className="text-slate-500"> candidates: {u.candidates.map((c) => `${c.accountName} (${c.pnNo})`).join("; ")}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Re-price unpaid/overdue water bills onto the CURRENT tariff. By design,
// bills keep the tariff they were created with (so tariff changes aren't
// retroactive); this is the deliberate, dry-run-first opt-out for unpaid
// bills — e.g. after raising the residential minimum.
function RecomputeWaterBillsCard() {
  const { token } = useAuth();
  const [months, setMonths] = useState("");
  const [classification, setClassification] = useState("");
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);

  async function call(dry) {
    const changeCount = result?.changes?.length || 0;
    if (!dry && !window.confirm(
      `Re-price ${changeCount} unpaid bill(s) onto the CURRENT tariff. Paid bills are never touched. This changes amounts owed. Proceed?`
    )) return;
    setWorking(true);
    try {
      const body = {
        confirm: "RECOMPUTE WATER BILLS",
        dry,
        months: months.split(",").map((s) => s.trim()).filter(Boolean),
        classification: classification || null,
      };
      const res = await apiFetch("/admin/maintenance/recompute-water-bills", { method: "POST", token, body });
      setResult(res);
      toast.success(dry
        ? `Dry run: ${res.changes.length} bill(s) would change.`
        : `Re-priced ${res.updated} bill(s).`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setWorking(false);
    }
  }

  const changes = (result?.changes || []).filter((c) => !c.error);
  const isDry = result?.mode?.dry !== false;

  return (
    <Card>
      <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
        <Droplets size={20} className="text-cyan-600" /> Maintenance — Recompute Water Bills
      </div>
      <div className="mt-0.5 text-sm text-slate-600">
        Re-prices <b>unpaid / overdue</b> water bills onto the <b>current</b> Water Settings tariff.
        Use this only when you deliberately want existing unpaid bills to follow a new tariff (e.g. after
        raising the residential minimum). Bills already matching the current tariff are left alone.
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div>
          <b>Always dry-run first.</b> Paid bills are never touched. The dry run shows each bill's
          old → new amount; only <b>Apply</b> writes. By default, bills keep the tariff they were issued
          with — this is the explicit override.
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Periods (optional, comma-separated YYYY-MM)</span>
          <input value={months} onChange={(e) => setMonths(e.target.value)} placeholder="e.g. 2026-06, 2026-07"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Classification (optional)</span>
          <select value={classification} onChange={(e) => setClassification(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
            <option value="">All</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex-1" />
        <button onClick={() => call(true)} disabled={working}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          <Play size={14} /> Dry run
        </button>
        <button onClick={() => call(false)} disabled={working || !result || changes.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-50"
          title={!result ? "Dry-run first" : changes.length === 0 ? "Nothing to write" : ""}>
          <CheckCircle2 size={14} /> Apply ({changes.length})
        </button>
      </div>

      {result && (
        <div className="mt-4 rounded-2xl border border-slate-200">
          <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>
              {isDry ? "Dry run" : "Applied"} — scanned <b>{result.scanned}</b>, changing <b>{changes.length}</b>
              {!isDry && <>, updated <b>{result.updated}</b></>}, unchanged <b>{result.unchanged}</b>
              {result.failed > 0 && <>, failed <b className="text-red-600">{result.failed}</b></>}
            </span>
            {!isDry && changes.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">WROTE</span>
            )}
          </div>
          {changes.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">Nothing to do — every unpaid bill already matches the current tariff.</div>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Meter</th>
                    <th className="px-3 py-2 text-right">m³</th>
                    <th className="px-3 py-2 text-right">Old → New</th>
                    <th className="px-3 py-2 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2"><span className="font-mono">{c.pnNo}</span> <span className="text-slate-400">{c.accountName}</span></td>
                      <td className="px-3 py-2">{c.periodKey}</td>
                      <td className="px-3 py-2 font-mono">{c.meterNumber}</td>
                      <td className="px-3 py-2 text-right">{c.consumed}</td>
                      <td className="px-3 py-2 text-right font-mono">{peso2(c.oldAmount)} → {peso2(c.newAmount)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${c.delta >= 0 ? "text-amber-700" : "text-emerald-700"}`}>
                        {c.delta >= 0 ? "+" : ""}{peso2(c.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Legacy loan import — embedded monthly batches (Jan–May 2026) from the
// paper "Summary of Loan Released" sheets. Dry-run shows per-row name
// resolution + net proceeds; apply inserts (idempotent).
function LegacyLoanImportCard() {
  const { token } = useAuth();
  const [batches, setBatches] = useState({});
  const [picked, setPicked] = useState({});
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    apiFetch("/admin/maintenance/legacy-loans/batches", { token })
      .then((b) => { setBatches(b); setPicked(Object.fromEntries(Object.keys(b).map((k) => [k, true]))); })
      .catch(() => {});
  }, [token]);

  const months = Object.keys(batches);
  const selected = months.filter((m) => picked[m]);

  async function run(dry) {
    if (!selected.length) { toast.error("Pick at least one month."); return; }
    if (!dry && !window.confirm(`Insert ${result?.willInsert?.filter((r) => r.status === "would insert").length || "the matched"} loan(s) into THIS environment's database? Idempotent — re-running skips existing.`)) return;
    setWorking(true);
    try {
      const res = await apiFetch("/admin/maintenance/import-legacy-loans", {
        method: "POST", token,
        body: { confirm: "IMPORT LEGACY LOANS", months: selected, dry },
      });
      setResult(res);
      const ins = res.willInsert.filter((r) => r.status === (dry ? "would insert" : "inserted")).length;
      toast.success(dry ? `Dry run: ${ins} would insert, ${res.skipped} already exist, ${res.failed.length} unmatched.` : `Inserted ${res.inserted}; ${res.skipped} skipped; ${res.failed.length} unmatched.`);
    } catch (e) { toast.error(e.message || e.error || "Import failed."); }
    finally { setWorking(false); }
  }

  const totalRows = selected.reduce((s, m) => s + (batches[m] || 0), 0);

  return (
    <Card>
      <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
        <Upload size={20} className="text-violet-600" /> Import Legacy Loans (paper ledger)
      </div>
      <div className="mt-0.5 text-sm text-slate-600">
        Inserts the transcribed monthly "Summary of Loan Released" batches, matching each name to its account
        and computing net proceeds (principal − deduction). Auto-assigns loan IDs. Idempotent — re-running skips
        loans already present.
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div>
          <b>Dry-run first, and verify the totals against your sheet.</b> These rows were transcribed from
          screenshots — the dry run lists every row's matched account (or <b>NOT FOUND / ambiguous</b>) and its
          net proceeds. Confirm each month's total matches the paper sheet before applying. Unmatched names need
          an account-number override (send me the dry-run's unmatched list).
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {months.map((m) => (
          <label key={m} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${picked[m] ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>
            <input type="checkbox" checked={!!picked[m]} onChange={(e) => setPicked((p) => ({ ...p, [m]: e.target.checked }))} />
            {m} <span className="text-slate-400">({batches[m]})</span>
          </label>
        ))}
        <div className="flex-1" />
        <button onClick={() => run(true)} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          <Play size={14} /> Dry run ({totalRows})
        </button>
        <button onClick={() => run(false)} disabled={working || !result} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50" title={!result ? "Dry-run first" : ""}>
          <CheckCircle2 size={14} /> Apply
        </button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">
            {result.dry ? "Dry run" : "Applied"} — {result.willInsert.filter((r) => r.status !== "already exists").length} to insert · {result.skipped} already exist · <span className={result.failed.length ? "text-rose-700" : ""}>{result.failed.length} unmatched</span>
          </div>

          {result.failed.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-rose-200">
              <div className="bg-rose-50 px-4 py-2 text-xs font-bold text-rose-800">Unmatched names — need an account override before they import</div>
              <table className="w-full text-xs">
                <thead className="bg-white text-left text-[10px] text-slate-500"><tr><th className="px-3 py-2">Month</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2">Candidates</th></tr></thead>
                <tbody>
                  {result.failed.map((f, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5">{f.month}</td>
                      <td className="px-3 py-1.5 font-semibold">{f.name}</td>
                      <td className="px-3 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${f.reason === "ambiguous" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700"}`}>{f.reason === "ambiguous" ? "AMBIGUOUS" : "NOT FOUND"}</span></td>
                      <td className="px-3 py-1.5 text-right font-mono">{peso2(f.net)}</td>
                      <td className="px-3 py-1.5 text-[10px] text-slate-500">{(f.candidates || []).map((c) => `${c.pnNo}=${c.accountName}`).join("; ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="max-h-[55vh] overflow-auto rounded-2xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-[10px] text-slate-500 sticky top-0"><tr><th className="px-3 py-2">Month</th><th className="px-3 py-2">Released</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Account</th><th className="px-3 py-2 text-right">Principal</th><th className="px-3 py-2 text-right">Deduction</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody>
                {result.willInsert.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5">{r.month}</td>
                    <td className="px-3 py-1.5">{r.releasedOn}</td>
                    <td className="px-3 py-1.5 font-semibold">{r.name}</td>
                    <td className="px-3 py-1.5"><span className="font-mono">{r.account}</span> <span className="text-slate-400">{r.accountName}</span></td>
                    <td className="px-3 py-1.5 text-right font-mono">{peso2(r.principal)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-amber-700">{peso2(r.deduction)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700">{peso2(r.net)}</td>
                    <td className="px-3 py-1.5">{r.status === "already exists" ? <span className="text-slate-400">exists</span> : r.status === "inserted" ? <span className="text-emerald-700 font-bold">inserted</span> : <span className="text-violet-700">will insert</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
