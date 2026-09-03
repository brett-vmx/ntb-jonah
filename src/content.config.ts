import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const verseBlock = z.object({
  type: z.literal('verse'),
  number: z.number(),
  bo: z.array(z.string()), // one entry per poetic line; prose verses have length 1
  en: z.string(),
});

const chapters = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/chapters' }),
  schema: ({ image }) =>
    z.object({
      chapterNumber: z.number(),
      order: z.number(),
      labelBo: z.string(), // e.g. ལེའུ་དང་པོ། ("Chapter One")
      sectionTitleBo: z.string(),
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
      blocks: z.array(
        z.discriminatedUnion('type', [
          verseBlock,
          z.object({ type: z.literal('image'), file: image() }),
        ]),
      ),
    }),
});

export const collections = { chapters };
