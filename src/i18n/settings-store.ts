// src/i18n/settings-store.ts
// Client-side reading-settings state (vanilla, no framework), following the
// same localStorage + CustomEvent pattern as Tenpa's language-store.ts.
//
// Five independent settings:
//   jonah-text-lang    'bo' | 'en' | 'cmn'                         default 'bo'
//   jonah-font         'ouchan2' | 'choukmatik' | 'dutsa2'         default 'ouchan2'
//   jonah-text-size    'sm' | 'md' | 'lg' | 'xl'                  default 'md'
//   jonah-text-layout  'verse' | 'paragraph'                      default 'verse'
//   jonah-dialect      'adx' | 'bod' | 'khg' | 'eng' | 'cmn'        default 'bod'
//
// Text lang / font / text size / layout only affect the READ section of an
// open chapter modal (dispatched as 'jonah:text-settings-changed'). Dialect
// only affects the LISTEN tile's audio source (dispatched as
// 'jonah:dialect-changed'). Kept separate so changing one never disturbs
// in-progress audio playback — and independent on purpose: reading Chinese
// while listening to the Amdo dialect is a valid combination, not something
// the app forces to match.
//
// "Dialect" now spans two different kinds of thing sharing one setting: the
// three Tibetan *dialects* of the one Tibetan text (adx/bod/khg) and two
// full audio *tracks* in their own languages (eng, cmn) — added once Brett
// supplied BSB (English) and ElevenLabs-generated CUV (Chinese) audio. Kept
// as a single flat Dialect type/setting rather than splitting it, since
// every other place in the code (the LISTEN-bar popover, audio src lookup,
// timing lookup) already just needs "which of N audio options" with no
// reason to distinguish where in that list the boundary between "dialect"
// and "language" falls.

export type TextLang = 'bo' | 'en' | 'cmn';
export type TibetanFont = 'ouchan2' | 'choukmatik' | 'dutsa2';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export type TextLayout = 'verse' | 'paragraph';
export type Dialect = 'adx' | 'bod' | 'khg' | 'eng' | 'cmn';

const TEXT_LANG_KEY = 'jonah-text-lang';
const FONT_KEY = 'jonah-font';
const TEXT_SIZE_KEY = 'jonah-text-size';
const TEXT_LAYOUT_KEY = 'jonah-text-layout';
const DIALECT_KEY = 'jonah-dialect';

const TEXT_LANGS: readonly TextLang[] = ['bo', 'en', 'cmn'];
const FONTS: readonly TibetanFont[] = ['ouchan2', 'choukmatik', 'dutsa2'];
const SIZES: readonly TextSize[] = ['sm', 'md', 'lg', 'xl'];
const LAYOUTS: readonly TextLayout[] = ['verse', 'paragraph'];
const DIALECTS: readonly Dialect[] = ['adx', 'bod', 'khg', 'eng', 'cmn'];

// John's latest font request, in order: Monlam Uni OuChan2 (block/u-chen,
// default), ChoukMatik and Dutsa2 (both u-med/"headless" cursive styles,
// offered as optional alternates — replaces the earlier OuChan5/SambhotaDege set).
export const FONT_STACKS: Record<TibetanFont, string> = {
  ouchan2: '"Monlam Uni OuChan2", "Monlam Uni ChoukMatik", "Monlam Uni Dutsa2", sans-serif',
  choukmatik: '"Monlam Uni ChoukMatik", "Monlam Uni OuChan2", "Monlam Uni Dutsa2", sans-serif',
  dutsa2: '"Monlam Uni Dutsa2", "Monlam Uni OuChan2", "Monlam Uni ChoukMatik", sans-serif',
};

export const TEXT_SIZE_REM: Record<TextSize, string> = {
  sm: '1rem',
  md: '1.15rem',
  lg: '1.35rem',
  xl: '1.6rem',
};

// Dialect/audio-track names in both scripts, shared by the modal's LISTEN-bar
// popover and (for the 3 Tibetan dialects only) the header settings sheet's
// conditional dialect row — see "Audio dialect picker" in CLAUDE.md. "Central"
// per John (not "Lhasa"). Bo labels for adx/bod/khg are John's second-round
// wording, each with a trailing shad (།) per his explicit request. eng/cmn's
// bo labels (English/Chinese *language* names, not dialect names) are
// Claude's provisional translation, following the same "X-skad" pattern as
// the three dialects for consistency — flag for John to confirm exact
// wording, same caveat as the LISTEN label's translation.
export const DIALECT_LABELS: Record<Dialect, { en: string; bo: string }> = {
  adx: { en: 'Amdo', bo: 'ཨམ་སྐད།' },
  bod: { en: 'Central', bo: 'དབུས་སྐད།' },
  khg: { en: 'Kham', bo: 'ཁམས་སྐད།' },
  eng: { en: 'English', bo: 'དབྱིན་སྐད།' },
  cmn: { en: 'Chinese', bo: 'རྒྱ་སྐད།' },
};

function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = localStorage.getItem(key);
  return stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback;
}

export const getTextLang = (): TextLang => readEnum(TEXT_LANG_KEY, TEXT_LANGS, 'bo');
export const getFont = (): TibetanFont => readEnum(FONT_KEY, FONTS, 'ouchan2');
export const getTextSize = (): TextSize => readEnum(TEXT_SIZE_KEY, SIZES, 'md');
export const getTextLayout = (): TextLayout => readEnum(TEXT_LAYOUT_KEY, LAYOUTS, 'verse');
export const getDialect = (): Dialect => readEnum(DIALECT_KEY, DIALECTS, 'bod');

export function setTextLang(v: TextLang): void {
  localStorage.setItem(TEXT_LANG_KEY, v);
  window.dispatchEvent(new CustomEvent('jonah:text-settings-changed'));
}
export function setFont(v: TibetanFont): void {
  localStorage.setItem(FONT_KEY, v);
  window.dispatchEvent(new CustomEvent('jonah:text-settings-changed'));
}
export function setTextSize(v: TextSize): void {
  localStorage.setItem(TEXT_SIZE_KEY, v);
  window.dispatchEvent(new CustomEvent('jonah:text-settings-changed'));
}
export function setTextLayout(v: TextLayout): void {
  localStorage.setItem(TEXT_LAYOUT_KEY, v);
  window.dispatchEvent(new CustomEvent('jonah:text-settings-changed'));
}
export function setDialect(v: Dialect): void {
  localStorage.setItem(DIALECT_KEY, v);
  window.dispatchEvent(new CustomEvent('jonah:dialect-changed', { detail: { dialect: v } }));
}

// Playback speed persists across chapters within a session (John: it used to
// reset to 1x on every chapter switch). No custom event — only one chapter's
// audio player exists at a time, and it reads this at its own init instead of
// needing to react live to a change made elsewhere.
const SPEED_KEY = 'jonah-speed';
export function getPlaybackSpeed(): number {
  const stored = Number(localStorage.getItem(SPEED_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : 1;
}
export function setPlaybackSpeed(v: number): void {
  localStorage.setItem(SPEED_KEY, String(v));
}

/** Applies the current font + text size as CSS custom properties on :root. */
export function applyTextSettings(): void {
  document.documentElement.style.setProperty('--font-tibetan-active', FONT_STACKS[getFont()]);
  document.documentElement.style.setProperty('--reading-font-size', TEXT_SIZE_REM[getTextSize()]);
}
