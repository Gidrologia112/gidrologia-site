// После сборки: картинкам в текстах без подписи (alt) даём подпись по заголовку страницы — для поиска по картинкам и доступности.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
let pages = 0, fixed = 0;
function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'admin' && n !== '_astro') walk(p); continue; }
    if (n !== 'index.html') continue;
    let html = readFileSync(p, 'utf8');
    const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
    if (!h1) continue;
    const title = h1.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().replace(/"/g, '&quot;');
    let i = 0;
    const out = html.replace(/<img\b[^>]*>/g, (tag) => {
      if (/\balt="[^"]+"/.test(tag) || /\.svg["?]/.test(tag)) return tag;
      i++; fixed++;
      const alt = `${title} — фото ${i}`;
      return /\balt=""/.test(tag) ? tag.replace(/\balt=""/, `alt="${alt}"`) : tag.replace(/^<img/, `<img alt="${alt}"`);
    });
    if (out !== html) { writeFileSync(p, out); pages++; }
  }
}
walk('dist');
console.log(`alt: подписано ${fixed} картинок на ${pages} страницах`);
