import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
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
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
