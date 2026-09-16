// src/i18n/settings-store.ts
// Client-side reading-settings state (vanilla, no framework), following the
// same localStorage + CustomEvent pattern as Tenpa's language-store.ts.
//
// Five independent settings:
//   jonah-text-lang    'bo' | 'en' | 'cmn' | 'hi' | 'ne'            default 'bo'
//   jonah-font         'ouchan2' | 'choukmatik' | 'dutsa2'         default 'ouchan2'
//   jonah-text-size    'sm' | 'md' | 'lg' | 'xl'                  default 'md'
//   jonah-text-layout  'verse' | 'paragraph'                      default 'verse'
//   jonah-dialect      'adx' | 'bod' | 'khg' | 'eng' | 'cmn'        default 'bod'
//
// Text lang / font / text size / layout only affect the READ section of an
// open chapter modal (dispatched as 'jonah:text-settings-changed'). Dialect
// only affects the LISTEN tile's audio source (dispatched as
// 'jonah:dialect-changed'). Kept as separate settings/events so changing one
// never disturbs in-progress audio playback.
//
// One-directional coupling (Brett's request): picking English or Chinese as
// the reading language also switches the audio track to match — most
// readers who switch to English text want English audio, not to keep
// whatever Tibetan dialect happened to be selected. See setTextLang()'s
// "keep the audio track aligned" block. This does NOT run in reverse —
// manually picking a dialect from the LISTEN-bar's 5-option popover never
// changes the reading language, so "read English, listen to Amdo" is still
// a reachable combination if someone deliberately picks it that way
// afterward; the coupling only fires on the text-language change itself.
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

export type TextLang = 'bo' | 'en' | 'cmn' | 'hi' | 'ne';
export type TibetanFont = 'ouchan2' | 'choukmatik' | 'dutsa2';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export type TextLayout = 'verse' | 'paragraph';
export type Dialect = 'adx' | 'bod' | 'khg' | 'eng' | 'cmn';

const TEXT_LANG_KEY = 'jonah-text-lang';
const FONT_KEY = 'jonah-font';
const TEXT_SIZE_KEY = 'jonah-text-size';
const TEXT_LAYOUT_KEY = 'jonah-text-layout';
const DIALECT_KEY = 'jonah-dialect';

const TEXT_LANGS: readonly TextLang[] = ['bo', 'en', 'cmn', 'hi', 'ne'];
const FONTS: readonly TibetanFont[] = ['ouchan2', 'choukmatik', 'dutsa2'];
const SIZES: readonly TextSize[] = ['sm', 'md', 'lg', 'xl'];
const LAYOUTS: readonly TextLayout[] = ['verse', 'paragraph'];
const DIALECTS: readonly Dialect[] = ['adx', 'bod', 'khg', 'eng', 'cmn'];
const TIBETAN_DIALECTS: readonly Dialect[] = ['adx', 'bod', 'khg'];

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

// Tibetan gets +2px at every size step (John: Tibetan specifically read
// small at all four sizes; English/Chinese were fine as-is) — a separate
// map rather than a flat offset so each step is still a clean rem value.
// Hindi/Nepali use the flat TEXT_SIZE_REM too, same as English/Chinese —
// nothing about either script was flagged as reading small.
// Applied in applyTextSettings() based on the *current reading language*,
// not a font/size setting of its own — switching reading language must
// re-apply this (see the textLangBtns click handler in Layout.astro).
export const TEXT_SIZE_REM_TIBETAN: Record<TextSize, string> = {
  sm: '1.125rem', // 16px + 2px
  md: '1.275rem', // 18.4px + 2px
  lg: '1.475rem', // 21.6px + 2px
  xl: '1.725rem', // 25.6px + 2px
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

  // Keep the audio track aligned with the chosen reading language. English/
  // Chinese map 1:1 to their own audio track. Tibetan only forces a change
  // when the current dialect isn't already one of the three Tibetan ones
  // (arriving from English/Chinese) — it never overrides a deliberate
  // Amdo/Central/Kham choice by snapping to a fixed default. setDialect()
  // fires its own 'jonah:dialect-changed' event, so the open chapter's
  // audio (if any) updates the same way a manual dialect pick would.
  //
  // Hindi/Nepali have no audio of their own (John: no capacity yet to make
  // timing files, and no one to verify recordings) — deliberately NOT
  // included in this coupling, so picking either one leaves the dialect
  // exactly as it was. That's what lets someone read Hindi/Nepali text with
  // whichever of the 5 existing audio tracks they prefer, picked
  // independently from the LISTEN-bar popover.
  if (v === 'en' && getDialect() !== 'eng') setDialect('eng');
  else if (v === 'cmn' && getDialect() !== 'cmn') setDialect('cmn');
  else if (v === 'bo' && !TIBETAN_DIALECTS.includes(getDialect())) setDialect('bod');
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

/**
 * Applies the current font + text size as CSS custom properties on :root.
 * Text size depends on the *reading language*, not just the text-size
 * setting — Tibetan uses TEXT_SIZE_REM_TIBETAN (+2px at every step), so this
 * must be re-called on a language change too, not just a font/size change.
 */
export function applyTextSettings(): void {
  document.documentElement.style.setProperty('--font-tibetan-active', FONT_STACKS[getFont()]);
  const sizeMap = getTextLang() === 'bo' ? TEXT_SIZE_REM_TIBETAN : TEXT_SIZE_REM;
  document.documentElement.style.setProperty('--reading-font-size', sizeMap[getTextSize()]);
}
