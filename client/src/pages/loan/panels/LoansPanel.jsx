import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";

const PAGE_SIZE = 12;

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthOptions(back = 12) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < back; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function LoansPanel() {
  const { token } = useAuth();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const url =
        `/loan/applications?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&month=${encodeURIComponent(month)}` +
        `&page=${page}&limit=${PAGE_SIZE}`;
      const data = await apiFetch(url, { token });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [q, status, month, page]);

  function openView(x) {
    setViewing(x);
    setViewOpen(true);
  }

  async function setAppStatus(appId, nextStatus) {
    setErr("");
    try {
      await apiFetch(`/loan/applications/${appId}`, {
        method: "PUT",
        token,
        body: { status: nextStatus },
      });
      setToast(`✅ Updated: ${nextStatus}`);
      await load();
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function release(appId) {
    setErr("");
    try {
      await apiFetch(`/loan/applications/${appId}/release`, { method: "POST", token });
      setToast("✅ Loan released");
      await load();
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function closeLoan(appId) {
    setErr("");
    try {
      await apiFetch(`/loan/applications/${appId}/close`, { method: "POST", token });
      setToast("✅ Loan closed");
      await load();
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-black text-slate-900">Loans</div>
          <div className="text-xs text-slate-600 mt-1">Search by Loan ID, PN No, or Name.</div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Search Loan ID / PN No / Name"
            className="w-full sm:w-72 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
          />

          <select
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
            className="w-full sm:w-48 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
          >
            <option value="">All Status</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="released">released</option>
            <option value="closed">closed</option>
            <option value="rejected">rejected</option>
          </select>

          <select
            value={month}
            onChange={(e) => { setPage(1); setMonth(e.target.value); }}
            className="w-full sm:w-40 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
          >
            <option value="">All Months</option>
            {monthOptions(24).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <button
            onClick={load}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {toast}
        </div>
      )}
      {err && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {err}
        </div>
      )}

      <div className="mt-4 overflow-auto rounded-2xl border border-slate-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="py-3 px-4">Loan</th>
              <th className="py-3 px-4">Borrower</th>
              <th className="py-3 px-4">Principal</th>
              <th className="py-3 px-4">Total</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-600">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-600">No loans found.</td></tr>
            ) : (
              items.map((x) => (
                <tr key={x._id} className="border-t hover:bg-slate-50/60">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{x.loanId}</div>
                    <div className="text-xs text-slate-600">{new Date(x.createdAt).toLocaleDateString()}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{x.borrowerName}</div>
                    <div className="text-xs text-slate-600">{x.borrowerPnNo}</div>
                  </td>
                  <td className="py-3 px-4">₱ {money(x.principal)}</td>
                  <td className="py-3 px-4">₱ {money(x.totalPayable)}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold bg-slate-100 border-slate-200 text-slate-700">
                      {x.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                      onClick={() => openView(x)}
                    >
                      View
                    </button>

                    {x.status === "pending" && (
                      <>
                        <button
                          className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                          onClick={() => setAppStatus(x._id, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                          onClick={() => setAppStatus(x._id, "rejected")}
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {x.status === "approved" && (
                      <button
                        className="rounded-xl bg-emerald-600 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-700"
                        onClick={() => release(x._id)}
                      >
                        Release
                      </button>
                    )}

                    {x.status === "released" && (
                      <button
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                        onClick={() => closeLoan(x._id)}
                      >
                        Close
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          Showing <b>{items.length}</b> of <b>{total}</b>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <div className="text-sm font-semibold text-slate-700">
            Page {page} / {totalPages}
          </div>
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>

      <Modal open={viewOpen} title="Loan Details" onClose={() => setViewOpen(false)}>
        {!viewing ? null : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Info label="Loan ID" value={viewing.loanId} />
              <Info label="Status" value={viewing.status} />
              <Info label="Borrower" value={`${viewing.borrowerName} (${viewing.borrowerPnNo})`} />
              <Info label="Principal" value={`₱ ${money(viewing.principal)}`} />
              <Info label="Interest" value={`₱ ${money(viewing.interestAmount)}`} />
              <Info label="Total Payable" value={`₱ ${money(viewing.totalPayable)}`} />
              <Info label="Monthly" value={`₱ ${money(viewing.monthlyAmortization)}`} />
              <Info label="Term (months)" value={viewing.termMonths} />
              <Info label="Released At" value={viewing.releasedAt ? new Date(viewing.releasedAt).toLocaleString() : "—"} />
              <Info label="Maturity" value={viewing.maturityDate ? new Date(viewing.maturityDate).toLocaleDateString() : "—"} />
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900">Purpose</div>
              <div className="text-sm text-slate-700 mt-2">{viewing.purpose || "—"}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900">Remarks</div>
              <div className="text-sm text-slate-700 mt-2">{viewing.remarks || "—"}</div>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-900 mt-1 break-words">{value ?? "—"}</div>
    </div>
  );
}
