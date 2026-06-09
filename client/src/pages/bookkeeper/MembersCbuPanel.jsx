import { useEffect, useState, useCallback } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Wallet, Search, RefreshCw } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function MembersCbuPanel() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openPn, setOpenPn] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      setData(await apiFetch(`/bookkeeper/members-cbu${params}`, { token }));
    } catch {/* ignore */} finally { setBusy(false); }
  }, [q, token]);
  useEffect(() => { load(); }, [load]);

  async function openHistory(m) {
    setOpenPn(m);
    setHistory(null);
    try { setHistory(await apiFetch(`/bookkeeper/members-cbu/${m.pnNo}`, { token })); } catch {/* ignore */}
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Wallet size={20} className="text-blue-600" /> Members & CBU
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Total CBU across all members: <b className="text-blue-700">{peso(data?.total || 0)}</b> across <b>{data?.count || 0}</b> account(s).</div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="PN or name" className="rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm" />
          </div>
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </form>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Account No.</th>
              <th className="px-3 py-2">Account name</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">CBU balance</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : data.members.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-500">No members yet.</td></tr>
            ) : (
              data.members.map((m) => (
                <tr key={m.pnNo} className="border-t hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-mono">{m.pnNo}</td>
                  <td className="px-3 py-2 font-semibold">{m.accountName}</td>
                  <td className="px-3 py-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-bold ${m.accountStatus === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{m.accountStatus}</span></td>
                  <td className="px-3 py-2 text-right font-bold text-blue-700">{peso(m.cbuBalance)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => openHistory(m)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">History</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!openPn} title={openPn ? `CBU Ledger — ${openPn.accountName}` : ""} subtitle={openPn ? `${openPn.pnNo} • Balance: ${peso(openPn.cbuBalance)}` : ""} onClose={() => setOpenPn(null)} size="lg">
        {!history ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading ledger…</div>
        ) : history.ledger.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No CBU activity yet.</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">OR / ref</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Balance after</th>
                  <th className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {history.ledger.map((e) => (
                  <tr key={e._id} className="border-t">
                    <td className="px-3 py-2 text-xs">{fmtDate(e.createdAt)}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${e.type === "credit" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{e.type.toUpperCase()}</span></td>
                    <td className="px-3 py-2 text-xs">{e.source}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.refOrNo || "—"}</td>
                    <td className={`px-3 py-2 text-right font-bold ${e.type === "credit" ? "text-emerald-700" : "text-amber-700"}`}>{e.type === "credit" ? "+" : "−"}{peso(e.amount)}</td>
                    <td className="px-3 py-2 text-right">{peso(e.balanceAfter)}</td>
                    <td className="px-3 py-2 text-xs">{e.postedBy || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </Card>
  );
}
