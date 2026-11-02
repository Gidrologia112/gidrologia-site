// После сборки: собирает CSS сайта в dist/admin/preview.css,
// чтобы предпросмотр в кабинете редактора выглядел как настоящая страница.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
// берём стили со страницы любой статьи (там всё, что нужно для текста)
const pubDir = join(dist, 'publikatsii');
const sample = readdirSync(pubDir, { withFileTypes: true }).find((d) => d.isDirectory() && existsSync(join(pubDir, d.name, 'index.html')));
const html = readFileSync(join(pubDir, sample.name, 'index.html'), 'utf8');
const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
let css = hrefs.map((h) => readFileSync(join(dist, h), 'utf8')).join('\n');
// стили, встроенные прямо в страницу
css += [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
css += `
/* Предпросмотр в кабинете: без анимаций появления, всё видно сразу */
.rv,.rv-s>*,.rise{opacity:1!important;transform:none!important;animation:none!important}
body{background:var(--paper)}
.prev-note{font:13px/1.4 var(--font);color:var(--muted);padding:10px 0}
`;
writeFileSync(join(dist, 'admin', 'preview.css'), css);
console.log(`preview.css: ${hrefs.length} файл(ов) стилей, ${Math.round(css.length / 1024)} КБ`);
