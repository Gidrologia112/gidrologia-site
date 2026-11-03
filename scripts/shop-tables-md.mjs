// Таблицы без заголовка (оставшиеся HTML) → Markdown-таблицы. Двухколоночным добавляется шапка «Параметр | Значение».
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
td.use(gfm); td.keep(['sup', 'sub']);
const fix = (t) => {
  const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if (!rows.length) return t;
  const cols = (rows[0].match(/<t[dh][\s>]/gi) || []).length;
  const head = cols === 2 ? '<tr><th>Параметр</th><th>Значение</th></tr>' : rows.shift().replace(/<(\/?)td/gi, '<$1th');
  const html = `<table><thead>${head}</thead><tbody>${rows.join('')}</tbody></table>`;
  const out = td.turndown(html);
  return out.startsWith('|') ? '\n\n' + out + '\n\n' : t;
};
const conv = (s) => (s && s.includes('<table') ? s.replace(/<table[\s\S]*?<\/table>/gi, fix).replace(/\n{3,}/g, '\n\n').trim() : s);
const dir = 'src/data/shop/products'; let n = 0;
for (const f of readdirSync(dir)) {
  const p = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); let ch = false;
  for (const k of ['short', 'specs', 'specsFull', 'description', 'warranty']) { const v = conv(p[k]); if (v !== p[k]) { p[k] = v; ch = true; } }
  if (ch) { writeFileSync(`${dir}/${f}`, JSON.stringify(p, null, 2) + '\n'); n++; }
}
console.log('таблиц переделано в', n, 'товарах');
