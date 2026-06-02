/* eslint-disable no-restricted-globals */
// POWASSCO custom service worker (vite-plugin-pwa "injectManifest"
// mode). We still get Workbox's precaching for the app shell, plus we
// own the push/notificationclick handlers so saved meters can receive
// reminders and clicking a notification deep-links into /inquiry.

import { precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

// 1) Precache everything Vite included in the build manifest. The
//    self.__WB_MANIFEST array is injected at build time.
precacheAndRoute(self.__WB_MANIFEST || []);

// 2) Same behavior as the generated SW we replaced: SPA navigation
//    fallback to /index.html, never intercept /api/*.
const navigationRoute = new NavigationRoute(
  async () => (await caches.match("/index.html")) || fetch("/index.html"),
  { denylist: [/^\/api\//] }
);
registerRoute(navigationRoute);

// 3) Activate immediately on update so users see the new bundle on
//    next page load (matches the previous skipWaiting + clientsClaim
//    configuration).
self.skipWaiting();
clientsClaim();

// 4) Push handler. The server sends a JSON payload:
//      { title, body, url, tag? }
//    Falls back to a generic POWASSCO notification when the payload
//    is missing or malformed (push without payload).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "POWASSCO", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "POWASSCO";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "powassco-push",
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || "/inquiry" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 5) Click handler — focus an existing tab on the same origin if
//    there is one (and navigate it to the saved URL), or open a new
//    tab on /inquiry?... so the user lands on the bill that prompted
//    the notification.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/inquiry";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin) {
            await client.focus();
            try { client.navigate(targetUrl); } catch { /* some browsers disallow cross-doc */ }
            return;
          }
        } catch { /* ignore */ }
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
