// Petty Cash — the cashier's imprest fund. Replenish adds cash; vouchers
// spend it on minor expenses. Running balance is computed server-side from
// non-voided rows. Separate from the main cash drawer.
import { useCallback, useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Wallet, Plus, ArrowDownLeft, ArrowUpRight, RefreshCw, Ban, Loader2 } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });

function Tile({ label, value, tone, icon: Icon }) {
  const styles = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    rose: "bg-rose-50 border-rose-200 text-rose-800",
    slate: "bg-slate-50 border-slate-200 text-slate-800",
  }[tone] || "bg-slate-50 border-slate-200 text-slate-800";
  return (
    <div className={`rounded-2xl border p-3 ${styles}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-70">
        {Icon && <Icon size={12} />} {label}
      </div>
      <div className="mt-1 font-mono text-xl font-extrabold">{value}</div>
    </div>
  );
}

export default function PettyCashPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Voucher form
  const [vAmount, setVAmount] = useState("");
  const [vCategory, setVCategory] = useState("");
  const [vPayee, setVPayee] = useState("");
  const [vDesc, setVDesc] = useState("");
  const [vRef, setVRef] = useState("");
  // Replenish form
  const [rAmount, setRAmount] = useState("");
  const [rRef, setRRef] = useState("");
  const [rNotes, setRNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiFetch("/petty-cash", { token })); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const categories = data?.categories || [];
  const balance = data?.balance ?? 0;

  async function addVoucher(e) {
    e.preventDefault();
    const amt = Number(vAmount);
    if (!(amt > 0)) return toast.error("Enter an amount greater than 0.");
    if (amt > balance + 0.001) return toast.error(`Only ${peso(balance)} left in petty cash. Replenish first.`);
    setBusy(true);
    try {
      await apiFetch("/petty-cash/voucher", {
        method: "POST", token,
        body: { amount: amt, category: vCategory, payee: vPayee, description: vDesc, reference: vRef },
      });
      toast.success(`Voucher recorded — ${peso(amt)} out.`);
      setVAmount(""); setVCategory(""); setVPayee(""); setVDesc(""); setVRef("");
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function replenish(e) {
    e.preventDefault();
    const amt = Number(rAmount);
    if (!(amt > 0)) return toast.error("Enter an amount greater than 0.");
    setBusy(true);
    try {
      await apiFetch("/petty-cash/replenish", {
        method: "POST", token, body: { amount: amt, reference: rRef, notes: rNotes },
      });
      toast.success(`Fund replenished — ${peso(amt)} in.`);
      setRAmount(""); setRRef(""); setRNotes("");
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function voidRow(id) {
    if (!window.confirm("Void this petty cash entry? The running balance will be recomputed.")) return;
    setBusy(true);
    try {
      await apiFetch(`/petty-cash/${id}/void`, { method: "POST", token, body: { reason: "" } });
      toast.success("Entry voided.");
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Wallet size={20} className="text-emerald-600" /> Petty Cash Fund
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Tile label="Replenished (in)" value={peso(data?.fund)} tone="emerald" icon={ArrowDownLeft} />
          <Tile label="Vouchers (out)" value={peso(data?.spent)} tone="rose" icon={ArrowUpRight} />
          <Tile label="Balance on hand" value={peso(balance)} tone="slate" icon={Wallet} />
        </div>
        {balance <= 0 && (data?.count || 0) > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            Petty cash is empty — replenish the fund before issuing more vouchers.
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Voucher (cash out) */}
        <Card>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ArrowUpRight size={16} className="text-rose-600" /> New voucher (cash out)
          </div>
          <form onSubmit={addVoucher} className="mt-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Amount (₱)</label>
                <input type="number" min="0" step="0.01" value={vAmount} onChange={(e) => setVAmount(e.target.value)} className={inputCls} placeholder="0.00" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Category</label>
                <input list="pc-cats" value={vCategory} onChange={(e) => setVCategory(e.target.value)} className={inputCls} placeholder="e.g. Office Supplies" />
                <datalist id="pc-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Paid to</label>
                <input value={vPayee} onChange={(e) => setVPayee(e.target.value)} className={inputCls} placeholder="Payee" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Voucher / OR no.</label>
                <input value={vRef} onChange={(e) => setVRef(e.target.value)} className={inputCls} placeholder="optional" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500">Particulars</label>
              <input value={vDesc} onChange={(e) => setVDesc(e.target.value)} className={inputCls} placeholder="What was it for?" />
            </div>
            <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Record voucher
            </button>
          </form>
        </Card>

        {/* Replenish (cash in) */}
        <Card>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ArrowDownLeft size={16} className="text-emerald-600" /> Replenish fund (cash in)
          </div>
          <form onSubmit={replenish} className="mt-3 space-y-2.5">
            <div>
              <label className="text-[11px] font-semibold text-slate-500">Amount (₱)</label>
              <input type="number" min="0" step="0.01" value={rAmount} onChange={(e) => setRAmount(e.target.value)} className={inputCls} placeholder="0.00" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500">Reference (OR / DV no.)</label>
              <input value={rRef} onChange={(e) => setRRef(e.target.value)} className={inputCls} placeholder="optional" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500">Notes</label>
              <input value={rNotes} onChange={(e) => setRNotes(e.target.value)} className={inputCls} placeholder="e.g. opening fund / top-up from treasury" />
            </div>
            <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownLeft size={14} />} Add to fund
            </button>
          </form>
        </Card>
      </div>

      {/* Ledger */}
      <Card>
        <div className="text-sm font-bold text-slate-900">Petty cash ledger</div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Particulars</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">In</th>
                <th className="px-3 py-2 text-right">Out</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(data?.transactions || []).map((t) => (
                <tr key={t._id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{fmtD(t.date)}</td>
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-slate-800">{t.description || (t.type === "replenish" ? "Fund replenishment" : "Petty cash voucher")}</div>
                    <div className="text-[10px] text-slate-400">
                      {t.payee ? `${t.payee} · ` : ""}{t.reference ? `Ref ${t.reference} · ` : ""}{t.recordedBy}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-slate-500">{t.category || "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-emerald-700">{t.type === "replenish" ? peso(t.amount) : ""}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-rose-700">{t.type === "voucher" ? peso(t.amount) : ""}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-slate-900">{peso(t.running)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => voidRow(t._id)} disabled={busy} title="Void this entry"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                      <Ban size={12} /> Void
                    </button>
                  </td>
                </tr>
              ))}
              {(!data?.transactions || data.transactions.length === 0) && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No petty cash entries yet. Replenish the fund to start.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
