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
// Chinese Union Version (1989, Simplified) — Brett's second reading-language
// addition alongside English. Same USFM-style \c/\v/\p markers as the
// Tibetan SFM, plus \pn...\pn* proper-name tags to strip.
const CMN_USFM_PATH = path.join(ROOT, 'source-assets/33-JONcmn-cu89s.usfm');
const TIMING_DIR = path.join(ROOT, 'source-assets/timing');
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

// English chapter label + section title, shown in the modal when the reader's
// text-language setting is English. These are editorial titles (not in the
// SFM or BSB source — English translations don't carry section headings) —
// short study-Bible-style outline titles matching each Tibetan sectionTitleBo.
const ENGLISH_TITLES = {
  1: { label: 'Chapter 1', section: 'Jonah Flees from the LORD' },
  2: { label: 'Chapter 2', section: "Jonah's Prayer" },
  3: { label: 'Chapter 3', section: 'Jonah Goes to Nineveh' },
  4: { label: 'Chapter 4', section: "Jonah's Anger at the LORD's Compassion" },
};

// Chinese chapter label — the CUV source has no \cl-equivalent "Chapter N"
// line (unlike the Tibetan SFM), so this is a small editorial addition, same
// spirit as ENGLISH_TITLES's label. sectionTitleCmn comes straight from the
// CUV source's own \s1 lines instead (see parseCmnUsfm) — no translation
// needed there.
const CHINESE_LABELS = { 1: '第一章', 2: '第二章', 3: '第三章', 4: '第四章' };

// Dialect audio durations in seconds, read with ffprobe from the source MP3s
// (adx/bod/khg = Amdo/Central-Lhasa/Kham per John's note: bod=Central, adx=Amdo, khg=Kham).
// eng/cmn added when Brett supplied BSB (English) and ElevenLabs-generated
// CUV (Chinese) audio — see "Chinese and English integration" in CLAUDE.md.
const DURATIONS = {
  1: { adx: 271.4, bod: 177.9, khg: 182.7, eng: 154.5, cmn: 164.8 },
  2: { adx: 136.7, bod: 92.6, khg: 90.5, eng: 72.0, cmn: 77.8 },
  3: { adx: 148.4, bod: 98.8, khg: 99.6, eng: 85.6, cmn: 82.2 },
  4: { adx: 168.9, bod: 115.4, khg: 112.7, eng: 99.7, cmn: 110.2 },
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
  const chapters = {}; // { [n]: { label, section, verses: { [v]: string[] }, paragraphStarts: Set<v> } }
  let chapterNum = null;
  let verseNum = null;
  let pendingParagraph = false; // saw \p or \m, not yet attached to the next verse

  const ensureChapter = (n) => {
    if (!chapters[n]) chapters[n] = { label: '', section: '', verses: {}, paragraphStarts: new Set() };
    return chapters[n];
  };

  const stripFootnotes = (s) => s.replace(/\\f \+ \\ft.*?\\f\*/gs, '').trim();

  for (const rawLine of lines) {
    const line = rawLine;
    if (line.startsWith('\\c ')) {
      chapterNum = parseInt(line.slice(3).trim(), 10);
      ensureChapter(chapterNum);
      verseNum = null;
      pendingParagraph = false;
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
      pendingParagraph = true; // attach to whichever verse comes next
      continue;
    }
    if (line.startsWith('\\v ')) {
      const m = line.match(/^\\v (\d+) (.*)$/s);
      if (!m) continue;
      verseNum = parseInt(m[1], 10);
      const text = stripFootnotes(m[2]);
      chapters[chapterNum].verses[verseNum] = [text];
      if (pendingParagraph) {
        chapters[chapterNum].paragraphStarts.add(verseNum);
        pendingParagraph = false;
      }
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
// 2b. Parse the Chinese CUV USFM (Brett's second reading-language addition).
//    Same \c/\v/\p/\s1 marker shape as the Tibetan SFM, plus inline
//    \pn...\pn* proper-name tags (stripped, keeping the name text). No
//    poetry line breaks (\q1) in this source, so cmn is a plain string per
//    verse — unlike bo's array-of-lines.
// ---------------------------------------------------------------------------

function parseCmnUsfm(raw) {
  const chapters = {}; // { [n]: { section, verses: { [v]: string } } }
  let chapterNum = null;
  let verseNum = null;
  let buf = [];

  const flush = () => {
    if (chapterNum !== null && verseNum !== null && buf.length) {
      chapters[chapterNum].verses[verseNum] = buf.join('').trim();
    }
    buf = [];
  };

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let m = line.match(/^\\c\s+(\d+)/);
    if (m) {
      flush();
      chapterNum = parseInt(m[1], 10);
      chapters[chapterNum] = { section: '', verses: {} };
      verseNum = null;
      continue;
    }
    if (chapterNum === null) continue; // skip \id/\h/\toc/\mt front matter

    m = line.match(/^\\s1\s+(.*)$/);
    if (m) {
      chapters[chapterNum].section = m[1].trim();
      continue;
    }
    m = line.match(/^\\v\s+(\d+)\s*(.*)$/);
    if (m) {
      flush();
      verseNum = parseInt(m[1], 10);
      buf = [m[2]];
      continue;
    }
    if (line.startsWith('\\p') || line.startsWith('\\m')) continue;
    if (verseNum !== null) buf.push(line);
  }
  flush();

  // Strip \pn/\pn* proper-name markers (keep the name text) and any other
  // stray backslash markers, then collapse whitespace (meaningless in
  // Chinese, unlike English/Tibetan word-spacing).
  for (const c of Object.values(chapters)) {
    for (const v of Object.keys(c.verses)) {
      c.verses[v] = c.verses[v]
        .replace(/\\pn\*/g, '')
        .replace(/\\pn/g, '')
        .replace(/\\[a-zA-Z0-9]+\*?/g, '')
        .replace(/\s+/g, '');
    }
  }
  return chapters;
}

// ---------------------------------------------------------------------------
// 3. Parse per-dialect verse-timing files (word/verse-aligned export from
//    John's forced-aligner). Each line is "start\tend\t[verseNumber]" —
//    start === end (a single timestamp, not a range), and the verse number
//    is only present on the line marking that verse's first spoken syllable.
//    The other, unnumbered lines are finer phrase-level markers within the
//    verse; not used yet, but harmless to ignore.
//
//    Only Amdo (adx) timing files exist so far — bod/khg return null and the
//    app just skips read-along highlighting for those dialects until John
//    sends the rest. Filenames follow either the adx audio convention
//    (chapter-N, no padding) or the bod audio convention (chapter-0N) since
//    we don't yet know which one future dialects will use.
// ---------------------------------------------------------------------------

function findTimingFile(dialect, n) {
  const nn = String(n).padStart(2, '0');
  const candidates = [
    `${dialect}_32_JON_${n}.txt`,
    `${dialect}_32_JON_${nn}.txt`,
    // John's bod timing files use a third convention: hyphens throughout,
    // zero-padded, with a "-timing" suffix — e.g. bod-32-JON-01-timing.txt.
    `${dialect}-32-JON-${n}-timing.txt`,
    `${dialect}-32-JON-${nn}-timing.txt`,
  ];
  for (const name of candidates) {
    const p = path.join(TIMING_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseTiming(dialect, n) {
  const filePath = findTimingFile(dialect, n);
  if (!filePath) return null;

  const raw = fs.readFileSync(filePath, 'utf8');
  const verses = [];
  for (const line of raw.split('\n')) {
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const verse = parseInt(cols[2].trim(), 10);
    if (Number.isNaN(verse)) continue; // unnumbered sub-verse marker — skip
    verses.push({ verse, time: parseFloat(cols[0]) });
  }
  return verses.length ? verses : null;
}

// ---------------------------------------------------------------------------
// 4. Merge into per-chapter block lists and write JSON
// ---------------------------------------------------------------------------

function buildChapter(n, sfmChapter, bsbChapter, cmnChapter) {
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
      cmn: cmnChapter?.verses[v] ?? '',
      // True at each SFM \p/\m marker — i.e. this verse starts a new paragraph.
      // Used by the paragraph-layout reading mode; verse-by-verse mode ignores it.
      paragraphStart: sfmChapter.paragraphStarts.has(v),
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
    labelEn: ENGLISH_TITLES[n].label,
    sectionTitleEn: ENGLISH_TITLES[n].section,
    labelCmn: CHINESE_LABELS[n],
    sectionTitleCmn: cmnChapter?.section ?? '',
    cover: COVER_IMAGES[n],
    verseCount: verseNums.length,
    audio: {
      adx: `/audio/adx/chapter-${n}.mp3`,
      bod: `/audio/bod/chapter-${n}.mp3`,
      khg: `/audio/khg/chapter-${n}.mp3`,
      eng: `/audio/eng/chapter-${n}.mp3`,
      cmn: `/audio/cmn/chapter-${n}.mp3`,
    },
    duration: {
      adx: fmtDuration(DURATIONS[n].adx),
      bod: fmtDuration(DURATIONS[n].bod),
      khg: fmtDuration(DURATIONS[n].khg),
      eng: fmtDuration(DURATIONS[n].eng),
      cmn: fmtDuration(DURATIONS[n].cmn),
    },
    timing: {
      adx: parseTiming('adx', n),
      bod: parseTiming('bod', n),
      khg: parseTiming('khg', n),
      eng: parseTiming('eng', n),
      cmn: parseTiming('cmn', n),
    },
    blocks,
  };
}

function main() {
  const sfmRaw = fs.readFileSync(SFM_PATH, 'utf8');
  const rtfRaw = fs.readFileSync(RTF_PATH, 'latin1');
  const cmnRaw = fs.readFileSync(CMN_USFM_PATH, 'utf8');

  const sfmChapters = parseSfm(sfmRaw);
  const bsbChapters = parseBsb(rtfRaw);
  const cmnChapters = parseCmnUsfm(cmnRaw);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const n of Object.keys(sfmChapters).map(Number).sort((a, b) => a - b)) {
    const chapter = buildChapter(n, sfmChapters[n], bsbChapters[n], cmnChapters[n]);
    const outPath = path.join(OUT_DIR, `chapter-${n}.json`);
    fs.writeFileSync(outPath, JSON.stringify(chapter, null, 2) + '\n');
    const timingDialects = Object.entries(chapter.timing)
      .filter(([, v]) => v)
      .map(([k]) => k);
    console.log(
      `chapter ${n}: ${chapter.verseCount} verses, ${chapter.blocks.filter((b) => b.type === 'image').length} inline images, timing: [${timingDialects.join(', ') || 'none'}] -> ${path.relative(ROOT, outPath)}`,
    );
  }
}

main();
