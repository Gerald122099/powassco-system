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

import { useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Wrench, Play, CheckCircle2, AlertCircle, Receipt } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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
    </div>
  );
}
