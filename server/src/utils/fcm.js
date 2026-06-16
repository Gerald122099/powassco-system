// Firebase Cloud Messaging (FCM) helper — the native-app push channel,
// parallel to utils/push.js (Web Push). It is a SAFE NO-OP until two
// things are in place, so it never affects the running server:
//
//   1. `npm i firebase-admin` in server/  (the SDK is lazy-imported)
//   2. env FIREBASE_SERVICE_ACCOUNT = the service-account JSON (one line)
//      — or GOOGLE_APPLICATION_CREDENTIALS pointing at the JSON file.
//
// Until then fcmEnabled() is false and every send returns { ok:false,
// reason:"fcm_disabled" }. Web Push keeps working regardless.
import FcmToken from "../models/FcmToken.js";

let messaging = null;
let triedInit = false;

// Lazily import firebase-admin + initialize once. Returns the messaging
// instance or null (missing SDK / missing creds → disabled).
async function getMessaging() {
  if (messaging) return messaging;
  if (triedInit) return messaging; // already failed once; stay disabled
  triedInit = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const hasFileCreds = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw && !hasFileCreds) {
    console.warn("⚠️  FIREBASE_SERVICE_ACCOUNT not set — native FCM push disabled.");
    return null;
  }
  let admin;
  try {
    admin = (await import("firebase-admin")).default;
  } catch {
    console.warn("⚠️  firebase-admin not installed — native FCM push disabled (run `npm i firebase-admin`).");
    return null;
  }
  try {
    const cred = raw ? admin.credential.cert(JSON.parse(raw)) : admin.credential.applicationDefault();
    const app = admin.apps?.length ? admin.apps[0] : admin.initializeApp({ credential: cred });
    messaging = app.messaging();
    return messaging;
  } catch (e) {
    console.error("FCM init failed:", e?.message || e);
    return null;
  }
}

export async function fcmEnabled() {
  return (await getMessaging()) != null;
}

// Upsert a device token + its saved handles (called by the subscribe route).
export async function registerFcmToken({ token, items = [], platform = "android" }) {
  if (!token) return { ok: false, reason: "no_token" };
  const cleanItems = (Array.isArray(items) ? items : [])
    .filter((i) => i && i.kind && i.value)
    .map((i) => ({ kind: i.kind, value: String(i.value).toUpperCase().trim() }))
    .filter((i, idx, arr) => arr.findIndex((x) => x.kind === i.kind && x.value === i.value) === idx);
  const doc = await FcmToken.findOneAndUpdate(
    { token },
    { $set: { token, items: cleanItems, platform, lastSeenAt: new Date() } },
    { new: true, upsert: true }
  );
  return { ok: true, id: doc._id, items: doc.items };
}

// Build an FCM message from the same payload shape the SW/web-push uses.
function toMessage(tokens, payload) {
  const url = payload?.url || "/";
  return {
    tokens,
    notification: { title: payload?.title || "POWASSCO", body: payload?.body || "" },
    data: {
      url: String(url),
      ...(payload?.tag ? { tag: String(payload.tag) } : {}),
    },
    android: {
      priority: "high",
      // Channel created on-device by lib/nativePush.js (createChannel).
      notification: { channelId: "powassco" },
    },
    webpush: { fcmOptions: { link: String(url) } },
  };
}

// Send `payload` to the given device docs, in batches of 500, pruning
// tokens FCM reports as permanently invalid. Returns { sent, removed }.
async function sendToDocs(msg, docs, payload) {
  if (!docs.length) return { sent: 0, removed: 0 };
  let sent = 0;
  const dead = [];
  for (let i = 0; i < docs.length; i += 500) {
    const batch = docs.slice(i, i + 500);
    const tokens = batch.map((d) => d.token);
    try {
      const resp = await msg.sendEachForMulticast(toMessage(tokens, payload));
      resp.responses.forEach((r, idx) => {
        if (r.success) { sent += 1; return; }
        const code = r.error?.code || "";
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          dead.push(tokens[idx]);
        }
      });
    } catch (e) {
      console.error("FCM send batch error:", e?.message || e);
    }
  }
  let removed = 0;
  if (dead.length) {
    const r = await FcmToken.deleteMany({ token: { $in: dead } });
    removed = r.deletedCount || 0;
  }
  return { sent, removed };
}

// Send to every native device that saved ANY of the given handles
// (de-duped by token). handles: [{ kind, value }].
export async function fcmToHandles(handles, payload) {
  const msg = await getMessaging();
  if (!msg) return { ok: false, reason: "fcm_disabled", sent: 0 };
  const clauses = (handles || [])
    .filter((h) => h && h.kind && h.value)
    .map((h) => ({ "items.kind": h.kind, "items.value": String(h.value).toUpperCase() }));
  if (!clauses.length) return { ok: true, sent: 0, devices: 0 };

  const docs = await FcmToken.find({ $or: clauses });
  const seen = new Set();
  const unique = docs.filter((d) => (seen.has(d.token) ? false : seen.add(d.token)));
  const { sent, removed } = await sendToDocs(msg, unique, payload);
  return { ok: true, sent, removed, devices: unique.length };
}

// Broadcast to every native device. Used for cooperative-wide announcements.
export async function fcmToAll(payload) {
  const msg = await getMessaging();
  if (!msg) return { ok: false, reason: "fcm_disabled", sent: 0 };
  const docs = await FcmToken.find({});
  const { sent, removed } = await sendToDocs(msg, docs, payload);
  return { ok: true, sent, removed, total: docs.length };
}
