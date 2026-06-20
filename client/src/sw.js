/* eslint-disable no-restricted-globals */
// POWASSCO custom service worker (vite-plugin-pwa "injectManifest"
// mode). We still get Workbox's precaching for the app shell, plus we
// own the push/notificationclick handlers so saved meters can receive
// reminders and clicking a notification deep-links into /inquiry.

import { precacheAndRoute, matchPrecache } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

// 1) Precache everything Vite included in the build manifest. The
//    self.__WB_MANIFEST array is injected at build time.
precacheAndRoute(self.__WB_MANIFEST || []);

// 2) SPA navigation fallback → the PRECACHED index.html, never /api/*.
//    IMPORTANT: Workbox stores index.html under a revisioned URL
//    (/index.html?__WB_REVISION__=…), so a plain caches.match("/index.html")
//    MISSES it and we'd fall through to fetch() — which fails with no
//    signal ("site can't be reached"). matchPrecache() resolves the
//    revisioned entry, so the field app shell loads fully OFFLINE.
async function appShell() {
  return (
    (await matchPrecache("/index.html")) ||
    (await matchPrecache("index.html")) ||
    (await caches.match("/index.html", { ignoreSearch: true })) ||
    (await caches.match("/", { ignoreSearch: true })) ||
    fetch("/index.html")
  );
}
const navigationRoute = new NavigationRoute(() => appShell(), { denylist: [/^\/api\//] });
registerRoute(navigationRoute);

// 3) Activate immediately on update so users see the new bundle on
//    next page load (matches the previous skipWaiting + clientsClaim
//    configuration).
self.skipWaiting();
clientsClaim();

// 3a) Map tile caching — the Meter Map fetches a lot of small PNGs
// from external tile providers (OSM, Esri Imagery, Carto). Without
// caching, every map open re-downloads the same tiles over the same
// cell signal, making the satellite layer feel slow and burning the
// reader's data plan. CacheFirst on tiles gives an instant paint;
// expiration plugin caps the cache so it doesn't grow without bound.
//
// Three separate caches so we can tune / clear each provider
// independently. maxEntries chosen for a single barangay coverage
// at zooms 14–19 (the range the operator actually uses).
function tileRoute(matcher, cacheName, maxEntries = 400, maxAgeDays = 30) {
  registerRoute(
    matcher,
    new CacheFirst({
      cacheName,
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({
          maxEntries,
          maxAgeSeconds: maxAgeDays * 24 * 60 * 60,
          // Prevent ballooning quota on devices with limited storage.
          purgeOnQuotaError: true,
        }),
      ],
    })
  );
}
tileRoute(/^https:\/\/[a-c]\.tile\.openstreetmap\.org\//, "osm-tiles");
tileRoute(/^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\//, "esri-imagery", 600);
tileRoute(/^https:\/\/[a-d]\.basemaps\.cartocdn\.com\//, "carto-tiles");

// 3b) Leaflet's marker glyph PNGs (the default pin) and any inline
// assets it pulls from /leaflet/dist/images/. StaleWhileRevalidate
// lets the icon paint instantly while a fresh copy quietly fetches
// in the background.
registerRoute(
  ({ url }) => url.pathname.includes("/leaflet/dist/images/"),
  new StaleWhileRevalidate({
    cacheName: "leaflet-assets",
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 90 * 24 * 60 * 60 })],
  })
);

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
