// BillsPanel.jsx (UPDATED for Option C: separate bill per meter)
// ✅ Fixes:
// - Create Bill flow supports multiple meters properly (billing meters derived even if virtuals missing)
// - Auto-fills previousReading from selected meter.lastReading
// - Uses meterNumber + periodKey logic in preview/create payloads
// - UI stays same, but meter selection is reliable

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

// ✅ robust: works even if backend doesn't include virtuals (billingMeters)
function getBillingMeters(member) {
  if (Array.isArray(member?.billingMeters) && member.billingMeters.length > 0) {
    return [...member.billingMeters].sort((a, b) => (a.billingSequence || 0) - (b.billingSequence || 0));
  }
  const meters = member?.meters || [];
  return meters
    .filter((m) => m?.meterStatus === "active" && m?.isBillingActive === true)
    .sort((a, b) => (a.billingSequence || 0) - (b.billingSequence || 0));
}

function normUpper(v) {
  return String(v || "").toUpperCase().trim();
}

export default function BillsPanel() {
  const { token } = useAuth();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState(""); // "" | "unpaid" | "overdue" | "paid"
  const [classification, setClassification] = useState(""); // "" | "residential" | "commercial"
  const [period, setPeriod] = useState(""); // YYYY-MM
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({});

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  // Create New Bill Modal (Option C)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createStep, setCreateStep] = useState("search"); // "search" | "meter" | "details" | "preview"
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [pnSearch, setPnSearch] = useState("");
  const [memberInfo, setMemberInfo] = useState(null);
  const [billPreview, setBillPreview] = useState(null);
  const [createForm, setCreateForm] = useState({
    pnNo: "",
    periodCovered: "",
    previousReading: "",
    presentReading: "",
    readingDate: new Date().toISOString().split("T")[0],
    remarks: "",
    meterNumber: "",
  });

  // pay modal
  const [payOpen, setPayOpen] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [payForm, setPayForm] = useState({ orNo: "", method: "cash" });
  const [payBill, setPayBill] = useState(null);

  // bill details modal
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // Period options (last 12 months)
  const periodOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      options.push({ value, label });
    }
    return options;
  }, []);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      let url = `/water/bills?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=${page}&limit=${PAGE_SIZE}`;

      if (classification) url += `&classification=${encodeURIComponent(classification)}`;

      if (period) {
        url += `&month=${period.split("-")[1]}&year=${period.split("-")[0]}`;
      }

      const data = await apiFetch(url, { token });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSummary(data.summary || {});
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [q, status, classification, period, page]);

  function openPay(b) {
    setPayErr("");
    setPayBill(b);
    setPayForm({ orNo: "", method: "cash" });
    setPayOpen(true);
  }

  function openDetails(b) {
    setSelectedBill(b);
    setDetailsOpen(true);
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

  // ---------- Create Bill (Option C) ----------
  function getCurrentPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function openCreateModal() {
    setCreateModalOpen(true);
    setCreateStep("search");
    setCreateError("");
    setCreateLoading(false);
    setPnSearch("");
    setMemberInfo(null);
    setBillPreview(null);
    setCreateForm({
      pnNo: "",
      periodCovered: getCurrentPeriod(),
      previousReading: "",
      presentReading: "",
      readingDate: new Date().toISOString().split("T")[0],
      remarks: "",
      meterNumber: "",
    });
  }

  async function searchMember() {
    if (!pnSearch.trim()) {
      setCreateError("Please enter a PN Number");
      return;
    }

    setCreateLoading(true);
    setCreateError("");

    try {
      const member = await apiFetch(`/water/members/pn/${pnSearch.trim()}`, { token });

      if (!member) {
        setCreateError("Member not found");
        return;
      }

      if (member.accountStatus !== "active") {
        setCreateError(`Account is ${member.accountStatus}. Cannot create bill.`);
        return;
      }

      const meters = getBillingMeters(member);
      if (meters.length === 0) {
        setCreateError("No active billing meters found for this account.");
        return;
      }

      setMemberInfo(member);

      // Default to first billing meter but still allow selection
      const first = meters[0];

      setCreateForm((prev) => ({
        ...prev,
        pnNo: normUpper(member.pnNo),
        periodCovered: prev.periodCovered || getCurrentPeriod(),
        meterNumber: first?.meterNumber || "",
        previousReading: first?.lastReading ?? 0,
        presentReading: "",
      }));

      // If multiple billing meters, go meter step
      if (meters.length > 1) setCreateStep("meter");
      else setCreateStep("details");
    } catch (e) {
      setCreateError(e.message || "Failed to find member");
    } finally {
      setCreateLoading(false);
    }
  }

  function chooseMeter(meterNumber) {
    if (!memberInfo) return;

    const mn = normUpper(meterNumber);
    const meters = getBillingMeters(memberInfo);
    const meter = meters.find((m) => normUpper(m.meterNumber) === mn);

    setCreateForm((prev) => ({
      ...prev,
      meterNumber: meter?.meterNumber || mn,
      previousReading: meter?.lastReading ?? 0,
      presentReading: "",
    }));

    setCreateStep("details");
  }

  async function generatePreview() {
    // required
    if (!createForm.pnNo || !createForm.meterNumber) {
      setCreateError("PN No and meter are required");
      return;
    }
    if (createForm.previousReading === "" || createForm.presentReading === "") {
      setCreateError("Previous and present readings are required");
      return;
    }

    const prev = parseFloat(createForm.previousReading);
    const pres = parseFloat(createForm.presentReading);

    if (!Number.isFinite(prev) || !Number.isFinite(pres)) {
      setCreateError("Please enter valid numbers for readings");
      return;
    }
    if (pres < prev) {
      setCreateError("Present reading cannot be less than previous reading");
      return;
    }

    setCreateLoading(true);
    setCreateError("");

    try {
      const preview = await apiFetch("/water/bills/preview", {
        method: "POST",
        token,
        body: {
          pnNo: createForm.pnNo,
          previousReading: prev,
          presentReading: pres,
          meterNumber: createForm.meterNumber, // ✅ Option C
          periodCovered: createForm.periodCovered, // optional if you want for display
        },
      });

      setBillPreview(preview);
      setCreateStep("preview");
    } catch (e) {
      setCreateError(e.message || "Failed to generate preview");
    } finally {
      setCreateLoading(false);
    }
  }

  async function createBill() {
    setCreateLoading(true);
    setCreateError("");

    try {
      const payload = {
        pnNo: createForm.pnNo,
        periodCovered: createForm.periodCovered,
        meterNumber: createForm.meterNumber, // ✅ Option C (identity)
        previousReading: parseFloat(createForm.previousReading),
        presentReading: parseFloat(createForm.presentReading),
        readingDate: createForm.readingDate,
        remarks: createForm.remarks || "",
      };

      await apiFetch("/water/bills", {
        method: "POST",
        token,
        body: payload,
      });

      setCreateModalOpen(false);
      setToast("✅ Bill created successfully");
      setTimeout(() => setToast(""), 2000);
      load();
    } catch (e) {
      setCreateError(e.message || "Failed to create bill");
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-black text-slate-900">Bills</div>
          <div className="text-xs text-slate-600 mt-1">
            Option C: Separate bills per meter • Search PN / Name • Filter status • Pay bills with OR and method.
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openCreateModal}
              className="rounded-2xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
            >
              + Create New Bill
            </button>

            <input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="Search PN / Account / Period / Meter"
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
              <option value="">All Status</option>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
              <option value="paid">Paid</option>
            </select>

            <select
              value={classification}
              onChange={(e) => {
                setPage(1);
                setClassification(e.target.value);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All Classes</option>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
            </select>

            <select
              value={period}
              onChange={(e) => {
                setPage(1);
                setPeriod(e.target.value);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All Periods</option>
              {periodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Summary Stats */}
          {summary?.totalBills > 0 && (
            <div className="flex flex-wrap gap-3 mt-2">
              <div className="text-xs text-slate-600">
                Total: <span className="font-bold">{summary.totalBills}</span> bills | Amount:{" "}
                <span className="font-bold text-emerald-600">₱{money(summary.totalAmount || 0)}</span>
              </div>
              {summary.totalDiscount > 0 && (
                <div className="text-xs text-slate-600">
                  Discounts: <span className="font-bold text-blue-600">₱{money(summary.totalDiscount || 0)}</span>
                </div>
              )}
              {summary.totalPenalty > 0 && (
                <div className="text-xs text-slate-600">
                  Penalties: <span className="font-bold text-red-600">₱{money(summary.totalPenalty || 0)}</span>
                </div>
              )}
              {summary.withoutTariff > 0 && (
                <div className="text-xs text-amber-600">
                  ⚠️ <span className="font-bold">{summary.withoutTariff}</span> bills need tariff review
                </div>
              )}
            </div>
          )}
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
              <th className="py-3 px-4">Class</th>
              <th className="py-3 px-4">Period</th>
              <th className="py-3 px-4">Consumption</th>
              <th className="py-3 px-4">Meter</th>
              <th className="py-3 px-4">Tier</th>
              <th className="py-3 px-4">Rate</th>
              <th className="py-3 px-4">Base Amount</th>
              <th className="py-3 px-4">Discount</th>
              <th className="py-3 px-4">Penalty</th>
              <th className="py-3 px-4">Total Due</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={14} className="py-10 text-center text-slate-600">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={14} className="py-10 text-center text-slate-600">
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

                const classificationBadge =
                  b.classification === "residential" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800";

                const hasTariff = !!b.tariffUsed;
                const needsReview = b.needsTariffReview || !hasTariff;

                return (
                  <tr key={b._id} className={`border-t hover:bg-slate-50/60 ${needsReview ? "bg-amber-50/30" : ""}`}>
                    <td className="py-3 px-4 font-bold text-slate-900">{b.pnNo}</td>
                    <td className="py-3 px-4 max-w-[180px] truncate">{b.accountName}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-bold ${classificationBadge}`}>
                        {b.classification?.slice(0, 3) || "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4">{b.periodCovered}</td>
                    <td className="py-3 px-4 font-semibold">{Number(b.consumed || 0)} m³</td>
                    <td className="py-3 px-4 text-xs font-bold text-slate-900">{b.meterNumber || "—"}</td>
                    <td className="py-3 px-4 text-xs">
                      {hasTariff ? b.tariffUsed.tier : <span className="text-amber-600" title="No tariff applied">—</span>}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {hasTariff ? `₱${Number(b.tariffUsed.ratePerCubic || 0).toFixed(2)}` : <span className="text-amber-600 text-xs">—</span>}
                    </td>
                    <td className="py-3 px-4">₱{money(b.baseAmount || b.amount)}</td>
                    <td className="py-3 px-4">
                      {Number(b.discount || 0) > 0 ? (
                        <div className="flex flex-col">
                          <span className="text-emerald-600 font-bold">-₱{money(b.discount)}</span>
                          {b.discountReason && (
                            <span className="text-xs text-slate-500 truncate max-w-[100px]" title={b.discountReason}>
                              {b.discountReason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {Number(b.penaltyApplied || 0) > 0 ? (
                        <span className="text-red-600 font-bold">₱{money(b.penaltyApplied)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold">₱{money(b.totalDue)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${badge}`}>
                        {b.status}
                      </span>
                      {needsReview && (
                        <div className="mt-1 text-[10px] text-amber-600" title="Needs tariff review">
                          ⚠️ Review
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                        onClick={() => openDetails(b)}
                        title="View Details"
                      >
                        View
                      </button>
                      {canPay ? (
                        <button
                          className="rounded-xl bg-slate-900 text-white px-3 py-2 text-xs font-semibold hover:opacity-90"
                          onClick={() => openPay(b)}
                        >
                          Pay
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">Paid {b.paidAt ? new Date(b.paidAt).toLocaleDateString() : ""}</span>
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
          Showing <b>{items.length}</b> of <b>{total}</b> bills
          {summary.withoutTariff > 0 && (
            <span className="ml-2 text-amber-600">
              • <b>{summary.withoutTariff}</b> need tariff review
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </button>

          <div className="text-sm font-semibold text-slate-700">
            Page {page} / {totalPages}
          </div>

          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </button>
        </div>
      </div>

      {/* Create New Bill Modal */}
      <Modal open={createModalOpen} title="Create New Bill (Per Meter)" onClose={() => setCreateModalOpen(false)} size="lg">
        <div className="space-y-4">
          {createStep === "search" && (
            <>
              <div className="text-sm text-slate-600">Enter the PN Number to start creating a bill.</div>

              <div>
                <label className="text-sm font-semibold text-slate-700">PN Number</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  value={pnSearch}
                  onChange={(e) => setPnSearch(e.target.value.toUpperCase())}
                  placeholder="PN-001"
                  onKeyDown={(e) => e.key === "Enter" && searchMember()}
                />
              </div>

              {createError && <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">{createError}</div>}

              <div className="flex justify-end gap-2">
                <button className="rounded-xl border border-slate-200 px-4 py-2.5" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button className="rounded-xl bg-emerald-600 text-white px-4 py-2.5 font-semibold hover:bg-emerald-700" onClick={searchMember} disabled={createLoading}>
                  {createLoading ? "Searching..." : "Find Member"}
                </button>
              </div>
            </>
          )}

          {createStep === "meter" && memberInfo && (
            <>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="font-bold text-blue-900">{memberInfo.accountName}</div>
                <div className="text-sm text-blue-700 mt-1">PN No: {memberInfo.pnNo}</div>
                <div className="text-sm text-blue-700">Classification: {memberInfo.billing?.classification || "residential"}</div>
              </div>

              <div className="text-sm text-slate-600">Select which meter to bill:</div>

              <div className="space-y-2">
                {getBillingMeters(memberInfo).map((meter, index) => {
                  const active = normUpper(createForm.meterNumber) === normUpper(meter.meterNumber);
                  return (
                    <button
                      key={meter.meterNumber || index}
                      type="button"
                      className={`w-full text-left p-3 border rounded-xl ${
                        active ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                      }`}
                      onClick={() => chooseMeter(meter.meterNumber)}
                    >
                      <div className="font-bold text-slate-900">{meter.meterNumber}</div>
                      <div className="text-xs text-slate-600 mt-1">
                        {meter.meterBrand} {meter.meterModel} • Size: {meter.meterSize || "—"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Last reading: {Number(meter.lastReading || 0).toFixed(2)} • Location: {meter.location?.description || "—"}
                      </div>
                    </button>
                  );
                })}
              </div>

              {createError && <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">{createError}</div>}

              <div className="flex justify-end gap-2">
                <button className="rounded-xl border border-slate-200 px-4 py-2.5" onClick={() => setCreateStep("search")}>
                  Back
                </button>
                <button className="rounded-xl bg-emerald-600 text-white px-4 py-2.5 font-semibold hover:bg-emerald-700" onClick={() => setCreateStep("details")} disabled={!createForm.meterNumber}>
                  Continue
                </button>
              </div>
            </>
          )}

          {createStep === "details" && memberInfo && (
            <>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="font-bold text-blue-900">{memberInfo.accountName}</div>
                <div className="text-sm text-blue-700 mt-1">
                  PN No: {memberInfo.pnNo} • Classification: {memberInfo.billing?.classification || "residential"} • Meter:{" "}
                  <span className="font-bold">{createForm.meterNumber || "—"}</span>
                </div>
                {memberInfo.personal?.isSeniorCitizen && (
                  <div className="text-sm text-amber-700 mt-1">👴 Senior Citizen • Discount Rate: {memberInfo.personal?.seniorDiscountRate || 5}%</div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Period Covered">
                  <input
                    type="month"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                    value={createForm.periodCovered}
                    onChange={(e) => setCreateForm({ ...createForm, periodCovered: e.target.value })}
                  />
                </Field>

                <Field label="Reading Date">
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                    value={createForm.readingDate}
                    onChange={(e) => setCreateForm({ ...createForm, readingDate: e.target.value })}
                  />
                </Field>

                <Field label="Previous Reading (m³)" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                    value={createForm.previousReading}
                    onChange={(e) => setCreateForm({ ...createForm, previousReading: e.target.value })}
                    placeholder="0"
                  />
                </Field>

                <Field label="Present Reading (m³)" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                    value={createForm.presentReading}
                    onChange={(e) => setCreateForm({ ...createForm, presentReading: e.target.value })}
                    placeholder="0"
                  />
                </Field>

                <Field label="Remarks (Optional)">
                  <input
                    type="text"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                    value={createForm.remarks}
                    onChange={(e) => setCreateForm({ ...createForm, remarks: e.target.value })}
                    placeholder="e.g., Meter reading notes"
                  />
                </Field>
              </div>

              {createError && <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">{createError}</div>}

              <div className="flex justify-end gap-2">
                <button className="rounded-xl border border-slate-200 px-4 py-2.5" onClick={() => setCreateStep(getBillingMeters(memberInfo).length > 1 ? "meter" : "search")}>
                  Back
                </button>
                <button className="rounded-xl bg-emerald-600 text-white px-4 py-2.5 font-semibold hover:bg-emerald-700" onClick={generatePreview} disabled={createLoading || !createForm.previousReading || !createForm.presentReading}>
                  {createLoading ? "Generating..." : "Preview Bill"}
                </button>
              </div>
            </>
          )}

          {createStep === "preview" && billPreview && (
            <>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="font-bold text-emerald-900">Bill Preview</div>
                <div className="text-sm text-emerald-700 mt-1">Review the bill details before creating.</div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Account Name" value={billPreview.accountName} />
                  <Info label="PN Number" value={billPreview.pnNo} />
                  <Info label="Classification" value={billPreview.classification} />
                  <Info label="Meter Number" value={billPreview.meterNumber} />
                  <Info label="Previous Reading" value={billPreview.previousReading} />
                  <Info label="Present Reading" value={billPreview.presentReading} />
                  <Info label="Consumption" value={`${billPreview.consumption} m³`} />
                  <Info label="Period" value={createForm.periodCovered} />
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Base Amount</span>
                    <span className="font-bold">₱{money(billPreview.preview?.baseAmount || 0)}</span>
                  </div>
                  {Number(billPreview.preview?.discount || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount ({billPreview.preview?.discountReason || "Discount"})</span>
                      <span className="font-bold">-₱{money(billPreview.preview?.discount || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-black">
                    <span>Total</span>
                    <span>₱{money(billPreview.preview?.amount || 0)}</span>
                  </div>
                  {billPreview.preview?.tariffUsed && (
                    <div className="text-xs text-slate-500">
                      Tariff: {billPreview.preview.tariffUsed.tier} @ ₱{Number(billPreview.preview.tariffUsed.ratePerCubic || 0).toFixed(2)}/m³
                    </div>
                  )}
                </div>
              </div>

              {createError && <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">{createError}</div>}

              <div className="flex justify-end gap-2">
                <button className="rounded-xl border border-slate-200 px-4 py-2.5" onClick={() => setCreateStep("details")}>
                  Back
                </button>
                <button className="rounded-xl bg-emerald-600 text-white px-4 py-2.5 font-semibold hover:bg-emerald-700" onClick={createBill} disabled={createLoading}>
                  {createLoading ? "Creating..." : "Create Bill"}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Bill Details Modal */}
      <Modal open={detailsOpen} title="Bill Details" onClose={() => setDetailsOpen(false)} size="lg">
        {selectedBill && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900 text-lg">{selectedBill.accountName}</div>
              <div className="text-sm text-slate-600 mt-1">
                {selectedBill.pnNo} • {selectedBill.classification?.toUpperCase()} • {selectedBill.periodCovered} • Meter{" "}
                <span className="font-bold">{selectedBill.meterNumber}</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">{selectedBill.addressText || "No address"}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Pay Modal */}
      <Modal open={payOpen} title="Pay Bill" onClose={() => setPayOpen(false)}>
        {payBill && (
          <>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-bold text-slate-900">{payBill.accountName}</div>
              <div className="text-xs text-slate-600 mt-1">
                {payBill.pnNo} • {payBill.periodCovered} • Meter {payBill.meterNumber}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="text-slate-600">Base Amount</div>
                <div className="text-right font-semibold">₱ {money(payBill.baseAmount || payBill.amount)}</div>

                {payBill.discount > 0 && (
                  <>
                    <div className="text-slate-600">Discount</div>
                    <div className="text-right font-semibold text-emerald-600">-₱ {money(payBill.discount)}</div>
                  </>
                )}

                <div className="text-slate-600">Penalty</div>
                <div className="text-right font-semibold text-red-600">₱ {money(payBill.penaltyApplied)}</div>

                <div className="text-slate-900 font-bold">Total Due</div>
                <div className="text-right text-slate-900 font-black">₱ {money(payBill.totalDue)}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="OR No.">
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={payForm.orNo} onChange={(e) => setPayForm({ ...payForm, orNo: e.target.value })} />
              </Field>

              <Field label="Payment Method">
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank">Bank</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>

            {payErr && <div className="mt-3 rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">{payErr}</div>}

            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-200 px-4 py-2.5" onClick={() => setPayOpen(false)}>
                Cancel
              </button>
              <button className="rounded-xl bg-slate-900 text-white px-4 py-2.5 font-semibold hover:opacity-90" onClick={payNow}>
                Confirm Payment
              </button>
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}

function Field({ label, children, required = false }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
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
