import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import VitePWA from '@vite-pwa/astro';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://ntb-jonah.netlify.app',
  // Default output is fully static — no SSR adapter (deploys to Cloudflare Pages as static).
  server: { port: 4415 },
  prefetch: { prefetchAll: true },
  integrations: [
    sitemap(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      // injectManifest (custom src/sw.js), not generateSW — needed so audio
      // can be excluded from the automatic precache and routed only through
      // the CacheFirst+RangeRequestsPlugin strategy in src/sw.js. See that
      // file's comments for why generateSW's declarative runtimeCaching
      // wasn't enough on its own.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
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
      injectManifest: {
        // mp3 deliberately excluded — audio is NOT part of the generated
        // precache manifest. It's handled entirely by src/sw.js's own
        // CacheFirst+RangeRequestsPlugin route instead, which is what
        // actually makes seeking work (see src/sw.js for the full story).
        // Putting mp3 back here re-introduces a competing precache route
        // for those same URLs, which wins over the Range-aware route and
        // silently breaks prev/next-verse and the seek track again.
        // woff2 added alongside ttf for the Chinese font (public/fonts/
        // NotoSansSC-*.woff2) — same "offline-ready after install" reasoning
        // as the Tibetan ttf files already here.
        globPatterns: ['**/*.{html,js,css,webp,png,jpg,ico,ttf,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
