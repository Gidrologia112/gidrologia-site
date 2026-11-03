// Тексты магазина из HTML NetCat → Markdown, чтобы их было удобно править в кабинете.
// Таблицы без заголовка, <sup>/<sub> остаются HTML внутри Markdown — сайт их показывает как есть.
//   node scripts/shop-to-md.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**', br: '  ' });
td.use(gfm);
td.keep(['sup', 'sub', 'iframe']);
// В ячейках таблиц NetCat бывают абзацы и переносы — в Markdown-таблице ячейка должна быть одной строкой
const flatCells = (h) => h.replace(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi, (_, t, a, c) =>
  `<${t}${a}>${c.replace(/<\/?(p|div)[^>]*>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').replace(/<\/strong>\s*<strong>/gi, '').trim()}</${t}>`);
const md = (h) => {
  if (!h || !/<[a-z]/i.test(h)) return h || '';
  return td.turndown(flatCells(h)).replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, (m) => (m === '  ' ? m : '')).trim();
};

const dir = 'src/data/shop/products';
let n = 0;
for (const f of readdirSync(dir)) {
  const p = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  for (const k of ['short', 'specs', 'specsFull', 'description', 'warranty']) p[k] = md(p[k]);
  writeFileSync(`${dir}/${f}`, JSON.stringify(p, null, 2) + '\n');
  n++;
}
// Разделы: файл-объект { items: [...] } — так их правит кабинет
const cRaw = JSON.parse(readFileSync('src/data/shop/categories.json', 'utf8'));
const items = (Array.isArray(cRaw) ? cRaw : cRaw.items).map((c) => ({ ...c, text: md(c.text) }));
writeFileSync('src/data/shop/categories.json', JSON.stringify({ items }, null, 2) + '\n');
// Страницы «Оплата», «Доставка», «Гарантии»
const pages = JSON.parse(readFileSync('src/data/shop/pages.json', 'utf8'));
for (const k of Object.keys(pages)) { pages[k].body = md(pages[k].body ?? pages[k].html); delete pages[k].html; }
writeFileSync('src/data/shop/pages.json', JSON.stringify(pages, null, 2) + '\n');
console.log(`товаров ${n}, разделов ${items.length}, страниц ${Object.keys(pages).length}`);
