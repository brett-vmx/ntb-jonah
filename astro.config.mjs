import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import VitePWA from '@vite-pwa/astro';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://ntb-jonah.pages.dev',
  // Default output is fully static — no SSR adapter (deploys to Cloudflare Pages as static).
  server: { port: 4415 },
  prefetch: { prefetchAll: true },
  integrations: [
    sitemap(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: {
        name: 'Jonah',
        short_name: 'Jonah',
        description: 'The Book of Jonah in Amdo, Kham, and Central/Lhasa Tibetan, with audio narration and English text.',
        theme_color: '#CFB63C',
        background_color: '#CFB63C',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // All 12 dialect audio files (largest is ~2.1MB) are precached at install
        // so playback works fully offline once the PWA is installed — no separate
        // download step needed.
        globPatterns: ['**/*.{html,js,css,webp,png,jpg,mp3,ttf}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB — covers all audio files
        // Cloudflare Pages does not honor Range requests for static assets — it
        // always returns the full file with a plain 200, never a 206 Partial
        // Content / Accept-Ranges header, regardless of the Range header sent.
        // Without Range support, HTMLMediaElement.seekable collapses to [0,0]
        // and any seek to a not-yet-downloaded position (the seek track, the
        // prev/next-verse buttons) silently fails and snaps back — reproducible
        // even with the file fully buffered client-side, in every browser.
        // workbox-range-requests fixes this at the service-worker layer: this
        // route fetches the whole file once (small either way, ~1-2MB) and then
        // synthesizes real 206 partial responses for any Range request straight
        // from that cached copy, independent of what the origin server can do.
        // Don't remove this thinking Accept-Ranges can be fixed via a `_headers`
        // file — Cloudflare Pages' Range support is a platform capability, not
        // something togglable through response headers.
        runtimeCaching: [
          {
            urlPattern: /\/audio\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-range-cache',
              rangeRequests: true,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
