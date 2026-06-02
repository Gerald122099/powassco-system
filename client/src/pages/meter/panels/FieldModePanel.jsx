import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
const QRScannerView = lazy(() => import("../../../components/QRScannerView"));
import { useAuth } from "../../../context/AuthContext";
import { parseMeterQR } from "../../../lib/meterQr";
import * as odb from "../../../lib/offlineDb";
import { downloadBatch, saveReadingOffline, syncQueue, currentPeriodKey } from "../../../lib/fieldSync";
import { connectPrinter, printerConnected, printWaterReceipt, thermalSupported } from "../../../lib/thermalPrint";
import { calculateWaterBillLocal } from "../../../lib/waterBillingLocal";
import { printRouteSheet } from "../../../lib/routeSheet";
import { Wifi, WifiOff, Download, RefreshCw, QrCode, Save, Search, MapPin, CheckCircle, CloudOff, Printer, Bluetooth, FileText, Trash2, AlertTriangle, Ban, UploadCloud, MoreVertical, X, Keyboard } from "lucide-react";

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
  const [queueByKey, setQueueByKey] = useState({}); // key → { presentReading, previousReading, consumed }
  const [pending, setPending] = useState(0);
  const [periodKey, setPeriodKey] = useState(currentPeriodKey());
  const [downloadedAt, setDownloadedAt] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [batchInfo, setBatchInfo] = useState([]);

  const [q, setQ] = useState("");
  // filter: "all" | "unread" | "blocked"
  const [filter, setFilter] = useState("all");
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState("");
  // { msg, type, sticky? } — sticky toasts stay until dismissed (used for sync failures)
  const [toast, setToast] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [settings, setSettings] = useState(null);
  const [printerOn, setPrinterOn] = useState(false);

  // Visual progress for long-running operations.
  // phase: "" | "download" | "sync"
  const [progress, setProgress] = useState({ phase: "", label: "", current: 0, total: 0 });
  const [lastSyncReport, setLastSyncReport] = useState(null); // { success, failed, at }
  const retryTimer = useRef(null);

  const flash = useCallback((msg, type = "success", sticky = false) => {
    setToast({ msg, type, sticky });
    if (!sticky) setTimeout(() => setToast(null), 3500);
  }, []);

  const refreshLocal = useCallback(async () => {
    const [m, queue, pk, dAt, sAt, bi, st] = await Promise.all([
      odb.getMembers(),
      odb.getQueue(),
      odb.getMeta("periodKey"),
      odb.getMeta("downloadedAt"),
      odb.getMeta("lastSyncAt"),
      odb.getMeta("batchInfo"),
      odb.getMeta("settings"),
    ]);
    setMembers(m || []);
    setQueueKeys(new Set((queue || []).map((x) => x.id)));
    // Map each queued reading by its key so the UI can show "encoded
    // X m³" instead of an empty input on already-read meters.
    const qbk = {};
    for (const r of queue || []) qbk[r.id] = r;
    setQueueByKey(qbk);
    setPending((queue || []).filter((x) => !x.synced).length);
    if (pk) setPeriodKey(pk);
    setDownloadedAt(dAt || null);
    setLastSyncAt(sAt || null);
    setBatchInfo(bi || []);
    setSettings(st || null);
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
    if (busy === "sync") return; // already syncing
    setBusy("sync");
    const queue = await odb.getQueue();
    const total = (queue || []).filter((x) => !x.synced).length;
    if (total === 0) {
      setBusy("");
      return;
    }
    setProgress({ phase: "sync", label: "Sending readings…", current: 0, total });
    const res = await syncQueue({ token, user }).catch((e) => ({ ok: false, error: e?.message || "Network error" }));
    setProgress({ phase: "", label: "", current: 0, total: 0 });
    setBusy("");

    if (res?.ok) {
      const { success = 0, failed = 0 } = res;
      setLastSyncReport({ success, failed, at: Date.now() });
      if (failed === 0 && success > 0) {
        flash(`✓ Synced ${success} reading(s) to the server.`, "success");
      } else if (failed > 0) {
        // Auto-retry once after 5s; persistent banner stays until success.
        flash(`Synced ${success}, ${failed} still pending — auto-retry in 5s…`, "error", true);
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => {
          if (navigator.onLine) doSync();
        }, 5000);
      }
    } else if (!res?.ok && !res?.busy && !res?.offline && !res?.nothing) {
      flash(`Sync failed: ${res?.error || "network error"}. Will retry automatically.`, "error", true);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        if (navigator.onLine) doSync();
      }, 5000);
    }
    await refreshLocal();
  }, [token, user, refreshLocal, busy, flash]);

  // Auto-sync when back online + periodic background check.
  useEffect(() => {
    if (online && pending > 0 && busy !== "sync") doSync();
    const id = setInterval(() => {
      if (navigator.onLine && pending > 0) doSync();
    }, 30000);
    return () => {
      clearInterval(id);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [online, pending, doSync, busy]);

  async function handleDownload() {
    if (!navigator.onLine) return flash("You are offline. Connect to download your assigned meters.", "error");
    setBusy("download");
    setProgress({ phase: "download", label: "Downloading your assigned meters…", current: 0, total: 0 });
    try {
      const res = await downloadBatch({ token, user, periodKey: currentPeriodKey() });
      if (!res.ok) flash(res.message || "Nothing to download.", "error");
      else flash(`✓ Downloaded ${res.count} account(s) for ${res.periodKey}.`, "success");
      await refreshLocal();
    } catch (e) {
      flash("Download failed: " + e.message, "error");
    } finally {
      setBusy("");
      setProgress({ phase: "", label: "", current: 0, total: 0 });
    }
  }

  function prevReadingFor(member, meterNo) {
    const la = member.lastActualReadings?.[mnorm(meterNo)];
    return la?.presentReading ?? 0;
  }
  const isRead = useCallback(
    (member, meterNo) => {
      if (queueKeys.has(`${mnorm(member.pnNo)}__${mnorm(meterNo)}`)) return true;
      return (member.readMeters || []).map(mnorm).includes(mnorm(meterNo));
    },
    [queueKeys]
  );

  async function saveMember(member) {
    const meters = member.activeBillingMeters || [];
    const toSave = [];
    let alreadyEncodedCount = 0;
    for (const mt of meters) {
      const key = `${mnorm(member.pnNo)}__${mnorm(mt.meterNumber)}`;
      const val = inputs[key];
      const encoded = isRead(member, mt.meterNumber);
      if (val !== undefined && val !== "") {
        toSave.push({ mt, val });
      } else if (encoded) {
        alreadyEncodedCount += 1;
      }
    }

    if (toSave.length === 0) {
      // Nothing new to write. Distinguish "everything's already done" from
      // "you haven't typed anything yet" so the plumber isn't confused
      // when they re-tap Save on a fully-encoded account.
      const allEncoded = meters.length > 0 && alreadyEncodedCount === meters.length;
      const someEncoded = alreadyEncodedCount > 0;
      if (allEncoded) {
        return flash(
          `✓ ${member.accountName} — all readings already synced for ${periodKey}.`,
          "success",
          true
        );
      }
      if (someEncoded) {
        return flash(
          `Already encoded ${alreadyEncodedCount}/${meters.length} meter(s). Enter the present reading on the remaining one(s) before tapping Save.`,
          "error",
          true
        );
      }
      return flash("Enter a reading first.", "error");
    }

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
      flash(`✓ Saved ${toSave.length} reading(s)${navigator.onLine ? " — syncing…" : " offline (will sync when online)."}`, "success");
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

  async function clearData() {
    if (pending > 0 && !confirm(`You have ${pending} unsynced reading(s). Clearing now will lose them. Continue?`)) return;
    if (!pending && !confirm("Clear all downloaded accounts from this device?")) return;
    await odb.clearOffline();
    await refreshLocal();
    flash("Offline data cleared.", "success");
  }

  async function connectPrinterUI() {
    try {
      const name = await connectPrinter();
      setPrinterOn(true);
      flash(`Printer connected: ${name}`, "success");
    } catch (e) {
      setPrinterOn(false);
      flash(e.message, "error");
    }
  }

  async function printMeter(member, mt) {
    const key = `${mnorm(member.pnNo)}__${mnorm(mt.meterNumber)}`;
    let present = inputs[key];
    const prev = prevReadingFor(member, mt.meterNumber);
    if (present === undefined || present === "") {
      const q = (await odb.getQueue()).find((x) => x.id === key);
      if (!q) return flash("Enter or save a reading first.", "error");
      present = q.presentReading;
    }
    const pres = parseFloat(present);
    if (!(pres >= prev)) return flash("Present must be ≥ previous.", "error");
    const consumed = (pres - prev) * (mt.consumptionMultiplier || 1);
    const calc = settings
      ? calculateWaterBillLocal(consumed, member.billing?.classification || "residential", member, mt.meterNumber, settings)
      : null;
    try {
      if (!printerConnected()) await connectPrinter();
      setPrinterOn(true);
      await printWaterReceipt({ member, meter: mt, previous: prev, present: pres, consumed, calc, periodKey });
      flash("Sent to printer.", "success");
    } catch (e) {
      flash("Print failed: " + e.message, "error");
    }
  }

  const onScan = (text) => {
    setScanOpen(false);
    const parsed = parseMeterQR(text);
    if (!parsed) return setScanErr("Unrecognized QR code.");
    setScanErr("");
    setFilter("all");

    // Resolve the member.
    //   • POW|PN|METER or PN|METER  → match by PN.
    //   • bare meter number         → match by meter (parsed.meterOnly).
    // Either way, falling back to a meter-number search lets us recover
    // even when the QR uses an old/short format from a sticker printed
    // before this system existed.
    const wantMeter = String(parsed.meterNumber || "").toUpperCase();
    let member = null;
    if (parsed.pnNo) {
      member = members.find((m) => mnorm(m.pnNo) === mnorm(parsed.pnNo));
    }
    if (!member && wantMeter) {
      member = members.find((m) =>
        (m.activeBillingMeters || []).some((mt) => mnorm(mt.meterNumber) === wantMeter)
      );
    }

    // Search box: prefer meter number when we have it (matches both the
    // PN row AND highlights the meter in lookups), else fall back to PN.
    setQ(wantMeter || parsed.pnNo || "");

    if (!member) {
      const label = parsed.pnNo || wantMeter || "this code";
      flash(`Scanned ${label} — not in your downloaded batch.`, "error", true);
      return;
    }

    const meter = (member.activeBillingMeters || []).find((mt) => mnorm(mt.meterNumber) === wantMeter);
    const meterLabel = wantMeter || meter?.meterNumber || "—";
    const key = meter ? `${mnorm(member.pnNo)}__${mnorm(meter.meterNumber)}` : null;
    const alreadyEncoded = meter ? isRead(member, meter.meterNumber) : false;

    if (alreadyEncoded) {
      flash(`Already encoded · ${member.accountName} · Meter ${meterLabel}`, "success", true);
    } else if (meter) {
      flash(`${member.accountName} • ${member.pnNo} • Meter ${meterLabel}`, "success");
    } else {
      // We matched the PN but the QR's meter number isn't an active
      // billing meter on this account. Likely a swapped/replaced meter.
      flash(`Scanned ${meterLabel} — not an active meter on ${member.accountName} (${member.pnNo}). Verify the meter sticker.`, "error", true);
    }

    // Scroll the matched member card into view and, when the meter is
    // unread, focus its input so the plumber can type immediately.
    setTimeout(() => {
      const row = document.getElementById(`pn-row-${mnorm(member.pnNo)}`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
      if (key && !alreadyEncoded) {
        const inp = document.getElementById(`meter-input-${key}`);
        if (inp) { inp.focus(); inp.select?.(); }
      }
    }, 80);
  };

  // Counts driven by the cached batch + the local queue.
  const counts = useMemo(() => {
    let total = 0, read = 0, unread = 0, blocked = 0;
    for (const m of members) {
      total++;
      const meters = m.activeBillingMeters || [];
      const isBlocked = (m.priorUnsettledPeriods || []).length > 0;
      if (isBlocked) blocked++;
      const allRead = meters.length > 0 && meters.every((mt) => isRead(m, mt.meterNumber));
      if (allRead) read++;
      else unread++;
    }
    return { total, read, unread, blocked };
  }, [members, isRead]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return members.filter((m) => {
      const meters = m.activeBillingMeters || [];
      const allRead = meters.length > 0 && meters.every((mt) => isRead(m, mt.meterNumber));
      const isBlocked = (m.priorUnsettledPeriods || []).length > 0;
      if (filter === "unread" && allRead) return false;
      if (filter === "blocked" && !isBlocked) return false;
      if (!t) return true;
      const hay = [m.pnNo, m.accountName, m.addressText, ...meters.map((x) => x.meterNumber)].join(" ").toLowerCase();
      return hay.includes(t);
    });
  }, [members, q, filter, isRead]);

  const total = counts.total;
  const readCount = counts.read;
  const pct = total > 0 ? Math.round((readCount / total) * 100) : 0;

  return (
    <Card>
      {toast && (
        <div
          role="status"
          className={`fixed right-4 top-4 z-[70] flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg max-w-xs ${
            toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <span className="flex-1">{toast.msg}</span>
          {toast.sticky && (
            <button onClick={() => setToast(null)} className="ml-1 text-xs font-bold opacity-60 hover:opacity-100" aria-label="Dismiss">✕</button>
          )}
        </div>
      )}

      {/* Mobile-first header: title row + meta row + primary action row.
          Less-used controls (Download / Route Sheet / Printer / Clear)
          live in a "More" sheet so plumbers see only what they need. */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-900">
            Field Mode
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${online ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {online ? <Wifi size={11} /> : <WifiOff size={11} />} {online ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="More actions"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 active:bg-slate-100"
          >
            <MoreVertical size={20} />
          </button>
        </div>
        <div className="mt-1 text-xs text-slate-500 leading-tight">
          {user?.fullName ? <b>{user.fullName}</b> : "—"} • {periodKey} • {batchInfo.map((b) => b.batchName).join(", ") || "no batch"} • {ago(downloadedAt)}
        </div>

        {/* Primary action row — Sync is the only thing that needs to be one-tap reachable. */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={doSync}
            disabled={!online || pending === 0 || busy === "sync"}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-bold shadow-sm transition active:scale-95 disabled:opacity-50
              ${pending > 0 ? "bg-purple-600 text-white hover:bg-purple-700" : "border border-emerald-200 bg-emerald-50 text-emerald-800"}`}
          >
            {busy === "sync" ? <><UploadCloud size={20} className="animate-pulse" /> Syncing…</> :
             pending > 0 ? <><RefreshCw size={20} /> Sync {pending}</> :
             <><CheckCircle size={20} /> All synced</>}
          </button>
          <button
            onClick={handleDownload}
            disabled={busy === "download" || !online}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm active:scale-95 disabled:opacity-50"
            aria-label="Download batch"
            title="Download my batch"
          >
            <Download size={20} className={busy === "download" ? "animate-pulse text-purple-600" : ""} />
          </button>
        </div>
      </div>

      {/* "More" bottom sheet — slides up from below on tap. */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 shadow-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between">
              <div className="text-base font-bold text-slate-900">More actions</div>
              <button onClick={() => setMoreOpen(false)} className="rounded-lg p-2 text-slate-500"><X size={18} /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => { setMoreOpen(false); handleDownload(); }}
                disabled={busy === "download" || !online}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
              >
                <Download size={18} className="text-purple-600" />
                {busy === "download" ? "Downloading…" : "Download batch"}
              </button>
              {thermalSupported() && (
                <button
                  onClick={() => { setMoreOpen(false); connectPrinterUI(); }}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold active:scale-95 ${printerOn ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700"}`}
                >
                  <Bluetooth size={18} /> {printerOn ? "Printer ✓" : "Connect printer"}
                </button>
              )}
              {total > 0 && (
                <button
                  onClick={() => { setMoreOpen(false); printRouteSheet(filtered, { periodKey, readerName: user?.fullName }); }}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 active:bg-slate-50"
                >
                  <FileText size={18} /> Route sheet
                </button>
              )}
              {total > 0 && (
                <button
                  onClick={() => { setMoreOpen(false); clearData(); }}
                  className="flex items-center gap-2 rounded-xl border border-red-200 px-3 py-3 text-sm font-semibold text-red-700 active:bg-red-50"
                >
                  <Trash2 size={18} /> Clear data
                </button>
              )}
              <button
                onClick={() => { setMoreOpen(false); setManualOpen(true); }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 active:bg-slate-50"
              >
                <Keyboard size={18} /> Type meter number
              </button>
            </div>
          </div>
        </div>
      )}

      {total > 0 && periodKey !== currentPeriodKey() && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            Cached batch is for <b>{periodKey}</b>, but the current month is <b>{currentPeriodKey()}</b>. Connect and tap <b>Download Batch</b> to refresh before reading.
          </div>
        </div>
      )}

      {/* Progress bar for download/sync */}
      {progress.phase && (
        <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
          <div className="flex items-center justify-between text-xs font-semibold text-purple-800">
            <span>{progress.label}</span>
            {progress.total > 0 && <span>{progress.current} / {progress.total}</span>}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-purple-100">
            <div className={`h-full rounded-full bg-purple-500 ${progress.total > 0 ? "" : "animate-pulse"}`} style={{ width: progress.total > 0 ? `${Math.round((progress.current / progress.total) * 100)}%` : "60%" }} />
          </div>
        </div>
      )}

      {/* Counters: total, read, unread, disconnections, unsynced */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
          <div className="text-xl font-bold text-slate-900">{total}</div>
          <div className="text-xs text-slate-500">Assigned</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-emerald-50 p-3 text-center">
          <div className="text-xl font-bold text-emerald-700">{readCount}</div>
          <div className="text-xs text-slate-500">Read</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-amber-50 p-3 text-center">
          <div className="text-xl font-bold text-amber-700">{counts.unread}</div>
          <div className="text-xs text-slate-500">Unread</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-red-50 p-3 text-center">
          <div className="text-xl font-bold text-red-700">{counts.blocked}</div>
          <div className="text-xs text-slate-500">Disconnections</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-blue-50 p-3 text-center">
          <div className="text-xl font-bold text-blue-700">{pending}</div>
          <div className="text-xs text-slate-500">Unsynced</div>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-center text-xs text-slate-500">{pct}% read</div>
        </div>
      )}
      <div className="mt-1 flex items-center justify-end gap-1 text-xs text-slate-400">
        {pending > 0 ? <CloudOff size={12} /> : null} last sync {ago(lastSyncAt)}
        {lastSyncReport && lastSyncReport.failed === 0 && lastSyncReport.success > 0 && (
          <span className="ml-2 text-emerald-600">• last batch: {lastSyncReport.success} ok</span>
        )}
      </div>

      {/* Controls — mobile-first sticky search header. The Scan button
          is intentionally a fixed FAB at the bottom-right (see end of
          this component) so it's always reachable while scrolling. */}
      <div className="mt-4 sticky top-0 z-20 -mx-1 px-1 py-2 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search PN, name, meter, address"
            className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-3 text-sm focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
        </div>
        {[
          { v: "all", label: "All" },
          { v: "unread", label: "Unread" },
          { v: "blocked", label: "Blocked" },
        ].map((b) => (
          <button
            key={b.v}
            onClick={() => setFilter(b.v)}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${filter === b.v ? "border-purple-300 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {scanErr && <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{scanErr}</div>}

      {/* Member list */}
      {/* Bottom padding (pb-32) keeps the very last member card's Save
          button above both the bottom tab bar (~64px) and the Scan FAB
          (~64px taller than that). */}
      <div className="mt-4 space-y-3 pb-32">
        {total === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No meters assigned yet. {online ? "Tap “Download Batch” to load only YOUR assigned meters for offline reading." : "Connect to the internet and download your batch."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No matching accounts.</div>
        ) : (
          filtered.slice(0, 100).map((m) => {
            const meters = m.activeBillingMeters || [];
            const allRead = meters.length > 0 && meters.every((mt) => isRead(m, mt.meterNumber));
            const blocked = (m.priorUnsettledPeriods || []).length > 0;
            return (
              <div key={m.pnNo} id={`pn-row-${mnorm(m.pnNo)}`} className={`rounded-2xl border p-4 ${blocked ? "border-red-200 bg-red-50/30" : allRead ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">{m.accountName}</div>
                    <div className="font-mono text-xs text-slate-500">{m.pnNo}</div>
                    {m.addressText && (
                      <div className="mt-1 flex items-start gap-1 text-xs text-slate-600">
                        <MapPin size={12} className="mt-0.5 shrink-0 text-purple-500" />
                        <span className="font-medium">{m.addressText}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {blocked && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"><Ban size={10}/> BLOCKED</span>}
                    {allRead && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">READ</span>}
                  </div>
                </div>

                {blocked && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
                    Unsettled bill(s): {m.priorUnsettledPeriods.join(", ")} — for disconnection notice.
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
                    const calc = cons != null && cons >= 0 && settings
                      ? calculateWaterBillLocal(cons, m.billing?.classification || "residential", m, mt.meterNumber, settings)
                      : null;
                    // Encoded value lookup: prefer the local queue (plumber's
                    // own input) and fall back to the server's last actual
                    // reading IF it's for the current period.
                    const queued = queueByKey[key];
                    const lastForPeriod = m.lastActualReadings?.[mnorm(mt.meterNumber)];
                    const encodedPresent = queued?.presentReading ?? (lastForPeriod?.periodKey === periodKey ? lastForPeriod?.presentReading : null);
                    const encodedConsumed = queued?.consumed ?? (lastForPeriod?.periodKey === periodKey ? lastForPeriod?.consumed : null);
                    return (
                      <div key={key} className="rounded-xl border border-slate-200 bg-white p-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-semibold text-slate-700">{mt.meterNumber}</span>
                          <span className="text-slate-400">prev {fmt(prev)}</span>
                        </div>
                        {read ? (
                          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-sm">
                            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-emerald-800">Reading already encoded for {periodKey}</div>
                              <div className="mt-0.5 text-[11px] text-emerald-700 font-mono">
                                Present <b>{encodedPresent != null ? fmt(encodedPresent) : "—"}</b> · used <b>{encodedConsumed != null ? fmt(encodedConsumed) : "—"} m³</b>
                                {queued && !queued.synced ? " · pending sync" : ""}
                              </div>
                            </div>
                            {thermalSupported() && (
                              <button onClick={() => printMeter(m, mt)} className="shrink-0 rounded-lg border border-emerald-200 bg-white p-2 text-emerald-700 hover:bg-emerald-100" title="Print bill to thermal printer">
                                <Printer size={14} />
                              </button>
                            )}
                          </div>
                        ) : (
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            id={`meter-input-${key}`}
                            type="number"
                            inputMode="decimal"
                            step="0.001"
                            value={val}
                            onChange={(e) => setInputs((p) => ({ ...p, [key]: e.target.value }))}
                            placeholder="present reading"
                            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                          />
                          <div className="w-16 shrink-0 text-right text-xs">
                            {cons != null ? <span className="font-bold text-purple-700">{fmt(cons)} m³</span> : null}
                          </div>
                          {thermalSupported() && val !== "" && (
                            <button onClick={() => printMeter(m, mt)} className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Print bill to thermal printer">
                              <Printer size={14} />
                            </button>
                          )}
                        </div>
                        )}
                        {calc && !read && (
                          <div className="mt-1 flex items-center justify-between text-[11px]">
                            <span className="text-blue-600">Tier {calc.tariffUsed.tier} @ ₱{fmt(calc.tariffUsed.ratePerCubic)}/m³</span>
                            <span className="font-bold text-emerald-700">₱{calc.amount.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Full-width primary action. When every meter on the
                    card is already encoded for the current period we swap
                    the Save button for an "Already synced" chip so the
                    plumber doesn't even get the chance to retap it. */}
                <div className="mt-3">
                  {allRead ? (
                    <div className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 text-base font-bold text-emerald-800">
                      <CheckCircle size={18} /> Already synced to database — {periodKey}
                    </div>
                  ) : (
                    <button
                      onClick={() => saveMember(m)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-base font-bold text-white shadow-sm active:scale-95 active:bg-emerald-700"
                    >
                      <Save size={18} /> Save{online ? " & Sync" : " (offline)"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Scanner */}
      <Modal open={scanOpen} title="Scan Meter QR" subtitle="Works offline against your downloaded batch" onClose={() => setScanOpen(false)} size="sm">
        {scanOpen && (
          <Suspense fallback={<div className="py-6 text-center text-sm text-slate-500">Starting camera…</div>}>
            <QRScannerView
              onResult={(text) => onScan(text)}
              onError={(msg) => { setScanErr(msg); setScanOpen(false); }}
            />
          </Suspense>
        )}
        <button
          onClick={() => { setScanOpen(false); setManualOpen(true); }}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 active:bg-slate-200"
        >
          <Keyboard size={15} /> Can't scan? Type the meter number
        </button>
        <button onClick={() => setScanOpen(false)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 active:bg-slate-50">
          Cancel
        </button>
      </Modal>

      {/* Manual entry — fallback when the camera can't read the sticker. */}
      <Modal open={manualOpen} title="Type Meter Number" subtitle="Searches your downloaded batch. Works offline." onClose={() => setManualOpen(false)} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = manualValue.trim();
            if (!v) return;
            setManualOpen(false);
            setManualValue("");
            onScan(v); // parseMeterQR accepts a bare meter number
          }}
          className="space-y-3"
        >
          <input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value.toUpperCase())}
            autoFocus
            inputMode="numeric"
            placeholder="e.g. 00012345"
            className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-center font-mono text-xl tracking-widest focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
          <button
            type="submit"
            disabled={!manualValue.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3 text-base font-bold text-white active:scale-95 disabled:opacity-50"
          >
            <Search size={18} /> Find meter
          </button>
        </form>
      </Modal>

      {/* Sticky bottom-right FAB — the primary action in Field Mode. Always
          reachable while scrolling the member list. Includes a paddding
          for Android nav bar safe-area. */}
      <button
        onClick={() => { setScanErr(""); setScanOpen(true); }}
        className="fixed right-4 z-40 inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-4 text-base font-bold text-white shadow-2xl ring-4 ring-purple-200 active:scale-95"
        // Sits ~80px above the viewport bottom so the bottom tab bar
        // (PlumberDashboard's MobileShell, ~64px high) doesn't overlap.
        // env() inset adds the device's safe-area on top of that.
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
        aria-label="Scan meter QR"
      >
        <QrCode size={22} /> Scan
      </button>
    </Card>
  );
}
