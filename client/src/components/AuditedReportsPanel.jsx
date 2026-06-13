// Archived audit reports — the signed history. Each row is a frozen
// snapshot the committee signed for a period; click to view + print.

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Archive, RefreshCw, Printer, CheckCircle2 } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function AuditedReportsPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try { const r = await apiFetch("/audit-report", { token }); setItems(r.items || []); }
    catch {/* ignore */} finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  function printReport(r) {
    const s = r.snapshot || {};
    const c = s.collections || {}, ln = s.loans || {}, inv = s.inventory || {}, ex = s.expenses || {}, tr = s.treasury || {}, dis = s.disbursements || {};
    const totalColl = (c.waterCash || 0) + (c.waterOnline || 0) + (c.loanCash || 0) + (c.loanOnline || 0) + (c.savingsIn || 0) + (c.productCashSale || 0) + (c.productLoanRevenue || 0);
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) return alert("Allow pop-ups to print.");
    const row = (k, v) => `<tr><td>${k}</td><td class="r">${v}</td></tr>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Audit Report ${r.label || ""}</title>
      <style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}
      .head{text-align:center;border-bottom:2.5px solid #6d28d9;padding-bottom:6px;margin-bottom:10px}
      .coop{font-size:16px;font-weight:800;color:#6d28d9}.sub{font-size:10px;color:#475569}
      .title{text-align:center;font-size:14px;font-weight:800;margin:8px 0}
      h3{margin:14px 0 4px;font-size:12px;color:#6d28d9;border-bottom:1px solid #ddd;padding-bottom:2px}
      table{width:100%;border-collapse:collapse;font-size:11px}td{padding:3px 6px;border-bottom:1px solid #eef2f7}
      .r{text-align:right;font-family:monospace}
      .sign{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:30px}
      .sig{text-align:center}.line{border-top:1px solid #0f172a;margin-top:30px;padding-top:3px}
      .findings{margin-top:12px;padding:8px;border:1px solid #ddd;border-radius:6px;background:#faf5ff}</style></head><body>
      <div class="head"><img src="${window.location.origin}/logo.png" alt="" style="height:54px;width:54px;object-fit:contain;display:block;margin:0 auto 4px"/><div class="coop">POWASSCO MULTIPURPOSE COOPERATIVE</div>
      <div class="sub">Owak, Asturias, Cebu &bull; C.D.A Reg. No. 9520-07014753</div>
      <div class="sub">Audit Committee — Official Report</div></div>
      <div class="title">AUDIT COMMITTEE REPORT${r.label ? " — " + r.label : ""}</div>
      <div style="text-align:center;font-size:11px;color:#475569">Period: ${fmt(r.periodFrom)} to ${fmt(r.periodTo)}</div>
      <h3>Collections</h3><table>
        ${row("Water — cash", peso(c.waterCash))}${row("Water — online", peso(c.waterOnline))}
        ${row("Loan — cash", peso(c.loanCash))}${row("Loan — online", peso(c.loanOnline))}
        ${row("Product sales", peso(c.productCashSale))}${row("Product loan revenue", peso(c.productLoanRevenue))}
        ${row("Savings deposits", peso(c.savingsIn))}${row("Savings withdrawals", "−" + peso(c.savingsOut))}
        ${row("<b>TOTAL COLLECTIONS</b>", "<b>" + peso(totalColl) + "</b>")}</table>
      <h3>Loans</h3><table>
        ${row("Released", ln.released || 0)}${row("Capital", peso(ln.capital))}${row("Interest", peso(ln.interest))}
        ${row("Deductions", peso(ln.deductions))}${row("Paid", peso(ln.paid))}${row("Unpaid", peso(ln.unpaid))}
        ${row("Outstanding now", peso(ln.outstandingNow))}</table>
      <h3>Product Inventory</h3><table>
        ${row("Stock units remaining", inv.stockUnits || 0)}${row("Capital in unsold stock", peso(inv.capitalUnsold))}
        ${row("Retail value unsold", peso(inv.retailUnsold))}${row("Potential profit unsold", peso(inv.profitPotential))}
        ${row("Product paid", peso(inv.paid))}${row("Product unpaid", peso(inv.unpaid))}</table>
      <h3>Treasury / Reserves</h3><table>
        ${row("Cash Vault", peso(tr.vaultBalance))}${row("Bank total", peso(tr.bankTotal))}
        ${row("Expenses — cash", "−" + peso(ex.cash))}${row("Expenses — bank/cheque", "−" + peso(ex.bank))}
        ${row("Total CBU on file", peso(s.cbu?.total))}${row("Total savings on file", peso(s.savings?.total))}</table>
      <h3>General Disbursements</h3><table>
        ${row("Payroll — payslips", peso(dis.payroll?.payslips?.total))}${row("Payroll — cash advances", peso(dis.payroll?.advances?.total))}
        ${row("Loan proceeds paid", peso(dis.loanProceeds?.total))}
        ${(dis.expenses?.byCategory || []).map((e) => row("Expense — " + e.category, peso(e.total))).join("")}
        ${row("<b>TOTAL DISBURSED</b>", "<b>" + peso(dis.grandTotal) + "</b>")}
        ${row("Member fees collected (inflow)", peso(dis.memberFees?.total))}</table>
      ${r.findings ? `<div class="findings"><b>Findings / remarks:</b><br/>${r.findings}</div>` : ""}
      <div class="sign">
        <div class="sig"><div class="line"><b>${r.signedBy}</b></div>Audited & signed by (Audit Committee)<br/>${fmtDT(r.signedAt)}</div>
        <div class="sig"><div class="line">&nbsp;</div>Noted by</div>
      </div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Archive size={20} className="text-violet-600" /> Audited Reports
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Signed audit reports — frozen snapshots, view or print anytime.</div>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Report</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Signed by</th>
              <th className="px-3 py-2">Signed at</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr><td colSpan={5} className="py-10 text-center text-xs text-slate-500">No audited reports yet. Sign one from the Overall Audit Report tab.</td></tr>
            ) : items.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 font-semibold"><CheckCircle2 size={14} className="text-emerald-600" /> {r.label || "Audit report"}</div>
                </td>
                <td className="px-3 py-2 text-xs">{fmt(r.periodFrom)} – {fmt(r.periodTo)}</td>
                <td className="px-3 py-2 text-xs">{r.signedBy}</td>
                <td className="px-3 py-2 text-xs">{fmtDT(r.signedAt)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => setOpen(r)} className="mr-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">View</button>
                  <button onClick={() => printReport(r)} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700"><Printer size={12} /> Print</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!open} title={open?.label || "Audit report"} subtitle={open ? `${fmt(open.periodFrom)} – ${fmt(open.periodTo)} • signed by ${open.signedBy}` : ""} onClose={() => setOpen(null)} size="lg">
        {open && (
          <div className="space-y-3 text-sm">
            {open.findings && <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs"><b>Findings:</b> {open.findings}</div>}
            <pre className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed">{JSON.stringify(open.snapshot, null, 2)}</pre>
            <div className="flex justify-end">
              <button onClick={() => printReport(open)} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"><Printer size={14} /> Print formatted report</button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
