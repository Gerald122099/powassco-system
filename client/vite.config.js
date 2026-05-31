import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'screenshot-mobile.png', 'screenshot-wide.png'],
      manifest: {
        // Stable identity across updates — Chrome / PWABuilder use this to
        // de-dupe installs and keep the user's local data when the origin's
        // display name changes.
        id: '/?source=pwa',
        name: 'POWASSCO Multipurpose Cooperative',
        short_name: 'POWASSCO',
        description: 'Water billing, meter reading, loans, and member services for POWASSCO Multipurpose Cooperative.',
        lang: 'en',
        dir: 'ltr',
        theme_color: '#166534',
        background_color: '#ffffff',
        display: 'standalone',
        // Fallback chain so devices that don't support `standalone`
        // (e.g. older Safari) still get the best available experience.
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'portrait',
        // Installed PWA opens directly to the plumber's Field Mode — the
        // primary Android use case (offline meter reading). Plumbers stay
        // signed in (30-day JWT) so a cold start lands them on their
        // dashboard with no extra taps. If they're signed out, the
        // Protected wrapper kicks them to /employee-login, and after
        // logging in routeAfter sends them right back to /plumber.
        start_url: '/plumber',
        scope: '/',
        categories: ['utilities', 'business', 'productivity'],
        prefer_related_applications: false,
        // Exact-dimension PNGs so PWABuilder doesn't flag mismatched sizes
        // (logo.png is 511x512, not 512x512 — the dedicated icon-* files
        // are generated from it during build prep).
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Required by PWABuilder + Play Store. Placeholder branded
        // screenshots; replace with real screen captures when ready.
        screenshots: [
          {
            src: '/screenshot-mobile.png',
            sizes: '720x1280',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'POWASSCO on phone',
          },
          {
            src: '/screenshot-wide.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'POWASSCO on desktop',
          },
        ],
        // Quick-access launcher icons (Android long-press / Windows jump
        // list). Each shortcut lands directly on the relevant dashboard;
        // Protected redirects to the user's role-home if they don't have
        // access, so it stays safe even with the wrong role logged in.
        shortcuts: [
          {
            name: 'Field Mode',
            short_name: 'Field',
            description: 'Read assigned meters offline',
            url: '/plumber',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Cashier Lookup',
            short_name: 'Cashier',
            description: 'Look up dues + receive walk-in payments',
            url: '/cashier',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Water Billing',
            short_name: 'Water',
            description: 'Members, bills, payments',
            url: '/water',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        // Cache the app shell so it loads offline; API data is handled by IndexedDB.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Never let the SW intercept cross-origin API calls.
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        // Activate a new service worker immediately so users see the latest
        // build on the next page load instead of after a manual reload.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
