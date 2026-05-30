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
        name: 'POWASSCO Multipurpose Cooperative',
        short_name: 'POWASSCO',
        description: 'Water billing, meter reading, loans, and member services.',
        theme_color: '#166534',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png' },
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
