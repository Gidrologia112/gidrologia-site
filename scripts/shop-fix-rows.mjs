// Строки Markdown-таблиц, разорванные переносами (абзацы внутри ячеек NetCat), склеиваются в одну.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const pipes = (s) => (s.replace(/\\\|/g, '').match(/\|/g) || []).length;
const fix = (s) => {
  if (!s || !s.includes('|')) return s;
  const out = []; let buf = null;
  for (const line of s.split('\n')) {
    if (buf !== null) { buf += ' ' + line.trim(); if (/\|\s*$/.test(line) && pipes(buf) >= 3) { out.push(buf.replace(/\s{2,}/g, ' ').replace(/\|\s+/g, '| ').replace(/\s+\|/g, ' |')); buf = null; } continue; }
    if (/^\|/.test(line) && (!/\|\s*$/.test(line) || pipes(line) < 2)) { buf = line.trimEnd(); continue; }
    out.push(line);
  }
  if (buf !== null) out.push(buf);
  return out.join('\n');
};
const dir = 'src/data/shop/products'; let n = 0;
for (const f of readdirSync(dir)) {
  const p = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); let ch = false;
  for (const k of ['short', 'specs', 'specsFull', 'description', 'warranty']) { const v = fix(p[k]); if (v !== p[k]) { p[k] = v; ch = true; } }
  if (ch) { writeFileSync(`${dir}/${f}`, JSON.stringify(p, null, 2) + '\n'); n++; }
}
console.log('исправлено товаров:', n);
