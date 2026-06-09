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

// Downloads the reader's assigned batch members (enriched with previous
// readings, bill status, prior-unsettled flags) for the period via a single
// scoped endpoint, and caches them locally. /my-batch and /water/settings
// run in parallel — there's no dependency between them — so the slowest of
// the two becomes the wall-clock cost instead of the sum.
export async function downloadBatch({ token, periodKey = currentPeriodKey() }) {
  const [res, settingsRes] = await Promise.all([
    apiFetch(`/water/readings/my-batch?periodKey=${periodKey}`, { token }),
    apiFetch("/water/settings", { token }).catch(() => null),
  ]);

  const items = res.items || [];
  const batches = res.batches || [];

  if (batches.length === 0) {
    return { ok: false, message: "No batch is assigned to you. Ask the admin to assign one." };
  }

  // Cache tariff settings so the thermal bill can be computed offline.
  if (settingsRes) await odb.setMeta("settings", settingsRes);

  await odb.saveMembers(items);
  await odb.setMeta("periodKey", periodKey);
  await odb.setMeta("batchInfo", batches);
  await odb.setMeta("downloadedAt", Date.now());

  return { ok: true, count: items.length, periodKey, batches: batches.length };
}

// Save a reading locally (works fully offline). `forceUpdate` is true
// when the plumber explicitly edited an already-synced row after
// password step-up — the server will overwrite the existing reading.
// `coords` is optional { lat, lng, accuracy } from the plumber's
// browser geolocation — when present, the server pins/updates that
// meter's location in the Meter Map.
export async function saveReadingOffline({ pnNo, meterNumber, periodKey, previousReading, presentReading, consumptionMultiplier = 1, forceUpdate = false, coords = null }) {
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
    forceUpdate: !!forceUpdate,
    coords: coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
      ? { lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy ?? null }
      : null,
  });
  return { consumed };
}

// Best-effort geolocation. Returns { lat, lng, accuracy } or null on
// any failure (denied, unavailable, timeout). Field Mode calls this
// just before commitSave so each synced reading carries the plumber's
// position at the time of encoding.
export function getCurrentLocation(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const fail = () => { if (!settled) { settled = true; resolve(null); } };
    const t = setTimeout(fail, timeoutMs + 1000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      fail,
      { enableHighAccuracy: true, maximumAge: 30000, timeout: timeoutMs }
    );
  });
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
    // Split by forceUpdate so we can re-encode edited rows without
    // accidentally overwriting unedited ones. Two payloads = at most
    // two API hits per period — typical case is just one.
    const groups = [
      { force: false, items: rows.filter((r) => !r.forceUpdate) },
      { force: true,  items: rows.filter((r) =>  r.forceUpdate) },
    ].filter((g) => g.items.length > 0);

    for (const group of groups) {
    const readings = group.items.map((r) => ({
      pnNo: r.pnNo,
      meterNumber: r.meterNumber,
      previousReading: r.previousReading,
      presentReading: r.presentReading,
      consumptionMultiplier: r.consumptionMultiplier,
      readDate: r.readDate,
      coords: r.coords || null,
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
        forceUpdate: group.force,
        // Generate bills inline so they appear in the Water Bill
        // Officer dashboard immediately after the field reader syncs.
        // The server batches the bill upserts via WaterBill.bulkWrite
        // so this stays cheap (single roundtrip per sync regardless of
        // row count).
        generateBill: true,
      },
    });
    // Map server per-row results back to queue ids; accept success + skipped.
    const byKey = {};
    for (const d of res.details || []) byKey[`${d.pnNo}__${d.meterNumber}`] = d.status;
    const justSynced = []; // rows that need their member's readMeters/lastActualReadings refreshed locally
    for (const r of group.items) {
      const st = byKey[r.id];
      if (st === "success" || st === "skipped") {
        doneIds.push(r.id);
        success++;
        if (st === "success") justSynced.push(r);
      } else {
        failed++;
      }
    }

    // After a successful server save the queue entry is removed — but
    // the locally-cached member doc still has the OLD readMeters /
    // lastActualReadings from the original batch download. Without
    // patching the local doc, on next refresh `isRead` would flip the
    // meter back to "not read" (queue empty + server-side flags stale).
    // Patch the cache here so a newly-added meter on a multi-meter
    // account stays marked READ across refreshes.
    if (justSynced.length > 0) {
      const byPn = {};
      for (const r of justSynced) (byPn[r.pnNo] ||= []).push(r);
      for (const [pnNo, rows] of Object.entries(byPn)) {
        const member = await odb.getMember(pnNo);
        if (!member) continue;
        member.readMeters = Array.isArray(member.readMeters) ? [...member.readMeters] : [];
        member.lastActualReadings = { ...(member.lastActualReadings || {}) };
        for (const r of rows) {
          const mn = String(r.meterNumber).toUpperCase().trim();
          if (!member.readMeters.some((x) => String(x).toUpperCase().trim() === mn)) {
            member.readMeters.push(r.meterNumber);
          }
          member.lastActualReadings[mn] = {
            ...(member.lastActualReadings[mn] || {}),
            presentReading: r.presentReading,
            previousReading: r.previousReading,
            consumed: r.consumed,
            readDate: r.readDate,
          };
        }
        await odb.updateMember(member);
      }
    }
    }
  }

  if (doneIds.length) await odb.removeFromQueue(doneIds);
  await odb.setMeta("lastSyncAt", Date.now());
  return { ok: true, success, failed };
}
