import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";

const PAGE_SIZE = 12;

function thisPeriodKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function printReceipt(r) {
  const html = `
  <html>
    <head>
      <title>Meter Reading Receipt</title>
      <style>
        body{font-family:Arial;padding:16px}
        .box{border:1px solid #ddd;border-radius:10px;padding:14px;max-width:420px}
        h2{margin:0 0 8px 0}
        .row{display:flex;justify-content:space-between;margin:6px 0}
        .muted{color:#666;font-size:12px}
        hr{border:none;border-top:1px solid #eee;margin:10px 0}
      </style>
    </head>
    <body>
      <div class="box">
        <h2>POWASSCO Meter Reading</h2>
        <div class="muted">Period: ${r.periodCovered}</div>
        <hr/>
        <div class="row"><b>PN No</b><span>${r.pnNo}</span></div>
        <div class="row"><b>Account</b><span>${r.accountName}</span></div>
        <hr/>
        <div class="row"><b>Previous</b><span>${r.previousReading}</span></div>
        <div class="row"><b>Present</b><span>${r.presentReading}</span></div>
        <div class="row"><b>Consumed</b><span>${r.consumed}</span></div>
        <hr/>
        <div class="row"><b>Rate</b><span>₱ ${money(r.rateUsed)}</span></div>
        <div class="row"><b>Amount</b><span>₱ ${money(r.amount)}</span></div>
        <div class="row"><b>Penalty</b><span>₱ ${money(r.penaltyApplied)}</span></div>
        <div class="row"><b>Total Due</b><span><b>₱ ${money(r.totalDue)}</b></span></div>
        <div class="row"><b>Due Date</b><span>${new Date(r.dueDate).toLocaleDateString()}</span></div>
        <hr/>
        <div class="muted">Read at: ${new Date(r.readAt).toLocaleString()}</div>
        <div class="muted">Read by: ${r.readBy || "-"}</div>
      </div>
      <script>window.print();</script>
    </body>
  </html>`;
  const w = window.open("", "_blank", "width=520,height=720");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export default function MeterReadingsPanel() {
  const { token } = useAuth();

  const [periodKey, setPeriodKey] = useState(thisPeriodKey());
  const [q, setQ] = useState("");
  const [readStatus, setReadStatus] = useState("all"); // all|read|unread
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // encode modal
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const [presentReading, setPresentReading] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiFetch(
        `/water/readings?periodKey=${encodeURIComponent(periodKey)}&q=${encodeURIComponent(q)}&readStatus=${encodeURIComponent(readStatus)}&page=${page}&limit=${PAGE_SIZE}`,
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [periodKey, q, readStatus, page]);

  function openEncode(row) {
    setSel(row);
    setPresentReading(String(row.reading?.presentReading ?? ""));
    setSaveErr("");
    setOpen(true);
  }

  async function saveReading() {
    if (!sel) return;
    setSaving(true);
    setSaveErr("");
    try {
      const resp = await apiFetch("/water/readings", {
        method: "POST",
        token,
        body: {
          periodKey,
          pnNo: sel.pnNo,
          presentReading: Number(presentReading),
        },
      });

      setToast("✅ Reading saved + Bill generated");
      setTimeout(() => setToast(""), 2000);

      setOpen(false);
      await load();

      // print receipt automatically (optional)
      if (resp?.receipt) printReceipt(resp.receipt);
    } catch (e) {
      setSaveErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-black text-slate-900">Meter Readings</div>
          <div className="text-xs text-slate-600 mt-1">Encode readings per month. Bills auto-generate after saving.</div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={periodKey}
            onChange={(e) => { setPage(1); setPeriodKey(e.target.value); }}
            placeholder="YYYY-MM"
            className="w-full sm:w-32 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
          />

          <select
            value={readStatus}
            onChange={(e) => { setPage(1); setReadStatus(e.target.value); }}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>

          <input
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Search PN No / Account"
            className="w-full sm:w-80 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          />

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
              <th className="py-3 px-4">PN No.</th>
              <th className="py-3 px-4">Account Name</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Prev</th>
              <th className="py-3 px-4">Present</th>
              <th className="py-3 px-4">Read At</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-slate-600">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-slate-600">No members found.</td></tr>
            ) : (
              items.map((x) => (
                <tr key={x.pnNo} className="border-t hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-bold text-slate-900">{x.pnNo}</td>
                  <td className="py-3 px-4">{x.accountName}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                      x.hasReading ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}>
                      {x.hasReading ? "READ" : "UNREAD"}
                    </span>
                    <span className={`ml-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                      x.accountStatus === "disconnected" ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-100 border-slate-200 text-slate-700"
                    }`}>
                      {x.accountStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4">{x.reading?.previousReading ?? x.suggestedPreviousReading ?? 0}</td>
                  <td className="py-3 px-4">{x.reading?.presentReading ?? "—"}</td>
                  <td className="py-3 px-4">{x.reading?.readAt ? new Date(x.reading.readAt).toLocaleString() : "—"}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      className="rounded-xl bg-purple-600 text-white px-3 py-2 text-sm font-semibold hover:bg-purple-700"
                      onClick={() => openEncode(x)}
                    >
                      Encode
                    </button>
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
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <div className="text-sm font-semibold text-slate-700">Page {page} / {totalPages}</div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      </div>

      <Modal open={open} title="Encode Reading" onClose={() => setOpen(false)}>
        {sel && (
          <>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-bold text-slate-900">{sel.accountName}</div>
              <div className="text-xs text-slate-600 mt-1">{sel.pnNo} • {periodKey}</div>
              <div className="text-sm font-black text-slate-900 mt-2">
                Previous: {sel.reading?.previousReading ?? sel.suggestedPreviousReading ?? 0}
              </div>
            </div>

            <div className="mt-3">
              <label className="text-sm font-semibold text-slate-700">Present Reading</label>
              <input
                type="number"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                value={presentReading}
                onChange={(e) => setPresentReading(e.target.value)}
              />
            </div>

            {saveErr && (
              <div className="mt-3 rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">
                {saveErr}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-200 px-4 py-2.5" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                disabled={saving}
                className="rounded-xl bg-purple-600 text-white px-4 py-2.5 font-semibold hover:bg-purple-700 disabled:opacity-60"
                onClick={saveReading}
              >
                {saving ? "Saving..." : "Save + Print"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}
