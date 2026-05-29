// Field-reader offline sync: download the reader's assigned batch for offline
// use, encode readings locally, and push them to the server when online.
import { apiFetch } from "./api";
import * as odb from "./offlineDb";

export function currentPeriodKey() {
  return new Date().toISOString().slice(0, 7);
}
export function prevPeriodKey(periodKey = currentPeriodKey()) {
  const [y, m] = periodKey.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m-1 = current month index, so m-2 = previous
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isMyBatch(b, user) {
  const rid = String(b.readerId || "");
  return (
    (user?.employeeId && rid === String(user.employeeId)) ||
    (user?._id && rid === String(user._id)) ||
    (user?.id && rid === String(user.id)) ||
    (b.readerName && user?.fullName && b.readerName === user.fullName)
  );
}

// Downloads the reader's batch members (enriched with previous readings, bill
// status, prior-unsettled flags) for the period and caches them locally.
export async function downloadBatch({ token, user, periodKey = currentPeriodKey() }) {
  const { batches = [] } = await apiFetch("/water/batches", { token });
  const mine = batches.filter((b) => isMyBatch(b, user));
  const myPns = new Set();
  for (const b of mine) for (const m of b.members || []) if (m?.pnNo) myPns.add(String(m.pnNo).toUpperCase());

  if (myPns.size === 0) {
    return { ok: false, message: "No batch is assigned to you. Ask the admin to assign one." };
  }

  // Pull enriched members for the period (paginated), keep only my batch.
  const collected = [];
  let page = 1;
  const limit = 100;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await apiFetch(`/water/readings/members?periodKey=${periodKey}&page=${page}&limit=${limit}`, { token });
    const items = res.items || [];
    for (const it of items) if (myPns.has(String(it.pnNo).toUpperCase())) collected.push(it);
    const totalPages = res.totalPages || 1;
    if (page >= totalPages || items.length === 0 || page > 100) break;
    page++;
  }

  await odb.saveMembers(collected);
  await odb.setMeta("periodKey", periodKey);
  await odb.setMeta("batchInfo", mine.map((b) => ({ batchNumber: b.batchNumber, batchName: b.batchName, area: b.area })));
  await odb.setMeta("downloadedAt", Date.now());

  return { ok: true, count: collected.length, periodKey, batches: mine.length };
}

// Save a reading locally (works fully offline).
export async function saveReadingOffline({ pnNo, meterNumber, periodKey, previousReading, presentReading, consumptionMultiplier = 1 }) {
  const prev = Number(previousReading) || 0;
  const pres = Number(presentReading);
  if (!(pres >= prev)) throw new Error("Present reading must be ≥ previous reading.");
  const consumed = (pres - prev) * (Number(consumptionMultiplier) || 1);
  await odb.enqueueReading({
    pnNo: String(pnNo).toUpperCase(),
    meterNumber: String(meterNumber).toUpperCase(),
    periodKey,
    previousReading: prev,
    presentReading: pres,
    consumptionMultiplier: Number(consumptionMultiplier) || 1,
    consumed,
    readDate: String(Date.now()),
  });
  return { consumed };
}

let syncing = false; // guard against concurrent syncs (interval + manual + online event)

// Push all pending readings to the server. Idempotent and conservative:
// the server keys readings by period+PN+meter; we never overwrite an existing
// server reading (forceUpdate:false), so syncing can't duplicate or clobber.
export async function syncQueue({ token, user }) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, offline: true };
  }
  if (syncing) return { ok: false, busy: true };
  syncing = true;
  try {
    return await runSync({ token, user });
  } finally {
    syncing = false;
  }
}

async function runSync({ token, user }) {
  const pending = await odb.getPending();
  if (pending.length === 0) return { ok: true, success: 0, nothing: true };

  // Group by period (almost always one)
  const byPeriod = {};
  for (const r of pending) (byPeriod[r.periodKey] ||= []).push(r);

  let success = 0;
  let failed = 0;
  const doneIds = [];

  for (const [periodKey, rows] of Object.entries(byPeriod)) {
    const readings = rows.map((r) => ({
      pnNo: r.pnNo,
      meterNumber: r.meterNumber,
      previousReading: r.previousReading,
      presentReading: r.presentReading,
      consumptionMultiplier: r.consumptionMultiplier,
      readDate: r.readDate,
    }));
    const res = await apiFetch("/water/batches/import-readings", {
      method: "POST",
      token,
      body: {
        readings,
        periodKey,
        readerName: user?.fullName || "",
        readerId: user?.employeeId || user?._id || "",
        importDate: Date.now(),
        forceUpdate: false, // never overwrite an existing server reading
      },
    });
    // Map server per-row results back to queue ids; accept success + skipped.
    const byKey = {};
    for (const d of res.details || []) byKey[`${d.pnNo}__${d.meterNumber}`] = d.status;
    for (const r of rows) {
      const st = byKey[r.id];
      if (st === "success" || st === "skipped") {
        doneIds.push(r.id);
        success++;
      } else {
        failed++;
      }
    }
  }

  if (doneIds.length) await odb.removeFromQueue(doneIds);
  await odb.setMeta("lastSyncAt", Date.now());
  return { ok: true, success, failed };
}
