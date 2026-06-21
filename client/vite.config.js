import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom SW (src/sw.js) so we can own push + notificationclick
      // handlers. Workbox precaching is still wired up inside that file
      // via injectManifest's __WB_MANIFEST placeholder.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: 'inline',
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
        // The DEFAULT install is the MEMBER app — it opens to the public
        // homepage (bills, balance, announcements), NOT the staff login.
        // Field staff get the separate field manifest (/field.webmanifest,
        // start_url /plumber) which ManifestForRoute swaps in while on the
        // /plumber and /meter routes, plus the dedicated field APK.
        start_url: '/',
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
            name: 'My Bills',
            short_name: 'Bills',
            description: 'Check your water bills and dues',
            url: '/inquiry',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'My Balance',
            short_name: 'Balance',
            description: 'Savings and Share Capital (CBU)',
            url: '/check-balance',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'My Account',
            short_name: 'Account',
            description: 'Member home, reminders, and app PIN',
            url: '/app',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      // injectManifest mode reads src/sw.js as the source of truth.
      // We tell it which files to add to the precache manifest there.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // recharts (+ its d3/victory-vendor deps, ~300 KB) is used by two
        // separate lazy panels (Analytics + Audit report). Without this it's
        // duplicated in BOTH chunks. Splitting it into one shared "charts"
        // chunk dedupes it and lets the browser cache it once. It stays lazy
        // (only those panels import it), so initial page load is unaffected.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('victory-vendor') || /[\\/]d3-[^\\/]+[\\/]/.test(id)) {
              return 'charts';
            }
          }
        },
      },
    },
  },
})
