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
        name: 'NTB Jonah',
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
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
