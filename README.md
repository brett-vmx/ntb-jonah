# Jonah

A mobile-first PWA for reading and listening to the Book of Jonah in three
Tibetan dialects — Amdo, Kham, and Central (Lhasa) — alongside the English
text (Berean Standard Bible). Built for New Tibetan Bible (new-tibetan-bible.com).

Works fully offline once installed: all text and audio (for all three
dialects) are cached at install time.

## Tech stack

- **Astro 5**, static output (no SSR adapter)
- **Tailwind CSS v4** via the Vite plugin
- **Astro Content Collections** using the Astro 5 loader API (`src/content.config.ts`)
- **@vite-pwa/astro** for offline support
- Vanilla JS only — no React/Vue/framework islands
- **Lucide** icons

## Project layout

```
source-assets/          Original files from the client — SFM text, RTF (English),
                         PDF layout reference, raw JPGs/MP3s/fonts, per-dialect
                         verse-timing exports (timing/). Not used directly by
                         the app; kept as the source of truth for regeneration.
scripts/
  gen-chapters.mjs       Parses source-assets/32JONNTB.SFM (Tibetan),
                         Jonah_BSB.rtf (English), and source-assets/timing/*.txt
                         into src/content/chapters/*.json. Re-run this
                         (`npm run gen-chapters`) any time the source text or
                         timing files change — don't hand-edit the generated JSON.
src/
  content.config.ts      Content collection schema (chapters)
  content/chapters/      Generated per-chapter data (verses, inline image
                         placement, audio paths, durations, verse timing)
  assets/chapters/       Optimized cover + inline illustration images (webp)
  assets/branding/       Logo variants
  components/            ChapterCard.astro
  layouts/                Layout.astro
  pages/                  index.astro (home + reading modal), chapter/[n].astro
                         (static fallback page for direct links / crawlers)
public/
  audio/{adx,bod,khg}/    Dialect audio, one file per chapter
  fonts/                  Self-hosted Tibetan Unicode fonts
  icons/                  PWA icons
```

## Fonts

Three Tibetan fonts are bundled (`public/fonts/`, declared in `src/styles/global.css`):

- **Monlam Uni OuChan5** — primary reading face. Same design as OuChan2 but
  wider glyph spacing; easier to read at small sizes on a phone.
- **Monlam Uni OuChan2** — the more compact cut of the same family. Fallback.
- **SambhotaDege** — a distinct, more traditional/calligraphic typeface.
  Despite the "Sambhota" name (an older, pre-Unicode Tibetan encoding
  system), this particular file carries a real Unicode Tibetan cmap and
  renders standard Unicode text correctly.

## Image placement

Inline illustrations are placed at the exact verse position they appear at
in `source-assets/NTB Jonah_final copy.pdf` — see the `INLINE_IMAGES` map in
`scripts/gen-chapters.mjs` for the verified chapter/verse → image mapping.

## Development

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # -> dist/
npm run preview
```

## Deployment

Static build, deployed to Cloudflare Pages, connected to this GitHub repo
for auto-deploy on push to `main`.
