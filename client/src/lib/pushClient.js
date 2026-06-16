// Small wrapper around the Push API + our /api/public/push endpoints.
// Public visitors call enablePush() and updatePushItems() — no auth.
//
// On the native app a Capacitor WebView can't use the browser Push API,
// so these route to FCM (lib/nativePush.js) instead; on the web they use
// Web Push as before. Callers don't need to know which channel is active.
import { apiFetch } from "./api";
import { isNativeApp } from "./native";
import { registerNativeFcm, updateNativeFcmItems, disableNativeFcm } from "./nativePush";

function urlB64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getCurrentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Returns the active subscription (creating + registering if needed)
// AND uploads the items list to the server so future notifications
// reach this device for those handles.
export async function enablePushForItems(items) {
  // Native app → FCM channel (no browser Push API in the WebView).
  if (isNativeApp()) {
    const r = await registerNativeFcm(items);
    if (!r.ok && r.reason === "permission_denied") {
      throw new Error("Permission denied. Allow notifications in your phone settings.");
    }
    return r;
  }
  if (!pushSupported()) throw new Error("Push notifications aren't supported on this device or browser.");
  const perm = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permission denied. Allow notifications in your browser settings.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await apiFetch("/public/push/vapid-key");
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey),
    });
  }
  await apiFetch("/public/push/subscribe", {
    method: "POST",
    body: { subscription: sub.toJSON(), items },
  });
  return sub;
}

export async function updatePushItems(items) {
  if (isNativeApp()) return updateNativeFcmItems(items);
  const sub = await getCurrentSubscription();
  if (!sub) return null;
  await apiFetch("/public/push/update-items", {
    method: "POST",
    body: { endpoint: sub.endpoint, items },
  });
  return sub;
}

export async function disablePush() {
  if (isNativeApp()) return disableNativeFcm();
  const sub = await getCurrentSubscription();
  if (!sub) return;
  try {
    await apiFetch("/public/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } });
  } catch { /* ignore */ }
  try { await sub.unsubscribe(); } catch { /* ignore */ }
}
