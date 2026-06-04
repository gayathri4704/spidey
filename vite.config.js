import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      // ── Registration strategy ─────────────────────────
      // 'autoUpdate'  → service worker updates silently in the background.
      // The new SW takes over on the next page reload.
      registerType: 'autoUpdate',

      // Include the virtual SW entry point in the build
      injectRegister: 'auto',

      // ── Dev mode ─────────────────────────────────────
      // Keep PWA active during `npm run dev` so you can
      // inspect the service worker in DevTools.
      devOptions: {
        enabled: true,
        type: 'module',
      },

      // ── Web App Manifest ─────────────────────────────
      manifest: {
        name:             'Spidey',
        short_name:       'Spidey',
        description:      'Your friendly neighbourhood music app. Upload songs, build playlists, go offline.',
        start_url:        '/',
        display:          'standalone',
        orientation:      'portrait-primary',
        background_color: '#0a0c14',   // --bg-primary (dark navy)
        theme_color:      '#c0392b',   // --spidey-red

        icons: [
          {
            src:     '/icon-192.png',
            sizes:   '192x192',
            type:    'image/png',
            purpose: 'any',
          },
          {
            src:     '/icon-512.png',
            sizes:   '512x512',
            type:    'image/png',
            purpose: 'any',
          },
          {
            // Maskable variant uses the same 512 image.
            // Works with safe-zone padding since the icon
            // has a dark background that fills to the edges.
            src:     '/icon-512.png',
            sizes:   '512x512',
            type:    'image/png',
            purpose: 'maskable',
          },
        ],

        // Additional platform metadata
        categories: ['music', 'entertainment'],
        lang:       'en',
      },

      // ── Workbox (service worker) configuration ───────
      workbox: {
        // ── App Shell caching strategy ────────────────
        // Cache all pre-built assets (JS, CSS, HTML, SVG, fonts).
        // These are the files that Vite emits into dist/.
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,woff,woff2,ttf,eot}',
        ],

        // ── Runtime caching rules ─────────────────────
        runtimeCaching: [
          // 1. Google Fonts stylesheets
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName:          'google-fonts-stylesheets',
              expiration: {
                maxEntries:       10,
                maxAgeSeconds:    60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // 2. Google Fonts files (woff/woff2)
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName:          'google-fonts-webfonts',
              expiration: {
                maxEntries:       30,
                maxAgeSeconds:    60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // 3. App navigation fallback
          // Any navigation request that isn't pre-cached returns index.html
          // so the React SPA always loads (even offline).
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName:          'pages',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries:       10,
                maxAgeSeconds:    60 * 60 * 24 * 7, // 1 week
              },
            },
          },
        ],

        // ── IndexedDB note ────────────────────────────
        // Audio Blobs uploaded by the user live in IndexedDB
        // (managed by src/db/spideyDB.js). The service worker
        // does NOT intercept or cache those – they persist
        // natively in the browser's storage and are available
        // offline automatically via IDB.

        // Skip waiting so the new SW activates immediately
        skipWaiting:  true,
        clientsClaim: true,

        // Increase the size warning threshold because
        // some audio blobs may be large
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
      },
    }),
  ],
});
