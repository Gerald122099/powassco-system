import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE; // http://localhost:5000/api

function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function withinLast12Months(dateLike) {
  if (!dateLike) return true;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return true;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  return d >= cutoff;
}

export default function MemberInquiryPage() {
  const [pnNo, setPnNo] = useState("");
  const [birthdate, setBirthdate] = useState("");

  // ✅ toggle
  const [onlyLast12, setOnlyLast12] = useState(true);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setData(null);

    const pn = pnNo.trim();
    if (!pn || !birthdate) {
      setErr("Please enter PN No and Birthdate.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/public/water/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pnNo: pn,
          birthdate,
          onlyLast12, // ✅ send to server too (optional)
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Inquiry failed.");

      setData(json);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  const bills = (data?.bills || []).filter((b) => {
    if (!onlyLast12) return true;
    // prefer createdAt, fallback to dueDate
    return withinLast12Months(b.createdAt || b.dueDate);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-5">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-black">
              P
            </div>
            <div>
              <div className="text-sm font-semibold text-emerald-700">POWASSCO</div>
              <div className="text-xl font-bold text-slate-900">Member Bill Inquiry</div>
              <div className="text-xs text-slate-600 mt-1">
                Enter your PN No and Birthdate to view bills and payment history.
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-700">PN No</label>
              <input
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                value={pnNo}
                onChange={(e) => setPnNo(e.target.value)}
                placeholder="e.g. PN-000123"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Birthdate</label>
              <input
                type="date"
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <button
                disabled={loading}
                className="w-full rounded-2xl bg-emerald-600 text-white py-3 font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Checking..." : "Check Bills"}
              </button>
            </div>

            {/* ✅ toggle row */}
            <div className="md:col-span-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={onlyLast12}
                  onChange={(e) => setOnlyLast12(e.target.checked)}
                />
                Show only last 12 months
              </label>
            </div>
          </form>

          {err && (
            <div className="mt-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm font-semibold">
              {err}
            </div>
          )}
        </div>

        {data && (
          <div className="mt-5 grid grid-cols-1 gap-4">
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6">
              <div className="text-lg font-black text-slate-900">Account</div>
              <div className="mt-2 text-sm text-slate-700">
                <div><b>PN No:</b> {data.member?.pnNo}</div>
                <div><b>Account Name:</b> {data.member?.accountName}</div>
                <div><b>Status:</b> {data.member?.accountStatus}</div>
                <div><b>Classification:</b> {data.member?.classification}</div>
              </div>
            </div>

            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6 overflow-auto">
              <div className="flex items-center justify-between">
                <div className="text-lg font-black text-slate-900">Bills & Payments</div>
                <div className="text-xs text-slate-500">{bills.length} record(s)</div>
              </div>

              <table className="w-full text-sm mt-4">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Period</th>
                    <th className="py-3 px-4">Total Due</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Payments</th>
                  </tr>
                </thead>

                <tbody>
                  {bills.map((b) => (
                    <tr key={b._id} className="border-t align-top">
                      <td className="py-3 px-4 font-bold text-slate-900">{b.periodCovered}</td>
                      <td className="py-3 px-4">₱ {money(b.totalDue)}</td>
                      <td className="py-3 px-4">
                        {b.dueDate ? new Date(b.dueDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                            b.status === "paid"
                              ? "bg-green-50 border-green-200 text-green-700"
                              : b.status === "overdue"
                              ? "bg-red-50 border-red-200 text-red-700"
                              : "bg-amber-50 border-amber-200 text-amber-800"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {!b.payments || b.payments.length === 0 ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <div className="space-y-2">
                            {b.payments.map((p) => (
                              <div key={p._id || p.orNo} className="rounded-xl border border-slate-200 p-3">
                                <div className="text-xs text-slate-600">
                                  <b>OR:</b> {p.orNo} • <b>Method:</b> {p.method} •{" "}
                                  {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : ""}
                                </div>
                                <div className="text-sm font-bold text-slate-900">
                                  Amount: ₱ {money(p.amountPaid)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-3 text-xs text-slate-500">
                Note: This public inquiry shows limited information only.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
