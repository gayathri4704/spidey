import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      // ── Registration strategy ─────────────────────────
      // 'autoUpdate' → service worker updates silently in background.
      registerType: 'autoUpdate',

      // Inject SW registration automatically
      injectRegister: 'auto',

      // ── Dev mode ─────────────────────────────────────
      devOptions: {
        enabled: true,
        type: 'module',
      },

      // ── Web App Manifest ─────────────────────────────
      manifest: {
        name:             'Spidey',
        short_name:       'Spidey',
        description:      'Spidey music, chat and todo app',
        start_url:        '/',
        scope:            '/',
        display:          'standalone',
        orientation:      'portrait',
        background_color: '#1e1e27',
        theme_color:      '#df0139',

        icons: [
          {
            src:     '/icons/icon-192.png',
            sizes:   '192x192',
            type:    'image/png',
            purpose: 'any',
          },
          {
            src:     '/icons/icon-512.png',
            sizes:   '512x512',
            type:    'image/png',
            purpose: 'any',
          },
          {
            src:     '/icons/maskable-512.png',
            sizes:   '512x512',
            type:    'image/png',
            purpose: 'maskable',
          },
        ],

        // Additional platform metadata
        categories: ['music', 'entertainment', 'social'],
        lang:       'en',
      },

      // ── Workbox (service worker) configuration ───────
      workbox: {
        // ── App Shell pre-caching ─────────────────────
        // Cache all pre-built static assets emitted by Vite.
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,woff,woff2,ttf,eot}',
        ],

        // ── URLs to NEVER cache ───────────────────────
        // Supabase REST/Auth/Realtime, WebRTC STUN, any upload endpoint.
        navigateFallbackDenylist: [
          /^\/rest\//,
          /^\/auth\//,
          /^\/realtime\//,
          /^\/storage\//,
        ],

        // ── Runtime caching rules ─────────────────────
        runtimeCaching: [
          // 1. Block Supabase API/Auth/Realtime — always go to network
          {
            urlPattern: /supabase\.co\/(rest|auth|realtime|storage)/i,
            handler:    'NetworkOnly',
          },

          // 2. Block WebRTC STUN servers
          {
            urlPattern: /stun\.l\.google\.com/i,
            handler:    'NetworkOnly',
          },

          // 3. Google Fonts stylesheets
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler:    'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries:    10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // 4. Google Fonts files (woff/woff2)
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler:    'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries:    30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // 5. App navigation fallback
          // Any navigate request that isn't pre-cached → return index.html
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler:    'NetworkFirst',
            options: {
              cacheName:             'pages',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries:    10,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
            },
          },
        ],

        // Skip waiting so the new SW activates immediately
        skipWaiting:  true,
        clientsClaim: true,

        // Increase size warning (audio blobs can be large)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
      },
    }),
  ],
});
