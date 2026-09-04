import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const verseBlock = z.object({
  type: z.literal('verse'),
  number: z.number(),
  bo: z.array(z.string()), // one entry per poetic line; prose verses have length 1
  en: z.string(),
});

// Verse-start timestamps (seconds) for read-along highlighting, from John's
// forced-aligner export. Only Amdo exists so far — bod/khg are null until
// those timing files arrive; the reading UI just skips highlighting then.
const timingTrack = z
  .array(z.object({ verse: z.number(), time: z.number() }))
  .nullable();

const chapters = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/chapters' }),
  schema: ({ image }) =>
    z.object({
      chapterNumber: z.number(),
      order: z.number(),
      labelBo: z.string(), // e.g. ལེའུ་དང་པོ། ("Chapter One")
      sectionTitleBo: z.string(),
      labelEn: z.string(), // e.g. "Chapter 1" — shown when text language is English
      sectionTitleEn: z.string(),
      cover: image(),
      verseCount: z.number(),
      audio: z.object({
        adx: z.string(), // Amdo
        bod: z.string(), // Central / Lhasa
        khg: z.string(), // Kham
      }),
      duration: z.object({
        adx: z.string(),
        bod: z.string(),
        khg: z.string(),
      }),
      timing: z.object({
        adx: timingTrack,
        bod: timingTrack,
        khg: timingTrack,
      }),
      blocks: z.array(
        z.discriminatedUnion('type', [
          verseBlock,
          z.object({ type: z.literal('image'), file: image() }),
        ]),
      ),
    }),
});

export const collections = { chapters };
