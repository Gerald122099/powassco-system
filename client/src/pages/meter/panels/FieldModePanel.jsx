import { useEffect, useMemo, useState, useCallback } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
import QRScannerView from "../../../components/QRScannerView";
import { useAuth } from "../../../context/AuthContext";
import { parseMeterQR } from "../../../lib/meterQr";
import * as odb from "../../../lib/offlineDb";
import { downloadBatch, saveReadingOffline, syncQueue, currentPeriodKey } from "../../../lib/fieldSync";
import { Wifi, WifiOff, Download, RefreshCw, QrCode, Save, Search, MapPin, CheckCircle, CloudOff } from "lucide-react";

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}
function ago(ts) {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}
const mnorm = (s) => String(s || "").toUpperCase().trim();

export default function FieldModePanel() {
  const { token, user } = useAuth();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [members, setMembers] = useState([]);
  const [queueKeys, setQueueKeys] = useState(new Set()); // pnNo__meter encoded locally
  const [pending, setPending] = useState(0);
  const [periodKey, setPeriodKey] = useState(currentPeriodKey());
  const [downloadedAt, setDownloadedAt] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [batchInfo, setBatchInfo] = useState([]);

  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [inputs, setInputs] = useState({}); // pnNo__meter -> present value
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanErr, setScanErr] = useState("");

  const flash = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshLocal = useCallback(async () => {
    const [m, queue, pk, dAt, sAt, bi] = await Promise.all([
      odb.getMembers(),
      odb.getQueue(),
      odb.getMeta("periodKey"),
      odb.getMeta("downloadedAt"),
      odb.getMeta("lastSyncAt"),
      odb.getMeta("batchInfo"),
    ]);
    setMembers(m || []);
    setQueueKeys(new Set((queue || []).map((x) => x.id)));
    setPending((queue || []).filter((x) => !x.synced).length);
    if (pk) setPeriodKey(pk);
    setDownloadedAt(dAt || null);
    setLastSyncAt(sAt || null);
    setBatchInfo(bi || []);
  }, []);

  useEffect(() => {
    refreshLocal();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refreshLocal]);

  const doSync = useCallback(async () => {
    if (!navigator.onLine) return;
    const res = await syncQueue({ token, user }).catch(() => null);
    if (res?.ok && (res.success || res.failed)) {
      flash(`Synced ${res.success} reading(s)${res.failed ? `, ${res.failed} pending` : ""}.`, res.failed ? "error" : "success");
    }
    await refreshLocal();
  }, [token, user, refreshLocal]);

  // Auto-sync when back online and on a slow interval.
  useEffect(() => {
    if (online && pending > 0) doSync();
    const id = setInterval(() => {
      if (navigator.onLine && pending > 0) doSync();
    }, 30000);
    return () => clearInterval(id);
  }, [online, pending, doSync]);

  async function handleDownload() {
    if (!navigator.onLine) return flash("You are offline. Connect to download your batch.", "error");
    setBusy("download");
    try {
      const res = await downloadBatch({ token, user, periodKey: currentPeriodKey() });
      if (!res.ok) flash(res.message || "Nothing to download.", "error");
      else flash(`Downloaded ${res.count} account(s) for ${res.periodKey}.`, "success");
      await refreshLocal();
    } catch (e) {
      flash("Download failed: " + e.message, "error");
    } finally {
      setBusy("");
    }
  }

  function prevReadingFor(member, meterNo) {
    const la = member.lastActualReadings?.[mnorm(meterNo)];
    return la?.presentReading ?? 0;
  }
  function isRead(member, meterNo) {
    if (queueKeys.has(`${mnorm(member.pnNo)}__${mnorm(meterNo)}`)) return true;
    return (member.readMeters || []).map(mnorm).includes(mnorm(meterNo));
  }

  async function saveMember(member) {
    const meters = member.activeBillingMeters || [];
    const toSave = [];
    for (const mt of meters) {
      const key = `${mnorm(member.pnNo)}__${mnorm(mt.meterNumber)}`;
      const val = inputs[key];
      if (val === undefined || val === "") continue;
      toSave.push({ mt, val });
    }
    if (toSave.length === 0) return flash("Enter a reading first.", "error");
    try {
      for (const { mt, val } of toSave) {
        await saveReadingOffline({
          pnNo: member.pnNo,
          meterNumber: mt.meterNumber,
          periodKey,
          previousReading: prevReadingFor(member, mt.meterNumber),
          presentReading: val,
          consumptionMultiplier: mt.consumptionMultiplier || 1,
        });
      }
      flash(`Saved ${toSave.length} reading(s) offline.`, "success");
      setInputs((p) => {
        const next = { ...p };
        for (const { mt } of toSave) delete next[`${mnorm(member.pnNo)}__${mnorm(mt.meterNumber)}`];
        return next;
      });
      await refreshLocal();
      if (navigator.onLine) doSync();
    } catch (e) {
      flash(e.message, "error");
    }
  }

  const onScan = (text) => {
    setScanOpen(false);
    const parsed = parseMeterQR(text);
    if (!parsed) return setScanErr("Unrecognized QR code.");
    setQ(parsed.pnNo);
    setUnreadOnly(false);
    setScanErr("");
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return members.filter((m) => {
      if (unreadOnly) {
        const allRead = (m.activeBillingMeters || []).every((mt) => isRead(m, mt.meterNumber));
        if (allRead && (m.activeBillingMeters || []).length > 0) return false;
      }
      if (!t) return true;
      const hay = [m.pnNo, m.accountName, m.addressText, ...(m.activeBillingMeters || []).map((x) => x.meterNumber)]
        .join(" ")
        .toLowerCase();
      return hay.includes(t);
    });
  }, [members, q, unreadOnly, queueKeys]);

  const total = members.length;
  const readCount = members.filter((m) => (m.activeBillingMeters || []).length > 0 && (m.activeBillingMeters || []).every((mt) => isRead(m, mt.meterNumber))).length;

  return (
    <Card>
      {toast && (
        <div
          role="status"
          className={`fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${
            toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            Field Mode
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${online ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {online ? <Wifi size={12} /> : <WifiOff size={12} />} {online ? "Online" : "Offline"}
            </span>
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Period {periodKey} • {batchInfo.map((b) => b.batchName).join(", ") || "no batch"} • downloaded {ago(downloadedAt)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleDownload} disabled={busy === "download" || !online} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
            <Download size={16} className={busy === "download" ? "animate-pulse" : ""} /> {busy === "download" ? "Downloading…" : "Download Batch"}
          </button>
          <button onClick={doSync} disabled={!online || pending === 0} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
            {pending > 0 ? <RefreshCw size={16} /> : <CheckCircle size={16} />} {pending > 0 ? `Sync (${pending})` : "Synced"}
          </button>
        </div>
      </div>

      {/* Counters */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
          <div className="text-xl font-bold text-slate-900">{total}</div>
          <div className="text-xs text-slate-500">Accounts</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-emerald-50 p-3 text-center">
          <div className="text-xl font-bold text-emerald-700">{readCount}</div>
          <div className="text-xs text-slate-500">Read</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-amber-50 p-3 text-center">
          <div className="text-xl font-bold text-amber-700">{total - readCount}</div>
          <div className="text-xs text-slate-500">Unread</div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1 text-xs text-slate-400">
        {pending > 0 ? <CloudOff size={12} /> : null} last sync {ago(lastSyncAt)}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PN, name, meter, address" className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-100" />
        </div>
        <button onClick={() => { setScanErr(""); setScanOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700">
          <QrCode size={16} /> Scan
        </button>
        <button onClick={() => setUnreadOnly((v) => !v)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${unreadOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          {unreadOnly ? "Unread only" : "All"}
        </button>
      </div>
      {scanErr && <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{scanErr}</div>}

      {/* Member list */}
      <div className="mt-4 space-y-3">
        {total === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No accounts cached. {online ? "Tap “Download Batch” to load your assigned accounts for offline use." : "Connect to the internet and download your batch."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No matching accounts.</div>
        ) : (
          filtered.slice(0, 100).map((m) => {
            const meters = m.activeBillingMeters || [];
            const allRead = meters.length > 0 && meters.every((mt) => isRead(m, mt.meterNumber));
            const blocked = m.priorUnsettledPeriods?.length > 0;
            return (
              <div key={m.pnNo} className={`rounded-2xl border p-4 ${allRead ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">{m.accountName}</div>
                    <div className="font-mono text-xs text-slate-500">{m.pnNo}</div>
                    {m.addressText && (
                      <div className="mt-1 flex items-start gap-1 text-xs text-slate-500">
                        <MapPin size={12} className="mt-0.5 shrink-0" /> {m.addressText}
                      </div>
                    )}
                  </div>
                  {allRead && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">READ</span>}
                </div>

                {blocked && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
                    Unsettled bill(s): {m.priorUnsettledPeriods.join(", ")} — settle before billing.
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {meters.map((mt) => {
                    const key = `${mnorm(m.pnNo)}__${mnorm(mt.meterNumber)}`;
                    const prev = prevReadingFor(m, mt.meterNumber);
                    const read = isRead(m, mt.meterNumber);
                    const val = inputs[key] ?? "";
                    const present = val !== "" ? parseFloat(val) : null;
                    const cons = present != null ? (present - prev) * (mt.consumptionMultiplier || 1) : null;
                    return (
                      <div key={key} className="rounded-xl border border-slate-200 bg-white p-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-semibold text-slate-700">{mt.meterNumber}</span>
                          <span className="text-slate-400">prev {fmt(prev)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.001"
                            value={val}
                            onChange={(e) => setInputs((p) => ({ ...p, [key]: e.target.value }))}
                            placeholder={read ? "encoded" : "present reading"}
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                          />
                          <div className="w-20 shrink-0 text-right text-xs">
                            {cons != null ? <span className="font-bold text-purple-700">{fmt(cons)} m³</span> : read ? <CheckCircle size={16} className="ml-auto text-emerald-500" /> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex justify-end">
                  <button onClick={() => saveMember(m)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    <Save size={15} /> Save{online ? " & Sync" : " (offline)"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Scanner */}
      <Modal open={scanOpen} title="Scan Meter QR" subtitle="Works offline against your downloaded batch" onClose={() => setScanOpen(false)} size="sm">
        {scanOpen && <QRScannerView onResult={onScan} onError={(msg) => { setScanErr(msg); setScanOpen(false); }} />}
        <button onClick={() => setScanOpen(false)} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
      </Modal>
    </Card>
  );
}
