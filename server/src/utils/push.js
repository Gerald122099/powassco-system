// Web Push helper. Initializes VAPID once and exposes a sendPush()
// that handles the common dead-subscription cleanup (410 / 404 →
// remove from DB).
//
// Required env vars (configured in Render):
//   • VAPID_PUBLIC_KEY
//   • VAPID_PRIVATE_KEY
//   • VAPID_SUBJECT  (mailto:admin@powassco.site)
//
// If any are missing we log a warning at boot and turn into a no-op so
// the rest of the app keeps working — pushes are non-critical.
import webpush from "web-push";
import PushSubscription from "../models/PushSubscription.js";

let initialized = false;
function init() {
  if (initialized) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("⚠️  VAPID keys not configured — push notifications disabled.");
    return false;
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:admin@powassco.site",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  initialized = true;
  return true;
}

export function pushEnabled() {
  return init();
}

// Send to one subscription doc. Handles the dead-channel case by
// deleting the doc. Returns { ok: true } / { ok: false, code }.
async function sendOne(subDoc, payload) {
  const subscription = {
    endpoint: subDoc.endpoint,
    keys: { p256dh: subDoc.keys?.p256dh, auth: subDoc.keys?.auth },
  };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    // Bump lastSeenAt so we can age out cold devices later.
    subDoc.lastSeenAt = new Date();
    await subDoc.save();
    return { ok: true };
  } catch (e) {
    const code = e?.statusCode || 0;
    if (code === 404 || code === 410) {
      // Subscription is permanently gone — prune.
      await PushSubscription.deleteOne({ _id: subDoc._id });
      return { ok: false, code, removed: true };
    }
    return { ok: false, code, error: e?.message };
  }
}

// Sends a notification to every subscription that has the given handle
// in its items list. payload is the JSON body the SW will receive on
// the 'push' event — see the client SW for shape expectations.
//
//   await pushToHandle({ kind: 'meter', value: '00012345' }, {
//     title: 'New bill — 2026-06',
//     body: '₱480 due Jun 17',
//     url: '/inquiry?meter=00012345',
//   });
export async function pushToHandle({ kind, value }, payload) {
  if (!init()) return { ok: false, reason: "push_disabled" };
  if (!kind || !value) return { ok: false, reason: "bad_handle" };
  const v = String(value).toUpperCase();
  const subs = await PushSubscription.find({ "items.kind": kind, "items.value": v });
  if (subs.length === 0) return { ok: true, sent: 0 };

  let sent = 0;
  let removed = 0;
  for (const s of subs) {
    const r = await sendOne(s, payload);
    if (r.ok) sent += 1;
    if (r.removed) removed += 1;
  }
  return { ok: true, sent, removed, total: subs.length };
}

// Fire-and-forget wrapper — the caller usually doesn't want pushes to
// block the user's response. Errors are logged, not surfaced.
export function pushAsync(handle, payload) {
  pushToHandle(handle, payload).catch((e) => {
    console.error("push error:", e?.message || e);
  });
}

// Send ONE payload to every device subscribed to ANY of the given
// handles, de-duplicated by device — so a phone that saved both the PN
// and the meter for the same account receives a single push, not two.
// Used by the bill-reminder job. handles: [{ kind, value }, ...].
// Returns { ok, sent, removed, devices }.
export async function pushToHandles(handles, payload) {
  if (!init()) return { ok: false, reason: "push_disabled", sent: 0 };
  const clauses = (handles || [])
    .filter((h) => h && h.kind && h.value)
    .map((h) => ({ "items.kind": h.kind, "items.value": String(h.value).toUpperCase() }));
  if (clauses.length === 0) return { ok: true, sent: 0, devices: 0 };

  const subs = await PushSubscription.find({ $or: clauses });
  // De-dupe by endpoint (a device may match on more than one handle).
  const seen = new Set();
  const unique = [];
  for (const s of subs) {
    if (seen.has(s.endpoint)) continue;
    seen.add(s.endpoint);
    unique.push(s);
  }
  if (unique.length === 0) return { ok: true, sent: 0, devices: 0 };

  let sent = 0;
  let removed = 0;
  for (const s of unique) {
    const r = await sendOne(s, payload);
    if (r.ok) sent += 1;
    if (r.removed) removed += 1;
  }
  return { ok: true, sent, removed, devices: unique.length };
}

// Broadcast ONE payload to EVERY subscribed device (each subscription is
// one device). Used for cooperative-wide announcements. Dead channels are
// pruned as usual. Returns { ok, sent, removed, total }.
export async function pushToAll(payload) {
  if (!init()) return { ok: false, reason: "push_disabled", sent: 0 };
  const subs = await PushSubscription.find({});
  let sent = 0;
  let removed = 0;
  for (const s of subs) {
    const r = await sendOne(s, payload);
    if (r.ok) sent += 1;
    if (r.removed) removed += 1;
  }
  return { ok: true, sent, removed, total: subs.length };
}

// Fire-and-forget broadcast — callers (e.g. announcement create) don't
// want to block their HTTP response on the fan-out.
export function pushToAllAsync(payload) {
  pushToAll(payload).catch((e) => console.error("broadcast push error:", e?.message || e));
}

// Count distinct devices subscribed to any of the given handles, without
// sending anything — used by the reminder job's dry-run preview.
export async function countDevicesForHandles(handles) {
  if (!init()) return 0;
  const clauses = (handles || [])
    .filter((h) => h && h.kind && h.value)
    .map((h) => ({ "items.kind": h.kind, "items.value": String(h.value).toUpperCase() }));
  if (clauses.length === 0) return 0;
  const subs = await PushSubscription.find({ $or: clauses }).select("endpoint").lean();
  return new Set(subs.map((s) => s.endpoint)).size;
}
