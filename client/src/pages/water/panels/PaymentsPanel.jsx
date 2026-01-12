import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/Card";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";

const PAGE_SIZE = 12;

export default function PaymentsPanel() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiFetch(`/water/payments?q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_SIZE}`, { token });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, page]);

  return (
    <Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-black text-slate-900">Payment History</div>
          <div className="text-xs text-slate-600 mt-1">Search by PN No or OR No.</div>
        </div>

        <input
          value={q}
          onChange={(e) => { setPage(1); setQ(e.target.value); }}
          placeholder="Search PN No / OR No"
          className="w-full sm:w-80 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>

      {err && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {err}
        </div>
      )}

      <div className="mt-4 overflow-auto rounded-2xl border border-slate-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">PN No.</th>
              <th className="py-3 px-4">OR No.</th>
              <th className="py-3 px-4">Method</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Received By</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-600">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-600">No payments found.</td></tr>
            ) : (
              items.map((p) => (
                <tr key={p._id} className="border-t hover:bg-slate-50/60">
                  <td className="py-3 px-4">{p.paidAt ? new Date(p.paidAt).toLocaleString() : ""}</td>
                  <td className="py-3 px-4 font-bold">{p.pnNo}</td>
                  <td className="py-3 px-4">{p.orNo}</td>
                  <td className="py-3 px-4 uppercase text-xs font-bold text-emerald-700">{p.method}</td>
                  <td className="py-3 px-4 font-bold">{Number(p.amountPaid || 0).toFixed(2)}</td>
                  <td className="py-3 px-4">{p.receivedBy || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">Showing <b>{items.length}</b> of <b>{total}</b></div>
        <div className="flex items-center gap-2">
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <div className="text-sm font-semibold">Page {page} / {totalPages}</div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      </div>
    </Card>
  );
}
