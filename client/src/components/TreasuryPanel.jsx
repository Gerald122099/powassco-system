// Treasury panel — banks, cash vault, ordered approval requests.
// One component serves four roles:
//   bookkeeper — files bank/vault requests, adds accounts, signs
//                drawer_to_vault (2nd) and vault_to_drawer (1st)
//   manager    — first approver on everything manager-gated
//   admin      — can act as manager
//   cashier    — files drawer↔vault requests, signs
//                vault_deposit_to_bank (2nd) and drawer_to_vault (last)
// Money only moves when the LAST required approver signs.

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "./Toast";
import { Landmark, Vault, Plus, Check, X, RefreshCw, ArrowRightLeft, Hash } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDT = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

const STATUS_BADGE = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

// Mirror of the server matrix — used only for UI hints; the server
// re-validates everything.
const TYPES = {
  bank_initial_balance: { label: "Set opening bank balance", approvers: ["manager"], needsDest: true },
  bank_adjust: { label: "Bank balance adjustment", approvers: ["manager"], needsSource: true, hasDirection: true },
  bank_withdraw_to_vault: { label: "Bank withdrawal → Cash Vault", approvers: ["manager"], needsSource: true },
  bank_transfer: { label: "Bank → bank transfer", approvers: ["manager"], needsSource: true, needsDest: true },
  vault_add: { label: "Add funds to Cash Vault", approvers: ["manager"] },
  vault_deposit_to_bank: { label: "Cash Vault → bank deposit", approvers: ["manager", "cashier"], needsDest: true },
  drawer_to_vault: { label: "Cash drawer → Cash Vault", approvers: ["manager", "bookkeeper"] },
  vault_to_drawer: { label: "Cash Vault → cash drawer", approvers: ["bookkeeper", "manager"] },
};
const FILEABLE = {
  bookkeeper: ["bank_initial_balance", "bank_adjust", "bank_withdraw_to_vault", "bank_transfer", "vault_add", "vault_deposit_to_bank"],
  cashier: ["drawer_to_vault", "vault_to_drawer"],
  manager: Object.keys(TYPES),
  admin: Object.keys(TYPES),
};

export default function TreasuryPanel() {
  const { token, user } = useAuth();
  const role = user?.role;
  const actsAsManager = role === "admin" || role === "manager";
  const [overview, setOverview] = useState(null);
  const [requests, setRequests] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");

  // New-request modal
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "", amount: "", reason: "", direction: "in", sourceBankAccountId: "", destBankAccountId: "" });
  const [submitting, setSubmitting] = useState(false);

  // Add-account modal (bookkeeper/admin)
  const [acctOpen, setAcctOpen] = useState(false);
  const [banks, setBanks] = useState([]);
  const [acctForm, setAcctForm] = useState({ bankId: "", accountName: "", accountNumber: "", openingBalance: "" });

  const [drawerNet, setDrawerNet] = useState(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [ov, reqs, led, drawer] = await Promise.all([
        apiFetch("/treasury/overview", { token }),
        apiFetch(`/treasury/requests${statusFilter ? `?status=${statusFilter}` : ""}`, { token }),
        apiFetch("/treasury/transactions", { token }),
        apiFetch("/cashier/drawer-summary", { token }).catch(() => null),
      ]);
      setOverview(ov);
      setDrawerNet(drawer?.totals?.net ?? null);
      setRequests(reqs.items || []);
      setLedger((led.items || []).slice(0, 40));
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }, [token, statusFilter]);
  useEffect(() => { load(); }, [load]);

  function nextApprover(r) {
    return TYPES[r.type]?.approvers[(r.approvals || []).length] || null;
  }
  function canSign(r) {
    const next = nextApprover(r);
    return next && (next === role || (next === "manager" && role === "admin"));
  }

  async function act(r, action) {
    const note = action === "reject" ? prompt("Reason for rejecting:", "") : "";
    if (action === "reject" && note === null) return;
    try {
      const res = await apiFetch(`/treasury/requests/${r._id}/${action}`, { method: "POST", token, body: { note } });
      toast.success(action === "approve"
        ? (res.status === "approved" ? "Fully approved — funds moved." : "Signed — awaiting next approver.")
        : "Rejected.");
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function saveRef(r) {
    const refNo = prompt("Bank reference / slip / transaction number:", r.refNo || "");
    if (refNo === null || !refNo.trim()) return;
    try {
      await apiFetch(`/treasury/requests/${r._id}/ref`, { method: "PATCH", token, body: { refNo: refNo.trim() } });
      toast.success("Reference saved.");
      load();
    } catch (e) { toast.error(e.message); }
  }

  function openNew(type) {
    setForm({ type, amount: "", reason: "", direction: "in", sourceBankAccountId: "", destBankAccountId: "" });
    setOpen(true);
  }
  async function submitRequest() {
    const spec = TYPES[form.type];
    if (!spec) return;
    if (!(Number(form.amount) > 0)) return toast.error("Amount must be > 0.");
    if (!form.reason.trim()) return toast.error("A reason is required.");
    if (spec.needsSource && !form.sourceBankAccountId) return toast.error("Pick the source account.");
    if (spec.needsDest && !form.destBankAccountId) return toast.error("Pick the destination account.");
    setSubmitting(true);
    try {
      await apiFetch("/treasury/requests", { method: "POST", token, body: { ...form, amount: Number(form.amount) } });
      toast.success(`Request filed — awaiting ${spec.approvers.join(" → ")}.`);
      setOpen(false);
      setStatusFilter("pending");
      load();
    } catch (e) { toast.error(e.message); } finally { setSubmitting(false); }
  }

  async function openAcct() {
    try { setBanks(await apiFetch("/treasury/banks", { token })); } catch { /* ignore */ }
    setAcctForm({ bankId: "", accountName: "", accountNumber: "", openingBalance: "" });
    setAcctOpen(true);
  }
  async function submitAcct() {
    if (!acctForm.bankId) return toast.error("Pick a bank (admin registers banks in Bank Settings).");
    if (!acctForm.accountName.trim() || !acctForm.accountNumber.trim()) return toast.error("Account name + number required.");
    try {
      const res = await apiFetch("/treasury/accounts", { method: "POST", token, body: { ...acctForm, openingBalance: Number(acctForm.openingBalance) || 0 } });
      toast.success(res.request ? "Account added — opening balance awaits manager approval." : "Account added.");
      setAcctOpen(false);
      load();
    } catch (e) { toast.error(e.message); }
  }

  const fileable = FILEABLE[role] || [];
  const accounts = overview?.accounts || [];
  const spec = TYPES[form.type];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Landmark size={20} className="text-teal-600" /> Treasury — Banks & Cash Vault
            {overview?.pendingForMe > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                {overview.pendingForMe} awaiting you
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Every movement needs ordered approval before funds reflect. Reference numbers recorded after approval.
          </div>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Balances */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-teal-800"><Vault size={12} /> Cash Vault</div>
          <div className="mt-1 font-mono text-xl font-extrabold text-teal-900">{peso(overview?.vault?.balance || 0)}</div>
        </div>
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3">
          <div className="text-[10px] uppercase tracking-wide text-emerald-800">Cashier Drawer (today net)</div>
          <div className="mt-1 font-mono text-xl font-extrabold text-emerald-900">{drawerNet === null ? String.fromCharCode(8212) : peso(drawerNet)}</div>
        </div>
        {accounts.map((a) => (
          <div key={a._id} className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{a.bankName}</div>
            <div className="font-mono text-[10px] text-slate-400">{a.accountNumber}</div>
            <div className="mt-1 font-mono text-lg font-bold text-slate-800">{peso(a.balance)}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(role === "bookkeeper" || role === "admin") && (
          <button onClick={openAcct} className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-50">
            <Plus size={13} /> Add Bank Account
          </button>
        )}
        {fileable.map((t) => (
          <button key={t} onClick={() => openNew(t)} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700">
            <ArrowRightLeft size={13} /> {TYPES[t].label}
          </button>
        ))}
      </div>

      {/* Requests */}
      <div className="mt-5 flex items-center justify-between">
        <div className="text-sm font-bold text-slate-800">Approval requests</div>
        <div className="inline-flex rounded-xl border border-slate-200 p-1 text-xs font-semibold">
          {[["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["", "All"]].map(([k, label]) => (
            <button key={k || "all"} onClick={() => setStatusFilter(k)}
              className={`rounded-lg px-3 py-1 ${statusFilter === k ? "bg-teal-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Filed</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Accounts</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Sign-off</th>
              <th className="px-3 py-2">Ref #</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {!requests.length ? (
              <tr><td colSpan={8} className="py-8 text-center text-xs text-slate-500">No {statusFilter || ""} requests.</td></tr>
            ) : requests.map((r) => {
              const chain = TYPES[r.type]?.approvers || [];
              const next = nextApprover(r);
              return (
                <tr key={r._id} className="border-t align-top">
                  <td className="px-3 py-2 text-xs">{fmtDT(r.createdAt)}<div className="text-[10px] text-slate-500">{r.requestedBy} ({r.requestedByRole})</div></td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                    <div className="mt-0.5 text-xs font-semibold">{TYPES[r.type]?.label}{r.type === "bank_adjust" ? ` (${r.direction === "out" ? "−" : "+"})` : ""}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{peso(r.amount)}</td>
                  <td className="px-3 py-2 text-[10px] font-mono text-slate-500">
                    {r.sourceBankAccountId && <div>from {r.sourceBankAccountId.bankName} {r.sourceBankAccountId.accountNumber}</div>}
                    {r.destBankAccountId && <div>to {r.destBankAccountId.bankName} {r.destBankAccountId.accountNumber}</div>}
                  </td>
                  <td className="px-3 py-2 max-w-[12rem] text-xs text-slate-700">{r.reason}{r.rejectNote && <div className="italic text-rose-600">↳ {r.rejectNote}</div>}</td>
                  <td className="px-3 py-2 text-[10px]">
                    {chain.map((a, i) => {
                      const signed = (r.approvals || [])[i];
                      return (
                        <div key={i} className={signed ? "text-emerald-700" : a === next && r.status === "pending" ? "font-bold text-amber-700" : "text-slate-400"}>
                          {signed ? `✓ ${a}: ${signed.by}` : `• ${a}${a === next && r.status === "pending" ? " (next)" : ""}`}
                        </div>
                      );
                    })}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.refNo || (r.status === "approved" && ["admin", "manager", "bookkeeper"].includes(role) ? (
                      <button onClick={() => saveRef(r)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
                        <Hash size={10} /> add ref
                      </button>
                    ) : "—")}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {r.status === "pending" && canSign(r) ? (
                      <>
                        <button onClick={() => act(r, "approve")} className="mr-1 rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50" title="Approve"><Check size={14} /></button>
                        <button onClick={() => act(r, "reject")} className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50" title="Reject"><X size={14} /></button>
                      </>
                    ) : r.status === "pending" ? (
                      <span className="text-[10px] text-slate-400">awaiting {next}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ledger */}
      <div className="mt-5 text-sm font-bold text-slate-800">Recent movements (inflow / outflow)</div>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-[10px] text-slate-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Pool</th>
              <th className="px-3 py-2">Flow</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Balance after</th>
              <th className="px-3 py-2">Ref #</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2">By</th>
            </tr>
          </thead>
          <tbody>
            {!ledger.length ? (
              <tr><td colSpan={8} className="py-6 text-center text-slate-500">No movements yet.</td></tr>
            ) : ledger.map((t) => (
              <tr key={t._id} className="border-t">
                <td className="px-3 py-1.5">{fmtDT(t.createdAt)}</td>
                <td className="px-3 py-1.5 font-semibold">
                  {t.target === "vault" ? "Cash Vault" : t.target === "drawer" ? "Cash Drawer" : `${t.bankAccountId?.bankName || "Bank"} ${t.bankAccountId?.accountNumber || ""}`}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.type === "in" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {t.type === "in" ? "INFLOW" : "OUTFLOW"}
                  </span>
                </td>
                <td className={`px-3 py-1.5 text-right font-mono font-bold ${t.type === "in" ? "text-emerald-700" : "text-rose-700"}`}>
                  {t.type === "in" ? "+" : "−"}{peso(t.amount)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{t.balanceAfter === null || t.balanceAfter === undefined ? "—" : peso(t.balanceAfter)}</td>
                <td className="px-3 py-1.5 font-mono">{t.refNo || "—"}</td>
                <td className="px-3 py-1.5 max-w-[14rem] truncate" title={t.note}>{t.note}</td>
                <td className="px-3 py-1.5">{t.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New request modal */}
      <Modal open={open} title={spec?.label || "New request"} onClose={() => setOpen(false)}>
        {spec && (
          <div className="space-y-3">
            <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
              Approval chain: <b>{spec.approvers.join(" → ")}</b>. Funds move only after the last sign-off.
            </div>
            {spec.hasDirection && (
              <select value={form.direction} onChange={(e) => setForm((p) => ({ ...p, direction: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="in">Credit (+ add to balance)</option>
                <option value="out">Debit (− subtract)</option>
              </select>
            )}
            {spec.needsSource && (
              <select value={form.sourceBankAccountId} onChange={(e) => setForm((p) => ({ ...p, sourceBankAccountId: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="">— source bank account —</option>
                {accounts.map((a) => <option key={a._id} value={a._id}>{a.bankName} • {a.accountNumber} ({peso(a.balance)})</option>)}
              </select>
            )}
            {spec.needsDest && (
              <select value={form.destBankAccountId} onChange={(e) => setForm((p) => ({ ...p, destBankAccountId: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="">— destination bank account —</option>
                {accounts.map((a) => <option key={a._id} value={a._id}>{a.bankName} • {a.accountNumber} ({peso(a.balance)})</option>)}
              </select>
            )}
            <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="Amount (₱)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm" />
            <textarea value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} rows={2} placeholder="Reason (permanent record)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
              <button onClick={submitRequest} disabled={submitting} className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                {submitting ? "Filing…" : "File Request"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add bank account modal */}
      <Modal open={acctOpen} title="Add Bank Account" onClose={() => setAcctOpen(false)}>
        <div className="space-y-3">
          <select value={acctForm.bankId} onChange={(e) => setAcctForm((p) => ({ ...p, bankId: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">— pick a registered bank —</option>
            {banks.filter((b) => b.isActive).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
          <input value={acctForm.accountName} onChange={(e) => setAcctForm((p) => ({ ...p, accountName: e.target.value }))} placeholder="Account name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <input value={acctForm.accountNumber} onChange={(e) => setAcctForm((p) => ({ ...p, accountNumber: e.target.value }))} placeholder="Account number" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm" />
          <div>
            <input type="number" min="0" step="0.01" value={acctForm.openingBalance} onChange={(e) => setAcctForm((p) => ({ ...p, openingBalance: e.target.value }))} placeholder="Opening balance (₱, optional)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm" />
            <div className="mt-1 text-[10px] text-slate-500">An opening balance files an approval request to the manager — it reflects only after approval.</div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAcctOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={submitAcct} className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700">Add Account</button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
