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
// Hindi (2017) and Nepali (Unlocked Literal Bible) — text-only reading
// languages, no audio (John: no capacity yet to make Hindi/Nepali timing
// files, and no one to verify recordings). Both are plain USFM \c/\v/\p/\s1
// like the Chinese source, so they share one parser (parseIndicUsfm) instead
// of Chinese's own (which additionally strips all whitespace — meaningless
// for Chinese, but wrong for these two word-spaced scripts). Hindi's source
// also carries footnotes (\f + \fr...\f*) and inline \it/\bdit formatting
// tags that CUV doesn't, so the shared parser strips those too.
const HI_USFM_PATH = path.join(ROOT, 'source-assets/33-JONhin2017.usfm');
const NE_USFM_PATH = path.join(ROOT, 'source-assets/33-JONnpiulb.usfm');
// Book introduction (John's request #20, third round of quick edits) —
// Tibetan only, per John: no introductions needed for the other reading
// languages. Saved as an RTF (a Word/TextEdit export), but the body is
// literally USFM markup (\mt/\imt/\is1/\ipi) typed as plain text inside
// it — decodeIntroRtf() below un-escapes Cocoa RTF's \uc0\uNNNN Unicode
// scheme into real characters rather than shelling out to a Mac-only tool
// like `textutil`, matching this script's existing from-scratch RTF
// handling for Jonah_BSB.rtf (unescapeRtf/parseBsb below).
const INTRO_RTF_PATH = path.join(ROOT, 'source-assets/NTB_Jonah_Introduction.rtf');
const TIMING_DIR = path.join(ROOT, 'source-assets/timing');
const OUT_DIR = path.join(ROOT, 'src/content/chapters');
const INTRO_OUT_DIR = path.join(ROOT, 'src/content/intro');

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

// Hindi/Nepali chapter label — same "no \cl marker" gap as Chinese, and the
// same word ("अध्याय", chapter) works unchanged in both languages, so one
// map covers both instead of duplicating identical values twice.
const INDIC_CHAPTER_LABELS = { 1: 'अध्याय 1', 2: 'अध्याय 2', 3: 'अध्याय 3', 4: 'अध्याय 4' };

// Hindi's USFM source carries its own \s1 section titles (used as-is, no
// translation needed — see parseIndicUsfm). Nepali's source has none at all
// (unlike Hindi/Chinese), so these are editorial titles, provisionally
// translated by Claude to match the same theme as the Hindi/English titles —
// flag for John/Brett to confirm wording, same caveat as the About page's
// provisional English/Chinese translations.
const NEPALI_TITLES = {
  1: 'परमेश्‍वरको आज्ञाको उल्लङ्घन',
  2: 'योनाको प्रार्थना',
  3: 'आज्ञाको पालना',
  4: 'योनाको रिस र परमेश्‍वरको दया',
};

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
// 2c. Parse Hindi/Nepali USFM (Brett's third/fourth reading-language
//    addition — text only, no audio). Shared by both since they're the same
//    plain \c/\v/\p/\s1 USFM shape; unlike parseCmnUsfm this keeps normal
//    word-spacing (collapsed, not stripped) since neither script is written
//    without spaces. \q1 continuation lines are appended to the current
//    verse's buffer, same treatment as the Tibetan SFM's own \q1 handling,
//    except the result stays a single string per verse (not an array of
//    lines) — verse-by-verse mode just doesn't get separate poetry lines for
//    these two, matching how English/Chinese already work. Hindi's footnotes
//    (\f + \fr...\f*) and inline \it/\bdit formatting tags are stripped;
//    Nepali's source has neither.
// ---------------------------------------------------------------------------

function stripIndicMarkup(s) {
  return s
    .replace(/\\f \+.*?\\f\*/gs, '') // footnotes — whole note dropped, incl. \fr/\ft/\fq content
    .replace(/\\(bdit|it)\*?/g, '') // inline emphasis tags — text kept, tags stripped
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIndicUsfm(raw) {
  const chapters = {}; // { [n]: { section: string, verses: { [v]: string } } }
  let chapterNum = null;
  let verseNum = null;
  let buf = [];

  const flush = () => {
    if (chapterNum !== null && verseNum !== null && buf.length) {
      chapters[chapterNum].verses[verseNum] = stripIndicMarkup(buf.join(' '));
    }
    buf = [];
  };

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line) continue;

    let m = line.match(/^\\c\s+(\d+)/);
    if (m) {
      flush();
      chapterNum = parseInt(m[1], 10);
      chapters[chapterNum] = { section: '', verses: {} };
      verseNum = null;
      continue;
    }
    if (chapterNum === null) continue; // skip \id/\h/\toc/\mt/\is1/\ip front matter

    m = line.match(/^\\s1\s*(.*)$/);
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
    m = line.match(/^\\q1\s?(.*)$/);
    if (m) {
      if (m[1] && verseNum !== null) buf.push(m[1]);
      continue;
    }
    if (line.startsWith('\\p') || line.startsWith('\\m')) continue;
    if (verseNum !== null) buf.push(line);
  }
  flush();
  return chapters;
}

// ---------------------------------------------------------------------------
// 2d. Parse the book introduction (Tibetan only). The RTF is Cocoa-flavored
//    (TextEdit/macOS export): every non-ASCII character is a \uc0\uNNNN
//    escape, a literal "\" is doubled to "\\" (so the USFM tags typed as
//    plain text — \mt, \imt, \is1, \ipi — survive as literal text once
//    un-escaped), and a lone "\" immediately before a real newline is
//    Cocoa RTF's shorthand for a paragraph break. decodeIntroRtf() walks
//    the file once, left to right, handling exactly those cases (plus
//    skipping any other stray control word) — this only needs to handle
//    what this one export actually contains, not the general RTF spec.
// ---------------------------------------------------------------------------

function decodeIntroRtf(raw) {
  const bodyStart = raw.indexOf('\\f0\\fs24');
  const body = bodyStart >= 0 ? raw.slice(bodyStart) : raw;

  let out = '';
  let i = 0;
  while (i < body.length) {
    if (body[i] === '\\' && body[i + 1] === '\\') {
      out += '\\';
      i += 2;
      continue;
    }
    if (body[i] === '\\') {
      const rest = body.slice(i, i + 30);
      let m;
      if ((m = rest.match(/^\\uc0/))) { i += m[0].length; continue; }
      if ((m = rest.match(/^\\u(-?\d+) ?/))) {
        let code = parseInt(m[1], 10);
        if (code < 0) code += 65536; // RTF encodes >32767 codepoints as signed 16-bit
        out += String.fromCharCode(code);
        i += m[0].length;
        continue;
      }
      if (body[i + 1] === '\n') { out += '\n'; i += 2; continue; }
      if (body[i + 1] === '\r' && body[i + 2] === '\n') { out += '\n'; i += 3; continue; }
      if ((m = rest.match(/^\\[a-zA-Z]+-?\d*\s?/))) { i += m[0].length; continue; } // any other stray control word
      i += 1;
      continue;
    }
    if (body[i] === '{' || body[i] === '}') { i++; continue; } // group braces (only the final closing brace appears in the body)
    out += body[i];
    i++;
  }
  return out;
}

// \mt is the book's own title, \imt the introduction's own (longer) title —
// shown as the modal's small label + heading, same pairing as a chapter's
// labelBo/sectionTitleBo. \is1 starts a new section; every \ipi until the
// next \is1 (or end of file) is one of that section's paragraphs — the
// outline section's numbered/lettered sub-points are already literal text
// in the source (the Tibetan letters ཀ/ཁ/ག/ང plus verse-range parens), so
// they don't need any special list markup, just one paragraph per \ipi.
function parseIntro(raw) {
  const text = decodeIntroRtf(raw);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let mainTitle = '';
  let introTitle = '';
  const sections = [];

  for (const line of lines) {
    let m;
    if ((m = line.match(/^\\mt\s+(.*)$/))) { mainTitle = m[1]; continue; }
    if ((m = line.match(/^\\imt\s+(.*)$/))) { introTitle = m[1]; continue; }
    if ((m = line.match(/^\\is1\s+(.*)$/))) { sections.push({ heading: m[1], paragraphs: [] }); continue; }
    if ((m = line.match(/^\\ipi\s+(.*)$/))) {
      if (sections.length) sections[sections.length - 1].paragraphs.push(m[1]);
      continue;
    }
    // ignore any other front-matter marker (\rem, \is1/\ipi handled above)
  }

  return { mainTitle, introTitle, sections };
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

function buildChapter(n, sfmChapter, bsbChapter, cmnChapter, hiChapter, neChapter) {
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
      hi: hiChapter?.verses[v] ?? '',
      ne: neChapter?.verses[v] ?? '',
      // True at each SFM \p/\m marker — i.e. this verse starts a new paragraph.
      // Used by the paragraph-layout reading mode; verse-by-verse mode ignores it.
      // Reused for every reading language (not just bo) — see CLAUDE.md's
      // "Verse-by-verse vs. paragraph layout" note.
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
    labelHi: INDIC_CHAPTER_LABELS[n],
    sectionTitleHi: hiChapter?.section ?? '',
    labelNe: INDIC_CHAPTER_LABELS[n],
    sectionTitleNe: NEPALI_TITLES[n],
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
  const hiRaw = fs.readFileSync(HI_USFM_PATH, 'utf8');
  const neRaw = fs.readFileSync(NE_USFM_PATH, 'utf8');
  const introRaw = fs.readFileSync(INTRO_RTF_PATH, 'latin1');

  const sfmChapters = parseSfm(sfmRaw);
  const bsbChapters = parseBsb(rtfRaw);
  const cmnChapters = parseCmnUsfm(cmnRaw);
  const hiChapters = parseIndicUsfm(hiRaw);
  const neChapters = parseIndicUsfm(neRaw);
  const intro = parseIntro(introRaw);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(INTRO_OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(INTRO_OUT_DIR, 'jonah.json'), JSON.stringify(intro, null, 2) + '\n');
  console.log(`intro: ${intro.sections.length} sections -> ${path.relative(ROOT, path.join(INTRO_OUT_DIR, 'jonah.json'))}`);

  for (const n of Object.keys(sfmChapters).map(Number).sort((a, b) => a - b)) {
    const chapter = buildChapter(n, sfmChapters[n], bsbChapters[n], cmnChapters[n], hiChapters[n], neChapters[n]);
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
