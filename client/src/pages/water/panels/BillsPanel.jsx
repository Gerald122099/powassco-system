import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";

const PAGE_SIZE = 12;

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BillsPanel() {
  const { token } = useAuth();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState(""); // "" | "unpaid" | "overdue" | "paid"
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // pay modal
  const [payOpen, setPayOpen] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [payForm, setPayForm] = useState({ orNo: "", method: "cash" });
  const [payBill, setPayBill] = useState(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiFetch(
        `/water/bills?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=${page}&limit=${PAGE_SIZE}`,
        { token }
      );
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
  }, [q, status, page]);

  function openPay(b) {
    setPayErr("");
    setPayBill(b);
    setPayForm({ orNo: "", method: "cash" });
    setPayOpen(true);
  }

  async function payNow() {
    setPayErr("");
    try {
      await apiFetch(`/water/bills/${payBill._id}/pay`, {
        method: "POST",
        token,
        body: { orNo: payForm.orNo, method: payForm.method },
      });
      setPayOpen(false);
      setToast("✅ Payment saved");
      setTimeout(() => setToast(""), 2000);
      load();
    } catch (e) {
      setPayErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-black text-slate-900">Bills</div>
          <div className="text-xs text-slate-600 mt-1">
            Search PN No / Account Name • Filter status • Pay bills with OR and method.
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Search PN No / Account Name / Period"
            className="w-full sm:w-80 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />

          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
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
              <th className="py-3 px-4">PN No.</th>
              <th className="py-3 px-4">Account Name</th>
              <th className="py-3 px-4">Address</th>
              <th className="py-3 px-4">Class</th>
              <th className="py-3 px-4">Period</th>
              <th className="py-3 px-4">Prev</th>
              <th className="py-3 px-4">Pres</th>
              <th className="py-3 px-4">Cu.M</th>
              <th className="py-3 px-4">Penalty</th>
              <th className="py-3 px-4">Total</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="py-10 text-center text-slate-600">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-10 text-center text-slate-600">
                  No bills found.
                </td>
              </tr>
            ) : (
              items.map((b) => {
                const canPay = b.status === "unpaid" || b.status === "overdue";
                const badge =
                  b.status === "paid"
                    ? "bg-green-50 border-green-200 text-green-700"
                    : b.status === "overdue"
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-amber-50 border-amber-200 text-amber-800";

                return (
                  <tr key={b._id} className="border-t hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-bold text-slate-900">{b.pnNo}</td>
                    <td className="py-3 px-4">{b.accountName}</td>
                    <td className="py-3 px-4 max-w-[260px] truncate">{b.addressText || "—"}</td>
                    <td className="py-3 px-4 uppercase text-xs font-bold text-emerald-700">{b.classification}</td>
                    <td className="py-3 px-4">{b.periodCovered}</td>
                    <td className="py-3 px-4">{b.previousReading}</td>
                    <td className="py-3 px-4">{b.presentReading}</td>
                    <td className="py-3 px-4 font-semibold">{b.consumed}</td>
                    <td className="py-3 px-4">{money(b.penaltyApplied)}</td>
                    <td className="py-3 px-4 font-bold">{money(b.totalDue)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${badge}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canPay ? (
                        <button
                          className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:opacity-90"
                          onClick={() => openPay(b)}
                        >
                          Pay Bill
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Paid {b.paidAt ? new Date(b.paidAt).toLocaleDateString() : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
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

      {/* Pay Modal */}
      <Modal open={payOpen} title="Pay Bill" onClose={() => setPayOpen(false)}>
        {payBill && (
          <>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-bold text-slate-900">{payBill.accountName}</div>
              <div className="text-xs text-slate-600 mt-1">
                {payBill.pnNo} • {payBill.periodCovered}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="text-slate-600">Amount</div>
                <div className="text-right font-semibold">₱ {money(payBill.amount)}</div>

                <div className="text-slate-600">Penalty</div>
                <div className="text-right font-semibold">₱ {money(payBill.penaltyApplied)}</div>

                <div className="text-slate-900 font-bold">Total Due</div>
                <div className="text-right text-slate-900 font-black">₱ {money(payBill.totalDue)}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="OR No.">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={payForm.orNo}
                  onChange={(e) => setPayForm({ ...payForm, orNo: e.target.value })}
                />
              </Field>

              <Field label="Payment Method">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={payForm.method}
                  onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank">Bank</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>

            {payErr && (
              <div className="mt-3 rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">
                {payErr}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-200 px-4 py-2.5" onClick={() => setPayOpen(false)}>
                Cancel
              </button>
              <button
                className="rounded-xl bg-slate-900 text-white px-4 py-2.5 font-semibold hover:opacity-90"
                onClick={payNow}
              >
                Confirm Payment
              </button>
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}
