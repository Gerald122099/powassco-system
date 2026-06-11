// Cashier "Savings" — open / deposit / withdraw voluntary savings.
// Voluntary savings is DISTINCT from CBU (mandatory). Cashier can
// open an account for any registered water-member, then accept
// deposits or pay out withdrawals. Each transaction prints a small
// thermal-style OR.
//
// Flow:
//   1. Search the member (account number or name)
//   2. If no savings account yet, "Open Account" first
//   3. Deposit / Withdraw — amount + optional note + method
//   4. OR is generated server-side, balance updates atomically

import { useEffect, useState, useCallback, useRef } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { PiggyBank, Search, RefreshCw, Plus, ArrowUpRight, ArrowDownLeft, Printer } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

function printSavingsReceipt({ tx, account, cashierName }) {
  const w = window.open("", "_blank", "width=440,height=640");
  if (!w) return alert("Allow pop-ups to print.");
  const action = tx.type === "deposit" ? "DEPOSIT" : "WITHDRAWAL";
  const color = tx.type === "deposit" ? "#0f766e" : "#b91c1c";
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>OR ${tx.orNo}</title>
    <style>@page{size:A6;margin:6mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}
    h1{font-size:14px;margin:0 0 4px;color:${color}}.row{display:flex;justify-content:space-between;margin:2px 0}
    .total{margin-top:8px;text-align:right;font-weight:bold;font-size:15px;color:${color}}
    .muted{color:#64748b;font-size:10px}.line{border-bottom:1px dashed #cbd5e1;margin:6px 0}
    </style></head><body>
    <h1>POWASSCO — Savings ${action}</h1>
    <div class="muted">OR ${tx.orNo} • ${new Date(tx.paidAt).toLocaleString()} • by ${cashierName || ""}</div>
    <div class="line"></div>
    <div class="row"><span>Account</span><b>${account.accountName} (${account.pnNo})</b></div>
    <div class="row"><span>Type</span><b>${action}</b></div>
    <div class="row"><span>Method</span><span>${tx.method}</span></div>
    ${tx.note ? `<div class="row"><span>Note</span><span>${tx.note}</span></div>` : ""}
    <div class="line"></div>
    <div class="total">${tx.type === "deposit" ? "+" : "-"}₱${(Number(tx.amount) || 0).toFixed(2)}</div>
    <div class="row" style="margin-top:6px"><span>New Balance</span><b>₱${(Number(tx.balanceAfter) || 0).toFixed(2)}</b></div>
    </body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 250);
}

const METHODS = ["cash", "check", "bank", "gcash", "other"];

export default function CashierSavingsPanel() {
  const { token, user } = useAuth();
  const [q, setQ] = useState("");
  const [member, setMember] = useState(null);
  const [memberLookup, setMemberLookup] = useState({ status: "idle", error: "" });
  const [account, setAccount] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [busy, setBusy] = useState(false);

  const [opening, setOpening] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [txType, setTxType] = useState(null); // "deposit" | "withdrawal" | null
  const [amount, setAmount] = useState("");
  const [orNo, setOrNo] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastTx, setLastTx] = useState(null);

  const searchRef = useRef(null);
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Debounced member + savings lookup
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setMember(null); setAccount(null); setLedger([]);
      setMemberLookup({ status: "idle", error: "" });
      return;
    }
    setMemberLookup({ status: "loading", error: "" });
    const t = setTimeout(async () => {
      try {
        // Try exact account number first
        let foundMember = null;
        try {
          foundMember = await apiFetch(`/water/members/pn/${encodeURIComponent(text.toUpperCase())}`, { token });
        } catch { /* fall through */ }
        if (!foundMember) {
          // /cashier/water returns { member } (full payload) on a single
          // match and { candidates: [...] } when a name matches several
          // accounts — there is no `members` key.
          const res = await apiFetch(`/cashier/water?q=${encodeURIComponent(text)}`, { token });
          if (res?.member) {
            foundMember = res.member;
          } else if (res?.candidates?.length) {
            setMemberLookup({ status: "ambiguous", error: `${res.candidates.length} matches — type the full account number (e.g. ${res.candidates[0].pnNo}).` });
            setMember(null); setAccount(null); setLedger([]);
            return;
          } else {
            setMemberLookup({ status: "missing", error: "Member not found." });
            setMember(null); setAccount(null); setLedger([]);
            return;
          }
        }
        setMember(foundMember);
        setMemberLookup({ status: "found", error: "" });
        // Fetch savings account (404 = no account yet)
        try {
          const data = await apiFetch(`/savings/${foundMember.pnNo}`, { token });
          setAccount(data.account);
          setLedger(data.ledger || []);
        } catch (e) {
          if (/not found|no savings/i.test(e.message || "")) {
            setAccount(null); setLedger([]);
          } else {
            toast.error(e.message);
          }
        }
      } catch (e) {
        setMemberLookup({ status: "missing", error: e.message || "Lookup failed." });
        setMember(null); setAccount(null); setLedger([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, token]);

  function startOpen() {
    setPinInput(""); setPinConfirm(""); setPinModalOpen(true);
  }
  async function openAccount() {
    if (!member) return;
    if (!/^[0-9]{4}$/.test(pinInput)) { toast.error("PIN must be exactly 4 digits."); return; }
    if (pinInput !== pinConfirm) { toast.error("PINs do not match."); return; }
    setOpening(true);
    try {
      const res = await apiFetch("/savings/open", {
        method: "POST",
        token,
        body: { pnNo: member.pnNo, pin: pinInput },
      });
      setAccount(res.account);
      setLedger([]);
      toast.success(res.alreadyExists ? "Account already exists." : "Savings account opened.");
      setPinModalOpen(false);
    } catch (e) {
      toast.error(e.message || "Failed to open account.");
    } finally {
      setOpening(false);
    }
  }

  function startTx(type) {
    setTxType(type);
    setAmount("");
    setOrNo("");
    setMethod("cash");
    setNote("");
    setLastTx(null);
  }
  function cancelTx() {
    setTxType(null);
  }

  async function submitTx() {
    if (!member || !account) return;
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error("Enter an amount greater than 0."); return; }
    if (!orNo.trim()) { toast.error("Enter the OR number from the receipt booklet."); return; }
    if (txType === "withdrawal" && amt > Number(account.balance)) {
      toast.error(`Insufficient balance — only ${peso(account.balance)} on file.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/savings/${txType}`, {
        method: "POST",
        token,
        body: { pnNo: member.pnNo, amount: amt, orNo: orNo.trim().toUpperCase(), method, note },
      });
      setAccount(res.account);
      setLedger((prev) => [res.tx, ...prev]);
      setLastTx(res.tx);
      toast.success(`${txType === "deposit" ? "Deposit" : "Withdrawal"} • OR ${res.tx.orNo}`);
      setTxType(null);
    } catch (e) {
      toast.error(e.message || `Failed to ${txType}.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function refresh() {
    if (!member) return;
    setBusy(true);
    try {
      const data = await apiFetch(`/savings/${member.pnNo}`, { token });
      setAccount(data.account);
      setLedger(data.ledger || []);
    } catch {/* ignore */} finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <PiggyBank size={20} className="text-pink-600" /> Voluntary Savings
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Open accounts, accept deposits, pay withdrawals. Separate from mandatory CBU (Share Capital).
          </div>
        </div>
        {member && (
          <button onClick={refresh} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-slate-600">Find member</label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Account number or member name"
            className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm"
          />
        </div>
        {memberLookup.status === "loading" && <div className="mt-1 text-xs text-slate-500">Looking up…</div>}
        {memberLookup.status === "missing" && <div className="mt-1 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{memberLookup.error}</div>}
        {memberLookup.status === "ambiguous" && <div className="mt-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{memberLookup.error}</div>}
      </div>

      {/* Member context + account */}
      {member && (
        <div className="mt-4 rounded-2xl border border-pink-200 bg-pink-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-pink-900">{member.accountName}</div>
              <div className="font-mono text-xs text-pink-700">{member.pnNo} • CBU {peso(member.cbuBalance || 0)}</div>
            </div>
            {!account ? (
              <button
                onClick={startOpen}
                disabled={opening}
                className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white hover:bg-pink-700 disabled:opacity-50"
              >
                <Plus size={14} /> {opening ? "Opening…" : "Open Savings Account"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-pink-700">Savings balance</div>
                  <div className="font-mono text-xl font-extrabold text-pink-800">{peso(account.balance)}</div>
                </div>
                {/* Deposit / withdraw buttons only for cashier + admin —
                    server rejects loan_officer + bookkeeper on tx routes.
                    Hide them for those roles so the UI matches. */}
                {(user?.role === "admin" || user?.role === "cashier") && (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => startTx("deposit")}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <ArrowDownLeft size={12} /> Deposit
                    </button>
                    <button
                      onClick={() => startTx("withdrawal")}
                      disabled={Number(account.balance) <= 0}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      <ArrowUpRight size={12} /> Withdraw
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transaction form */}
          {txType && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-bold text-slate-800 mb-2 capitalize">{txType}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600">OR number *</label>
                  <input
                    value={orNo}
                    onChange={(e) => setOrNo(e.target.value)}
                    placeholder="from receipt booklet"
                    autoFocus
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Amount (₱)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
                  />
                  {txType === "withdrawal" && account && (
                    <div className="mt-1 text-[10px] text-slate-500">Max {peso(account.balance)}</div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Method</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm capitalize">
                    {METHODS.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Note (optional)</label>
                  <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={cancelTx} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
                <button
                  onClick={submitTx}
                  disabled={submitting || !(Number(amount) > 0) || !orNo.trim()}
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-50 ${txType === "deposit" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}
                >
                  {submitting ? "Posting…" : `Post ${txType === "deposit" ? "Deposit" : "Withdrawal"} ${amount ? peso(amount) : ""}`}
                </button>
              </div>
            </div>
          )}

          {/* Last receipt */}
          {lastTx && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-emerald-900">OR {lastTx.orNo} posted</div>
                <div className="text-xs text-emerald-700">
                  {lastTx.type === "deposit" ? "+" : "-"}{peso(lastTx.amount)} • new balance {peso(lastTx.balanceAfter)}
                </div>
              </div>
              <button
                onClick={() => printSavingsReceipt({ tx: lastTx, account, cashierName: user?.fullName || user?.employeeId })}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                <Printer size={12} /> Print OR
              </button>
            </div>
          )}
        </div>
      )}

      {/* PIN modal — required at account open time */}
      <Modal open={pinModalOpen} title="Set 4-digit PIN" onClose={() => setPinModalOpen(false)} size="sm">
        <div className="space-y-3">
          <div className="rounded-xl border border-pink-200 bg-pink-50 p-3 text-xs text-pink-900">
            The PIN lets the member check their savings balance from the public homepage
            (no login). Hand it to them privately after opening the account.
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">New PIN (4 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
              autoFocus
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-center font-mono text-2xl tracking-widest"
              placeholder="••••"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-center font-mono text-2xl tracking-widest"
              placeholder="••••"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setPinModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button
              onClick={openAccount}
              disabled={opening || pinInput.length !== 4 || pinInput !== pinConfirm}
              className="rounded-xl bg-pink-600 px-5 py-2 text-sm font-bold text-white hover:bg-pink-700 disabled:opacity-50"
            >
              {opening ? "Opening…" : "Open Account"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Ledger */}
      {member && account && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">Transaction ledger ({ledger.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">OR No.</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Balance after</th>
                  <th className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-xs text-slate-500">No transactions yet.</td></tr>
                ) : ledger.map((t) => (
                  <tr key={t._id} className="border-t">
                    <td className="px-3 py-1.5 text-xs">{fmtDateTime(t.paidAt)}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{t.orNo}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.type === "deposit" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {t.type.toUpperCase()}
                      </span>
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono font-bold ${t.type === "deposit" ? "text-emerald-700" : "text-amber-700"}`}>
                      {t.type === "deposit" ? "+" : "-"}{peso(t.amount)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{peso(t.balanceAfter)}</td>
                    <td className="px-3 py-1.5 text-xs">{t.receivedBy || "—"}</td>
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
