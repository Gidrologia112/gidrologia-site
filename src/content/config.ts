import { defineCollection, z } from 'astro:content';

// Публикации (статьи) и события. Тексты переносятся из базы NetCat скриптом scripts/import-netcat.mjs.
const post = z.object({
  title: z.string(),
  date: z.string().optional(),        // ГГГГ-ММ-ДД
  url: z.string().optional(),          // адрес из кабинета редактора (= имя файла)
  rubric: z.string().optional(),
  rubrics: z.array(z.string()).optional(), // все рубрики записи (на старом сайте их могло быть несколько)
  netcatId: z.number().optional(),
  excerpt: z.string().optional(),
  cover: z.string().optional(),       // /img/...
  source: z.string().optional(),      // «По материалам: …»
  old: z.string().optional(),         // старый адрес на NetCat
  order: z.number().optional(),       // порядок, если нет даты (меньше — выше)
  imported: z.boolean().default(false),
});

// Архив форума (phpBB): одна тема = один JSON, создаётся scripts/import-forum.py
const forum = defineCollection({ type: 'data', schema: z.object({
  id: z.number(), forum: z.string(), title: z.string(),
  posts: z.array(z.object({ id: z.number(), author: z.string(), date: z.string(), html: z.string(),
    photos: z.array(z.object({ src: z.string(), thumb: z.string(), name: z.string() })) })),
}) });

export const collections = {
  forum,
  publikatsii: defineCollection({ type: 'content', schema: post }),
  sobytiya: defineCollection({ type: 'content', schema: post }),
  // Подробный текст услуги. Имя файла = slug из src/data/services/*.json
  uslugi: defineCollection({ type: 'content', schema: z.object({ title: z.string().optional(), imported: z.boolean().default(false) }) }),
};
