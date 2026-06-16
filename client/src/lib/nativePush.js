// Native (Capacitor/Android) push via FCM. On the plain web every export
// is a no-op — the website keeps using Web Push (lib/pushClient.js). The
// native member app uses this instead, because a Capacitor WebView can't
// rely on the browser Push API.
//
// Requires @capacitor/push-notifications (installed) and, in the Android
// project, a Firebase google-services.json. Registration is a no-op until
// those exist, so this never breaks the web build.
import { apiFetch } from "./api";
import { isNativeApp } from "./native";

const TOKEN_KEY = "pow_fcm_token";
let listenersBound = false;
let pendingItems = [];

export function getSavedFcmToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

// Register this device for FCM and upload the saved handles so reminders
// reach it. Safe to call repeatedly (listeners bind once). No-op on web.
export async function registerNativeFcm(items = []) {
  if (!isNativeApp()) return { ok: false, reason: "not_native" };
  pendingItems = Array.isArray(items) ? items : [];
  let PushNotifications;
  try {
    ({ PushNotifications } = await import("@capacitor/push-notifications"));
  } catch {
    return { ok: false, reason: "plugin_missing" };
  }

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return { ok: false, reason: "permission_denied" };

    // Android 8+ needs a channel for notifications to display; the FCM
    // payload targets channelId "powassco". No-op on iOS/older Android.
    try {
      await PushNotifications.createChannel({
        id: "powassco",
        name: "POWASSCO Alerts",
        description: "Bill reminders and announcements",
        importance: 4, // HIGH — heads-up + sound
        visibility: 1, // public on the lock screen
      });
    } catch { /* not supported on this platform */ }

    if (!listenersBound) {
      listenersBound = true;
      await PushNotifications.addListener("registration", async (token) => {
        try {
          localStorage.setItem(TOKEN_KEY, token.value);
          await apiFetch("/public/push/fcm-subscribe", {
            method: "POST",
            body: { token: token.value, items: pendingItems, platform: "android" },
          });
        } catch { /* best-effort */ }
      });
      await PushNotifications.addListener("registrationError", (err) => {
        console.warn("FCM registration error:", err?.error || err);
      });
      // Tapping a notification deep-links to its url.
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const url = action?.notification?.data?.url;
        if (url) { try { window.location.assign(url); } catch { /* ignore */ } }
      });
    }

    await PushNotifications.register();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "register_failed", error: e?.message };
  }
}

// Push an updated handle list for the already-registered device.
export async function updateNativeFcmItems(items = []) {
  if (!isNativeApp()) return { ok: false, reason: "not_native" };
  const token = getSavedFcmToken();
  pendingItems = Array.isArray(items) ? items : [];
  if (!token) return registerNativeFcm(items); // not registered yet → do it now
  try {
    await apiFetch("/public/push/fcm-update-items", { method: "POST", body: { token, items: pendingItems } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message };
  }
}

export async function disableNativeFcm() {
  if (!isNativeApp()) return;
  const token = getSavedFcmToken();
  if (!token) return;
  try { await apiFetch("/public/push/fcm-unsubscribe", { method: "POST", body: { token } }); } catch { /* ignore */ }
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}
