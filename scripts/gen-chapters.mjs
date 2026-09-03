// Parses 32JONNTB.SFM (Tibetan) + Jonah_BSB.rtf (English) into per-chapter
// JSON content files at src/content/chapters/chapter-N.json.
//
// Run with: node scripts/gen-chapters.mjs
//
// Source files stay in source-assets/ — this script is the only thing that
// reads them; re-run it any time the source text changes instead of hand-editing
// the generated JSON.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const SFM_PATH = path.join(ROOT, 'source-assets/32JONNTB.SFM');
const RTF_PATH = path.join(ROOT, 'source-assets/Jonah_BSB.rtf');
const OUT_DIR = path.join(ROOT, 'src/content/chapters');

// Paths below are relative to src/content/chapters/, resolved by content.config.ts's
// image() schema helper — they point at the pre-optimized webp copies in src/assets/,
// not the original JPGs in source-assets/.
const INLINE_DIR = '../../assets/chapters/inline';
const COVER_DIR = '../../assets/chapters/covers';

// Inline illustration placement, verified against NTB Jonah_final copy.pdf —
// each image sits between the two verses named, matching the printed layout.
const INLINE_IMAGES = {
  1: [
    { after: 2, before: 3, file: `${INLINE_DIR}/p1_Jon_01_02_RG.webp` },
    { after: 6, before: 7, file: `${INLINE_DIR}/p2_Jon_01_03_RG.webp` },
    { after: 14, before: 15, file: `${INLINE_DIR}/p3_Jon_01_05_RG.webp` },
  ],
  2: [{ after: 6, before: 7, file: `${INLINE_DIR}/p5_Jon_01_06_RG.webp` }],
  3: [{ after: 7, before: 8, file: `${INLINE_DIR}/p7_Jon_03_02_RG.webp` }],
  4: [
    { after: 6, before: 7, file: `${INLINE_DIR}/p8_Jon_04_02_RG.webp` },
    { after: 9, before: 10, file: `${INLINE_DIR}/p9_Jon_04_03_RG.webp` },
  ],
};

// Homepage / chapter-card cover images. Chapter 2 uses p5 per client direction;
// the rest use the first inline image tagged for that chapter.
const COVER_IMAGES = {
  1: `${COVER_DIR}/chapter-1.webp`,
  2: `${COVER_DIR}/chapter-2.webp`,
  3: `${COVER_DIR}/chapter-3.webp`,
  4: `${COVER_DIR}/chapter-4.webp`,
};

// Dialect audio durations in seconds, read with ffprobe from the source MP3s
// (adx/bod/khg = Amdo/Central-Lhasa/Kham per John's note: bod=Central, adx=Amdo, khg=Kham).
const DURATIONS = {
  1: { adx: 271.4, bod: 177.9, khg: 182.7 },
  2: { adx: 136.7, bod: 92.6, khg: 90.5 },
  3: { adx: 148.4, bod: 98.8, khg: 99.6 },
  4: { adx: 168.9, bod: 115.4, khg: 112.7 },
};

function fmtDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 1. Parse the Tibetan SFM
// ---------------------------------------------------------------------------

function parseSfm(raw) {
  const lines = raw.split('\n').map((l) => l.replace(/\r$/, ''));
  const chapters = {}; // { [n]: { label, section, verses: { [v]: string[] } } }
  let chapterNum = null;
  let verseNum = null;
  let mode = null; // 'label' | 'section' — accumulates text until next marker

  const ensureChapter = (n) => {
    if (!chapters[n]) chapters[n] = { label: '', section: '', verses: {} };
    return chapters[n];
  };

  const stripFootnotes = (s) => s.replace(/\\f \+ \\ft.*?\\f\*/gs, '').trim();

  for (const rawLine of lines) {
    const line = rawLine;
    if (line.startsWith('\\c ')) {
      chapterNum = parseInt(line.slice(3).trim(), 10);
      ensureChapter(chapterNum);
      mode = null;
      continue;
    }
    if (chapterNum === null) continue; // skip \id, \h, \mt, \imt, \is1, \ipi front matter

    if (line.startsWith('\\cl ')) {
      chapters[chapterNum].label = line.slice(4).trim();
      continue;
    }
    if (line.startsWith('\\s ')) {
      chapters[chapterNum].section = line.slice(3).trim();
      continue;
    }
    if (line.startsWith('\\p') || line.startsWith('\\m')) {
      continue; // paragraph break — verses render as their own blocks anyway
    }
    if (line.startsWith('\\v ')) {
      const m = line.match(/^\\v (\d+) (.*)$/s);
      if (!m) continue;
      verseNum = parseInt(m[1], 10);
      const text = stripFootnotes(m[2]);
      chapters[chapterNum].verses[verseNum] = [text];
      continue;
    }
    if (line.startsWith('\\q1')) {
      const text = stripFootnotes(line.replace(/^\\q1\s?/, ''));
      if (text && verseNum !== null) {
        chapters[chapterNum].verses[verseNum].push(text);
      }
      continue;
    }
    // ignore blank lines / anything else
  }

  return chapters;
}

// ---------------------------------------------------------------------------
// 2. Parse the English BSB RTF
// ---------------------------------------------------------------------------

function unescapeRtf(s) {
  const map = {
    "\\'93": '“', "\\'94": '”', // “ ”
    "\\'92": '’', "\\'91": '‘', // ’ ‘
    "\\'97": '—', "\\'96": '–', // — –
  };
  return s.replace(/\\'9[1-9]|\\'9[0-9a-f]|\\'[0-9a-f]{2}/gi, (m) => map[m] ?? m);
}

function parseBsb(raw) {
  const verses = {}; // { [c]: { [v]: string } }
  const lines = raw.split('\n');
  for (const line of lines) {
    const m = line.match(/^(?:\\f0\\fs24 \\cf0 )?Jonah (\d+):(\d+)\t(.*?)\r?\\?$/);
    if (!m) continue;
    const [, c, v, textRaw] = m;
    const text = unescapeRtf(textRaw).trim();
    if (!verses[c]) verses[c] = {};
    verses[c][v] = text;
  }
  return verses;
}

// ---------------------------------------------------------------------------
// 3. Merge into per-chapter block lists and write JSON
// ---------------------------------------------------------------------------

function buildChapter(n, sfmChapter, bsbChapter) {
  const verseNums = Object.keys(sfmChapter.verses)
    .map(Number)
    .sort((a, b) => a - b);

  const images = INLINE_IMAGES[n] ?? [];
  const imageAfter = new Map(images.map((img) => [img.after, img.file]));

  const blocks = [];
  for (const v of verseNums) {
    blocks.push({
      type: 'verse',
      number: v,
      bo: sfmChapter.verses[v],
      en: bsbChapter?.[v] ?? '',
    });
    if (imageAfter.has(v)) {
      blocks.push({ type: 'image', file: imageAfter.get(v) });
    }
  }

  return {
    chapterNumber: n,
    order: n,
    labelBo: sfmChapter.label,
    sectionTitleBo: sfmChapter.section,
    cover: COVER_IMAGES[n],
    verseCount: verseNums.length,
    audio: {
      adx: `/audio/adx/chapter-${n}.mp3`,
      bod: `/audio/bod/chapter-${n}.mp3`,
      khg: `/audio/khg/chapter-${n}.mp3`,
    },
    duration: {
      adx: fmtDuration(DURATIONS[n].adx),
      bod: fmtDuration(DURATIONS[n].bod),
      khg: fmtDuration(DURATIONS[n].khg),
    },
    blocks,
  };
}

function main() {
  const sfmRaw = fs.readFileSync(SFM_PATH, 'utf8');
  const rtfRaw = fs.readFileSync(RTF_PATH, 'latin1');

  const sfmChapters = parseSfm(sfmRaw);
  const bsbChapters = parseBsb(rtfRaw);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const n of Object.keys(sfmChapters).map(Number).sort((a, b) => a - b)) {
    const chapter = buildChapter(n, sfmChapters[n], bsbChapters[n]);
    const outPath = path.join(OUT_DIR, `chapter-${n}.json`);
    fs.writeFileSync(outPath, JSON.stringify(chapter, null, 2) + '\n');
    console.log(
      `chapter ${n}: ${chapter.verseCount} verses, ${chapter.blocks.filter((b) => b.type === 'image').length} inline images -> ${path.relative(ROOT, outPath)}`,
    );
  }
}

main();
