import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://gidrologia.ru',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
});
