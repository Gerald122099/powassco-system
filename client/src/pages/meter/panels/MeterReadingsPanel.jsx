import { useState, useEffect, useRef, useMemo } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import {
  Printer,
  Download,
  FileText,
  Search,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const PAGE_SIZE = 10;

export default function MeterReadingsPanel() {
  const { token } = useAuth();

  // States
  const [searchTerm, setSearchTerm] = useState("");
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [members, setMembers] = useState([]);
  const [readings, setReadings] = useState({});
  const [expandedMeters, setExpandedMeters] = useState({});
  const [loading, setLoading] = useState(false);

  const [selectedMember, setSelectedMember] = useState(null);
  const [preview, setPreview] = useState(null);
  const [receiptData, setReceiptData] = useState(null);

  const [batchMode, setBatchMode] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    total: 0,
    read: 0,     // complete
    unread: 0,   // none read
    anyRead: 0,  // partial+complete
  });

  const [waterSettings, setWaterSettings] = useState(null);

  // all | unread | partial | complete
  const [statusFilter, setStatusFilter] = useState("all");

  const receiptRef = useRef();

  // ---------- helpers ----------
  const safeUpper = (v) => String(v || "").toUpperCase().trim();
  const safeStr = (v) => String(v || "").trim();

  const getActiveBillingMeters = (member) => {
    const meters = member?.meters || [];
    return meters.filter((m) => m?.meterStatus === "active" && m?.isBillingActive === true);
  };

  // at least 1 meter has input presentReading (UI input, not saved yet)
  const hasAnyInputForMember = (member) => {
    const pn = member?.pnNo;
    if (!pn) return false;

    const active = member.activeBillingMeters || getActiveBillingMeters(member);
    if (!active.length) return false;

    return active.some((m) => {
      const mn = safeUpper(m.meterNumber);
      const val = readings[pn]?.[mn]?.presentReading;
      // ✅ consider only input boxes (not saved status)
      return safeStr(val) !== "";
    });
  };

  // complete input (all active meters have input) - preview requires this
  const hasCompleteInputForMember = (member) => {
    const pn = member?.pnNo;
    if (!pn) return false;

    const active = member.activeBillingMeters || getActiveBillingMeters(member);
    if (!active.length) return false;

    // if meter is already saved, treat it as "complete" for preview requirement?
    // Here we require ALL meters to have either:
    //  - already saved (readMeters), OR
    //  - user typed input
    const readSet = new Set((member.readMeters || []).map(safeUpper));

    return active.every((m) => {
      const mn = safeUpper(m.meterNumber);
      if (readSet.has(mn)) return true;
      const val = readings[pn]?.[mn]?.presentReading;
      return safeStr(val) !== "";
    });
  };

  // derive member status: unread | partial | complete
  const getMemberStatus = (member) => {
    if (member?.hasReading) return "complete";
    if (member?.hasAnyReading) return "partial";
    return "unread";
  };

  // ---------- load water settings ----------
  useEffect(() => {
    loadWaterSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWaterSettings = async () => {
    try {
      const settings = await apiFetch("/water/settings", { token });
      setWaterSettings(settings);
    } catch (error) {
      console.error("Failed to load water settings:", error);
    }
  };

  // ---------- load members ----------
  const loadMembers = async () => {
    setLoading(true);
    try {
      const response = await apiFetch(
        `/water/readings/members?periodKey=${periodKey}&page=${page}&limit=${PAGE_SIZE}&search=${encodeURIComponent(
          searchTerm
        )}`,
        { token }
      );

      const processed = (response.items || []).map((member) => {
        const activeBillingMeters = getActiveBillingMeters(member);

        return {
          ...member,
          pnNo: member.pnNo,
          meters: member.meters || [],
          activeBillingMeters,
          hasMultipleMeters: activeBillingMeters.length > 1,
          totalMeters: (member.meters || []).length,
          activeMeters: activeBillingMeters.length,

          // ensure arrays exist
          readMeters: Array.isArray(member.readMeters) ? member.readMeters.map(safeUpper) : [],
          missingMeters: Array.isArray(member.missingMeters) ? member.missingMeters.map(safeUpper) : [],
          hasAnyReading: !!member.hasAnyReading,
        };
      });

      setMembers(processed);
      setTotalPages(response.totalPages || 1);

      setStats({
        total: response.total || processed.length || 0,
        read: response.readCount || 0,
        unread: response.unreadCount ?? 0,
        anyRead: response.anyReadCount ?? 0,
      });
    } catch (error) {
      console.error("Error loading members:", error);
      alert("Failed to load members: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // reload on period/page
  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey, page]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (page === 1) loadMembers();
      else setPage(1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // ---------- UI filter ----------
  const filteredMembers = useMemo(() => {
    let list = [...members];

    // status filter
    if (statusFilter !== "all") {
      list = list.filter((m) => getMemberStatus(m) === statusFilter);
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, statusFilter]);

  // ---------- handlers ----------
  const handleReadingChange = (pnNo, meterNumber, value) => {
    const pn = safeUpper(pnNo);
    const mn = safeUpper(meterNumber);

    setReadings((prev) => ({
      ...prev,
      [pn]: {
        ...(prev[pn] || {}),
        [mn]: {
          ...(prev[pn]?.[mn] || {}),
          presentReading: value,
        },
      },
    }));
  };

  const toggleMeterExpansion = (pnNo) => {
    const pn = safeUpper(pnNo);
    setExpandedMeters((prev) => ({
      ...prev,
      [pn]: !prev[pn],
    }));
  };

  // ---------- preview ----------
  const previewSingleBill = async (member) => {
    setSelectedMember(member);

    const complete = hasCompleteInputForMember(member);
    if (!complete) {
      alert("Preview requires readings for ALL active meters (saved or typed). You can still Save/Bill with partial.");
      return;
    }

    setLoading(true);
    try {
      const readSet = new Set((member.readMeters || []).map(safeUpper));

      const meterReadings = (member.activeBillingMeters || []).map((meter) => {
        const mn = safeUpper(meter.meterNumber);

        // If already saved, we do NOT have the exact presentReading value here (members endpoint does not return it).
        // So preview should be done only after user enters all (or you extend API to include reading values).
        // We still attempt preview using typed values only:
        const typed = readings[member.pnNo]?.[mn]?.presentReading;

        if (readSet.has(mn) && safeStr(typed) === "") {
          // Not enough info to preview accurately unless API returns per-meter reading numbers.
          // Force user to type the remaining values OR upgrade API to return saved readings per meter.
          throw new Error("Some meters are already saved but no values are available for preview. Enter remaining meter values or extend API to return saved readings.");
        }

        return {
          meterNumber: meter.meterNumber,
          previousReading: meter.lastReading || 0,
          presentReading: parseFloat(typed || 0),
          consumptionMultiplier: meter.consumptionMultiplier || 1,
        };
      });

      const totalConsumption = meterReadings.reduce((sum, r) => {
        return sum + (r.presentReading - r.previousReading) * r.consumptionMultiplier;
      }, 0);

      const data = await apiFetch("/water/bills/preview", {
        method: "POST",
        token,
        body: {
          pnNo: member.pnNo,
          periodKey,
          classification: member.billing?.classification || "residential",
          consumption: totalConsumption,
          meterReadings,
        },
      });

      if (data) {
        setPreview({
          ...data,
          member,
          meterReadings,
          totalConsumption,
        });
      } else {
        calculateLocalPreview(member, meterReadings, totalConsumption);
      }
    } catch (err) {
      console.error("preview error", err);
      alert(err?.message || "Preview failed.");
    } finally {
      setLoading(false);
    }
  };

  const calculateLocalPreview = async (member, meterReadings, totalConsumption) => {
    try {
      if (!waterSettings) {
        alert("Water settings not loaded. Please try again.");
        return;
      }

      const classification = member.billing?.classification || "residential";
      const tariffs = waterSettings.tariffs?.[classification] || [];

      let amount = 0;
      let rateUsed = 0;
      let tariffTier = "";

      for (const tier of tariffs) {
        if (tier.isActive && totalConsumption >= tier.minConsumption && totalConsumption <= tier.maxConsumption) {
          amount = totalConsumption * (tier.ratePerCubic || 0);
          rateUsed = tier.ratePerCubic || 0;
          tariffTier = tier.tier || "";
          break;
        }
      }

      let discount = 0;
      if (member.personal?.isSeniorCitizen && waterSettings.seniorDiscount) {
        const applicableTiers = waterSettings.seniorDiscount.applicableTiers || [];
        const discountRate = waterSettings.seniorDiscount.discountRate || 0;
        if (applicableTiers.includes(tariffTier) && discountRate > 0) {
          discount = amount * (discountRate / 100);
          amount -= discount;
        }
      }

      setPreview({
        pnNo: member.pnNo,
        accountName: member.accountName,
        classification,
        periodKey,
        consumption: totalConsumption.toFixed(3),
        preview: {
          baseAmount: amount,
          amount,
          discount,
          discountReason: discount > 0 ? "Senior Discount" : "",
          tariffUsed: { tier: tariffTier, ratePerCubic: rateUsed },
        },
        member,
        meterReadings,
        totalConsumption,
      });
    } catch (e) {
      console.error(e);
      alert("Could not generate preview.");
    }
  };

  // ---------- save (PARTIAL allowed) ----------
  const saveReading = async (member, generateBill = true) => {
    const pn = member.pnNo;
    const readSet = new Set((member.readMeters || []).map(safeUpper));

    // Collect ONLY meters with input (partial allowed)
    // ✅ skip meters that are already saved
    const toSend = (member.activeBillingMeters || [])
      .map((meter) => {
        const mn = safeUpper(meter.meterNumber);
        if (readSet.has(mn)) return null; // already saved -> skip

        const input = readings[pn]?.[mn]?.presentReading;
        if (safeStr(input) === "") return null;

        const prev = meter.lastReading || 0;
        const pres = parseFloat(input);

        if (!Number.isFinite(pres)) {
          return { error: `Invalid present reading for meter ${meter.meterNumber}` };
        }
        if (pres < prev) {
          return { error: `Present reading must be >= previous reading for meter ${meter.meterNumber}` };
        }

        return {
          meterNumber: meter.meterNumber,
          previousReading: prev,
          presentReading: pres,
          consumptionMultiplier: meter.consumptionMultiplier || 1,
        };
      })
      .filter(Boolean);

    const errItem = toSend.find((x) => x?.error);
    if (errItem) {
      alert(errItem.error);
      return;
    }

    if (toSend.length === 0) {
      alert("Enter at least 1 NEW meter reading before saving.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch("/water/readings", {
        method: "POST",
        token,
        body: {
          periodKey,
          pnNo: member.pnNo,
          meterReadings: toSend,
          generateBill,
        },
      });

      if (response?.receipt && generateBill) {
        setReceiptData(response.receipt);
      } else {
        // show result summary if you want
        setReceiptData(response);
      }

      await loadMembers();

      // clear inputs for this member only
      setReadings((prev) => {
        const copy = { ...prev };
        delete copy[pn];
        return copy;
      });

      alert(generateBill ? "Saved and bill updated!" : "Saved!");
    } catch (error) {
      alert("Error saving: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------- batch save (PARTIAL allowed per member) ----------
  const saveBatchReadings = async () => {
    const items = [];

    members.forEach((member) => {
      const pn = member.pnNo;
      const active = member.activeBillingMeters || [];
      const readSet = new Set((member.readMeters || []).map(safeUpper));

      const meterReadings = active
        .map((meter) => {
          const mn = safeUpper(meter.meterNumber);
          if (readSet.has(mn)) return null;

          const input = readings[pn]?.[mn]?.presentReading;
          if (safeStr(input) === "") return null;

          const prev = meter.lastReading || 0;
          const pres = parseFloat(input);
          if (!Number.isFinite(pres) || pres < prev) return null;

          return {
            meterNumber: meter.meterNumber,
            previousReading: prev,
            presentReading: pres,
            consumptionMultiplier: meter.consumptionMultiplier || 1,
          };
        })
        .filter(Boolean);

      if (meterReadings.length > 0) {
        items.push({
          periodKey,
          pnNo: pn,
          meterReadings,
          generateBill: true,
        });
      }
    });

    if (items.length === 0) {
      alert("No NEW readings to save.");
      return;
    }

    if (!confirm(`Save ${items.length} members (partial allowed) and update bills?`)) return;

    setLoading(true);
    try {
      const response = await apiFetch("/water/readings/batch", {
        method: "POST",
        token,
        body: { items },
      });

      await loadMembers();
      setReadings({});
      setReceiptData(response);
      alert(`Batch done. Success: ${response.success || 0}, Failed: ${response.failed || 0}`);
    } catch (e) {
      alert("Batch error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------- export CSV ----------
  const exportToCSV = async () => {
    try {
      const res = await fetch(`/api/water/readings/export/csv?periodKey=${periodKey}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Export endpoint not available");
      const blob = await res.blob();

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meter_readings_${periodKey}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("CSV export not available (API missing).");
    }
  };

  // ---------- print ----------
  const printReceipt = () => {
    if (!receiptRef.current) return;

    const w = window.open("", "_blank");
    w.document.write(`
      <html>
        <head>
          <title>Result</title>
          <style>
            @media print {
              body { margin:0; font-family: Arial, sans-serif; }
              .receipt { width: 80mm; margin: 0 auto; padding: 10px; }
              .header { text-align:center; border-bottom: 1px dashed #000; padding-bottom:10px; margin-bottom:10px; }
              @page { margin:0; }
            }
          </style>
        </head>
        <body>${receiptRef.current.innerHTML}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const batchCount = useMemo(() => Object.keys(readings || {}).length, [readings]);

  return (
    <Card>
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-lg font-black text-slate-900">Meter Reading & Bill Generation</div>
            <div className="text-xs text-slate-600 mt-1">
              Partial reading is allowed. Saved meters are locked for the same period.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
              disabled={loading}
            >
              <Download size={16} />
              Export CSV
            </button>

            <button
              onClick={() => setBatchMode((s) => !s)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${
                batchMode ? "bg-purple-600 text-white hover:bg-purple-700" : "border border-slate-200 hover:bg-slate-50"
              }`}
              disabled={loading}
            >
              <FileText size={16} />
              {batchMode ? "Single Mode" : "Batch Mode"}
            </button>

            {batchMode && batchCount > 0 && (
              <button
                onClick={saveBatchReadings}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
              >
                <CheckCircle size={16} />
                {loading ? "Saving..." : `Save ${batchCount} Members`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Period + Search + Status filter */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <label className="text-sm font-semibold text-slate-700">Billing Period</label>
          <input
            type="month"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
            value={periodKey}
            onChange={(e) => {
              setPeriodKey(e.target.value);
              setPage(1);
            }}
            disabled={loading}
          />
        </div>

        <div className="md:col-span-3">
          <label className="text-sm font-semibold text-slate-700">Search Members</label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="PN No, Account Name, Meter, Address..."
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700">Status</label>
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            disabled={loading}
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="partial">Partial</option>
            <option value="complete">Complete</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Total</div>
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="text-xs text-green-600">Complete</div>
          <div className="text-2xl font-bold text-green-700">{stats.read}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs text-amber-600">Unread</div>
          <div className="text-2xl font-bold text-amber-700">{stats.unread}</div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-xs text-blue-600">Any Read</div>
          <div className="text-2xl font-bold text-blue-700">{stats.anyRead}</div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-2xl border border-slate-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">PN No.</th>
              <th className="py-3 px-4">Account Name</th>
              <th className="py-3 px-4">Address</th>
              <th className="py-3 px-4">Meters</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-600">
                  Loading...
                </td>
              </tr>
            ) : filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-600">
                  No members found.
                </td>
              </tr>
            ) : (
              filteredMembers.map((member) => (
                <ReadingRow
                  key={member.pnNo}
                  member={member}
                  readings={readings}
                  expandedMeters={expandedMeters}
                  batchMode={batchMode}
                  getMemberStatus={getMemberStatus}
                  hasAnyInputForMember={hasAnyInputForMember}
                  hasCompleteInputForMember={hasCompleteInputForMember}
                  onReadingChange={handleReadingChange}
                  onToggleMeterExpansion={toggleMeterExpansion}
                  onPreview={() => previewSingleBill(member)}
                  onSave={() => saveReading(member, true)}
                  onSaveReadingOnly={() => saveReading(member, false)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum =
                page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
              if (pageNum < 1 || pageNum > totalPages) return null;

              return (
                <button
                  key={pageNum}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                    page === pageNum ? "bg-blue-600 text-white" : "border border-slate-200 hover:bg-slate-50"
                  } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => !loading && setPage(pageNum)}
                  disabled={loading}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      {/* Preview Modal */}
      <Modal open={!!preview} title="Bill Preview" onClose={() => setPreview(null)} size="lg">
        {preview && selectedMember && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900 text-lg">{preview.accountName}</div>
              <div className="text-sm text-slate-600 mt-1">
                {preview.pnNo} • {preview.classification} • Period: {periodKey}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900 mb-3">Bill Calculation</div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Base Amount:</span>
                  <span className="font-bold">₱{(preview.preview?.baseAmount || 0).toFixed(2)}</span>
                </div>

                {(preview.preview?.discount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount ({preview.preview?.discountReason || "Discount"}):</span>
                    <span className="font-bold">-₱{(preview.preview?.discount || 0).toFixed(2)}</span>
                  </div>
                )}

                <hr className="border-slate-200 my-2" />

                <div className="flex justify-between text-lg font-bold text-slate-900">
                  <span>Total Amount:</span>
                  <span>₱{(preview.preview?.amount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="rounded-xl border border-slate-200 px-4 py-2.5" disabled={loading}>
                Close
              </button>
              <button
                onClick={() => {
                  // save using partial/complete rules (will only send new meters with input)
                  // BUT: preview is only allowed when all meters are typed (see logic above)
                  // so this will work as final save too.
                  // eslint-disable-next-line no-unused-expressions
                  selectedMember && selectedMember.pnNo && setPreview(null);
                }}
                className="rounded-xl bg-blue-600 text-white px-6 py-2.5 font-semibold"
                disabled
                title="Preview modal is informational; use Save & Bill from table."
              >
                Use Save & Bill
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Result Modal */}
      <Modal open={!!receiptData} title="Result" onClose={() => setReceiptData(null)}>
        {receiptData && (
          <div className="space-y-4">
            <div ref={receiptRef} className="hidden">
              <div className="receipt">
                <div className="header">
                  <h2>RESULT</h2>
                </div>
                <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(receiptData, null, 2)}</pre>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 bg-white">
              <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(receiptData, null, 2)}</pre>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setReceiptData(null)} className="rounded-xl border border-slate-200 px-4 py-2.5">
                Close
              </button>
              <button onClick={printReceipt} className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-6 py-2.5 font-semibold">
                <Printer size={16} />
                Print
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ---------- Row ----------
function ReadingRow({
  member,
  readings,
  expandedMeters,
  batchMode,
  getMemberStatus,
  hasAnyInputForMember,
  hasCompleteInputForMember,
  onReadingChange,
  onToggleMeterExpansion,
  onPreview,
  onSave,
  onSaveReadingOnly,
}) {
  const pnKey = String(member.pnNo || "").toUpperCase().trim();
  const isExpanded = !!expandedMeters[pnKey];
  const status = getMemberStatus(member);

  // ✅ save enabled if at least 1 NEW input is present
  const canSave = !member.hasReading && hasAnyInputForMember(member);

  // preview allowed only if all active meters have (saved OR typed) values
  const canPreview = !member.hasReading && hasCompleteInputForMember(member);

  const readSet = new Set((member.readMeters || []).map((x) => String(x || "").toUpperCase().trim()));

  const statusBadge = (() => {
    if (status === "complete") {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-1 text-xs font-bold">
          <CheckCircle size={12} className="mr-1" />
          Complete
        </span>
      );
    }
    if (status === "partial") {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-1 text-xs font-bold">
          Partial
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-1 text-xs font-bold">
        Unread
      </span>
    );
  })();

  return (
    <>
      <tr className={`border-t ${status === "complete" ? "bg-green-50/30" : "hover:bg-slate-50/60"}`}>
        <td className="py-3 px-4">{statusBadge}</td>

        <td className="py-3 px-4 font-bold text-slate-900">{member.pnNo}</td>

        <td className="py-3 px-4">
          <div>
            <div className="font-medium">{member.accountName}</div>
            <div className="text-xs text-slate-500">{member.billing?.classification || "N/A"}</div>
          </div>
        </td>

        <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate" title={member.addressText}>
          {member.addressText || "N/A"}
        </td>

        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{member.activeMeters || 0}</span>
            <span className="text-xs text-slate-500">active</span>

            {/* ✅ click to expand ALWAYS (even 1 meter) */}
            {(member.activeMeters || 0) > 0 && (
              <button onClick={() => onToggleMeterExpansion(member.pnNo)} className="ml-2 text-blue-600 hover:text-blue-800">
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </div>
        </td>

        <td className="py-3 px-4 text-right space-x-2">
          {!member.hasReading && (
            <>
              <button
                onClick={onPreview}
                disabled={!canPreview}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                title={canPreview ? "Preview (requires all meters typed or API returns saved values)" : "Preview needs all meters"}
              >
                Preview
              </button>

              {batchMode ? (
                <button
                  onClick={onSave}
                  disabled={!canSave}
                  className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                  title={canSave ? "Mark (partial allowed)" : "Enter at least 1 new meter"}
                >
                  Mark
                </button>
              ) : (
                <>
                  <button
                    onClick={onSaveReadingOnly}
                    disabled={!canSave}
                    className="rounded-lg border border-emerald-200 text-emerald-700 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-50 disabled:opacity-50"
                    title={canSave ? "Save new meter(s) (partial allowed)" : "Enter at least 1 new meter"}
                  >
                    Save Reading
                  </button>

                  <button
                    onClick={onSave}
                    disabled={!canSave}
                    className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                    title={canSave ? "Save & update bill (partial allowed)" : "Enter at least 1 new meter"}
                  >
                    Save & Bill
                  </button>
                </>
              )}
            </>
          )}
        </td>
      </tr>

      {/* Expanded meters */}
      {isExpanded && (member.activeBillingMeters || []).length > 0 && (
        <tr className="bg-slate-50/50">
          <td colSpan={6} className="px-4 py-3">
            <div className="pl-4 border-l-2 border-blue-200">
              <div className="text-xs font-semibold text-slate-700 mb-2">Meter Readings:</div>

              <div className="space-y-3">
                {(member.activeBillingMeters || []).map((meter, index) => {
                  const pn = member.pnNo;
                  const meterKey = String(meter.meterNumber || "").toUpperCase().trim();

                  // ✅ lock meter if already saved for this period
                  const meterAlreadySaved = member.hasReading || readSet.has(meterKey);

                  const presentReading = readings[pn]?.[meterKey]?.presentReading || "";
                  const previousReading = meter.lastReading || 0;

                  const consumption = presentReading
                    ? (parseFloat(presentReading) - parseFloat(previousReading)).toFixed(3)
                    : "0.000";

                  const mult = meter.consumptionMultiplier || 1;
                  const effective = (Number(consumption) * mult) || 0;

                  return (
                    <div key={meterKey} className="p-3 bg-white border border-slate-200 rounded-lg">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-xs text-slate-500">Meter #{index + 1}</div>
                          <div className="flex items-center gap-2">
                            <div className="font-bold text-slate-900">{meter.meterNumber}</div>
                            {meterAlreadySaved && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
                                SAVED
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            {meter.meterBrand} {meter.meterModel} • {meter.meterSize}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Previous Reading</div>
                          <div className="font-mono text-slate-900">{Number(previousReading).toFixed(3)}</div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Present Reading</div>
                          <input
                            type="number"
                            step="0.001"
                            min={previousReading}
                            className={`w-full mt-1 rounded-lg border px-2 py-1.5 text-sm font-mono ${
                              meterAlreadySaved
                                ? "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                                : "border-slate-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            }`}
                            value={meterAlreadySaved ? "" : presentReading}
                            onChange={(e) => onReadingChange(pn, meter.meterNumber, e.target.value)}
                            placeholder={meterAlreadySaved ? "Already saved" : "0.000"}
                            disabled={meterAlreadySaved}
                          />
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Consumption</div>
                          <div className="font-mono font-bold">
                            {consumption} m³
                            {mult > 1 && (
                              <div className="text-xs text-slate-500 mt-1">
                                × {mult} = {effective.toFixed(3)} m³
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {meter.location?.description && (
                        <div className="mt-2 text-xs text-slate-600">Location: {meter.location.description}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
