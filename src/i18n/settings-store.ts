// src/i18n/settings-store.ts
// Client-side reading-settings state (vanilla, no framework), following the
// same localStorage + CustomEvent pattern as Tenpa's language-store.ts.
//
// Four independent settings:
//   jonah-text-lang  'bo' | 'en'                          default 'bo'
//   jonah-font       'ouchan5' | 'ouchan2' | 'sambhota'    default 'ouchan5'
//   jonah-text-size  'sm' | 'md' | 'lg' | 'xl'             default 'md'
//   jonah-dialect    'adx' | 'bod' | 'khg'                 default 'bod'
//
// Text lang / font / text size only affect the READ section of an open
// chapter modal (dispatched as 'jonah:text-settings-changed'). Dialect only
// affects the LISTEN tile's audio source (dispatched as
// 'jonah:dialect-changed'). Kept separate so changing one never disturbs
// in-progress audio playback.

export type TextLang = 'bo' | 'en';
export type TibetanFont = 'ouchan5' | 'ouchan2' | 'sambhota';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export type Dialect = 'adx' | 'bod' | 'khg';

const TEXT_LANG_KEY = 'jonah-text-lang';
const FONT_KEY = 'jonah-font';
const TEXT_SIZE_KEY = 'jonah-text-size';
const DIALECT_KEY = 'jonah-dialect';

const TEXT_LANGS: readonly TextLang[] = ['bo', 'en'];
const FONTS: readonly TibetanFont[] = ['ouchan5', 'ouchan2', 'sambhota'];
const SIZES: readonly TextSize[] = ['sm', 'md', 'lg', 'xl'];
const DIALECTS: readonly Dialect[] = ['adx', 'bod', 'khg'];

export const FONT_STACKS: Record<TibetanFont, string> = {
  ouchan5: '"Monlam Uni OuChan5", "Monlam Uni OuChan2", "SambhotaDege", sans-serif',
  ouchan2: '"Monlam Uni OuChan2", "Monlam Uni OuChan5", "SambhotaDege", sans-serif',
  sambhota: '"SambhotaDege", "Monlam Uni OuChan5", "Monlam Uni OuChan2", sans-serif',
};

export const TEXT_SIZE_REM: Record<TextSize, string> = {
  sm: '1rem',
  md: '1.15rem',
  lg: '1.35rem',
  xl: '1.6rem',
};

// Dialect names in both scripts, shared by the header's dialect sheet
// (Layout.astro) and the modal's LISTEN tile (index.astro) so the two never
// drift out of sync.
export const DIALECT_LABELS: Record<Dialect, { en: string; bo: string }> = {
  adx: { en: 'Amdo', bo: 'ཨ་མདོ' },
  bod: { en: 'Lhasa', bo: 'ལྷ་ས' },
  khg: { en: 'Kham', bo: 'ཁམས' },
};

function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = localStorage.getItem(key);
  return stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback;
}

export const getTextLang = (): TextLang => readEnum(TEXT_LANG_KEY, TEXT_LANGS, 'bo');
export const getFont = (): TibetanFont => readEnum(FONT_KEY, FONTS, 'ouchan5');
export const getTextSize = (): TextSize => readEnum(TEXT_SIZE_KEY, SIZES, 'md');
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
export function setDialect(v: Dialect): void {
  localStorage.setItem(DIALECT_KEY, v);
  window.dispatchEvent(new CustomEvent('jonah:dialect-changed', { detail: { dialect: v } }));
}

/** Applies the current font + text size as CSS custom properties on :root. */
export function applyTextSettings(): void {
  document.documentElement.style.setProperty('--font-tibetan-active', FONT_STACKS[getFont()]);
  document.documentElement.style.setProperty('--reading-font-size', TEXT_SIZE_REM[getTextSize()]);
}
