#!/usr/bin/env node
/**
 * Импорт текстов из базы NetCat в новый сайт.
 *
 * Как получить данные: phpMyAdmin → база co66690_gidrolog → таблица компонента (Message<номер>)
 * → «Экспорт» → формат JSON. Сохраните файл, например, в import/publikatsii.json.
 *
 * Запуск:
 *   node scripts/import-netcat.mjs import/publikatsii.json --to publikatsii [--dry]
 *   node scripts/import-netcat.mjs import/sobytiya.json    --to sobytiya
 *   node scripts/import-netcat.mjs import/uslugi.json      --to uslugi
 *
 * Что делает:
 *   - берёт только включённые записи (Checked = 1);
 *   - slug = поле Keyword (совпадает со старым адресом, поэтому редиректы .html → / работают сами);
 *   - сохраняет текст как HTML внутри .md (форматирование не теряется), убирая скрипты и стили;
 *   - пути к картинкам /netcat_files/... меняет на /img/netcat/... и пишет список файлов
 *     в import/images-to-copy.txt — их нужно скопировать с хостинга в public/img/netcat/;
 *   - не перезаписывает файлы, где imported: true и есть текст (кроме флага --force).
 *
 * Названия полей у компонентов NetCat бывают разными — при необходимости поправьте FIELDS ниже.
 */
import fs from 'node:fs';
import path from 'node:path';

const FIELDS = {
  slug: ['Keyword', 'keyword', 'EnglishName'],
  title: ['Name', 'Title', 'Subject', 'Header', 'Caption'],
  text: ['Text', 'Content', 'FullText', 'Body', 'Message'],
  excerpt: ['Announce', 'Anons', 'Anounce', 'Preview_Text', 'Description', 'Short'],
  date: ['Date', 'PubDate', 'Created'],
  image: ['Image', 'Picture', 'Preview', 'Photo', 'Cover'],
  source: ['Source', 'Author'],
  enabled: ['Checked'],
};

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const to = args[args.indexOf('--to') + 1];
const dry = args.includes('--dry');
const force = args.includes('--force');
if (!file || !['publikatsii', 'sobytiya', 'uslugi'].includes(to)) {
  console.error('Использование: node scripts/import-netcat.mjs <файл.json> --to publikatsii|sobytiya|uslugi [--dry] [--force]');
  process.exit(1);
}

// phpMyAdmin JSON: массив, где есть объект { type: "table", data: [...] }; поддерживаем и просто массив строк
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = Array.isArray(raw)
  ? (raw.find((x) => x && x.type === 'table')?.data ?? raw.filter((x) => x && typeof x === 'object' && !x.type))
  : raw.data ?? [];

const pick = (row, keys) => { for (const k of keys) if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]); return ''; };
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ').trim();
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
const images = new Set();

function cleanHtml(html) {
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe(?![^>]*(youtube\.com|youtu\.be|rutube\.ru|vk\.com\/video))[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '').replace(/\son\w+='[^']*'/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '')
    .replace(/\s(class|id|align|width|height|border|hspace|vspace)="[^"]*"/gi, '')
    .replace(/<\/?(font|span)[^>]*>/gi, '')
    .replace(/href="javascript:[^"]*"/gi, 'href="#"');
  // картинки и ссылки на файлы NetCat → /img/netcat/
  h = h.replace(/(src|href)="(?:https?:\/\/(?:www\.)?gidrologia\.ru)?(\/netcat_files\/[^"]+)"/gi, (_, attr, p) => {
    images.add(p);
    return `${attr}="/img/netcat${p.replace('/netcat_files', '')}"`;
  });
  // внутренние ссылки старого сайта: /razdel/slug.html → /razdel/slug/
  h = h.replace(/href="(?:https?:\/\/(?:www\.)?gidrologia\.ru)?\/(uslugi|proekty|publikatsii|sobytiya)\/([^"/]+)\.html"/gi, 'href="/$1/$2/"');
  h = h.replace(/href="(?:https?:\/\/(?:www\.)?gidrologia\.ru)?\/forum[^"]*"/gi, 'href="/publikatsii/"');
  // картинкам — ленивую загрузку и пустой alt, если его нет
  h = h.replace(/<img(?![^>]*\balt=)/gi, '<img alt=""').replace(/<img/gi, '<img loading="lazy"');
  return h.replace(/\n{3,}/g, '\n\n').trim();
}

function toDate(v) {
  if (!v) return '';
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/) || String(v).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return '';
  return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
}

const outDir = path.join('src', 'content', to);
fs.mkdirSync(outDir, { recursive: true });
let written = 0, skipped = 0;

for (const row of rows) {
  if (pick(row, FIELDS.enabled) === '0') { skipped++; continue; }
  const slug = pick(row, FIELDS.slug).replace(/\.html$/, '').toLowerCase();
  const title = stripTags(pick(row, FIELDS.title));
  if (!slug || !title) { skipped++; continue; }
  const target = path.join(outDir, `${slug}.md`);

  // существующий файл сохраняем: берём из него рубрику/порядок, если в базе их нет
  let prev = '';
  if (fs.existsSync(target)) {
    prev = fs.readFileSync(target, 'utf8');
    if (!force && /imported: true/.test(prev) && prev.split('---').slice(2).join('---').trim()) { skipped++; continue; }
  }
  const prevField = (k) => (prev.match(new RegExp(`^${k}: (.+)$`, 'm')) || [])[1];

  const body = cleanHtml(pick(row, FIELDS.text));
  let excerpt = stripTags(pick(row, FIELDS.excerpt));
  if (!excerpt && body) { const t = stripTags(body); excerpt = t.length > 220 ? t.slice(0, 220).replace(/\s\S*$/, '') + '…' : t; }
  let cover = pick(row, FIELDS.image);
  if (cover && cover.includes('netcat_files')) { const p = cover.slice(cover.indexOf('/netcat_files')).split(':')[0]; images.add(p); cover = `/img/netcat${p.replace('/netcat_files', '')}`; }
  else cover = '';

  const fm = to === 'uslugi'
    ? ['imported: true']
    : [
        `title: "${esc(title)}"`,
        toDate(pick(row, FIELDS.date)) && `date: "${toDate(pick(row, FIELDS.date))}"`,
        prevField('rubric') && `rubric: ${prevField('rubric')}`,
        excerpt && `excerpt: "${esc(excerpt)}"`,
        cover && `cover: "${cover}"`,
        pick(row, FIELDS.source) && `source: "${esc(stripTags(pick(row, FIELDS.source)))}"`,
        `old: "/${to}/${slug}.html"`,
        prevField('order') && `order: ${prevField('order')}`,
        'imported: true',
      ].filter(Boolean);

  const md = `---\n${fm.join('\n')}\n---\n\n${body}\n`;
  if (!dry) fs.writeFileSync(target, md);
  written++;
}

if (!dry && images.size) {
  fs.mkdirSync('import', { recursive: true });
  const list = path.join('import', 'images-to-copy.txt');
  const prevList = fs.existsSync(list) ? fs.readFileSync(list, 'utf8').split('\n').filter(Boolean) : [];
  fs.writeFileSync(list, [...new Set([...prevList, ...images])].sort().join('\n') + '\n');
}
console.log(`${dry ? '[проверка] ' : ''}Записано: ${written}, пропущено: ${skipped}, картинок к копированию: ${images.size}`);
if (rows.length && written === 0) console.log('Поля записи:', Object.keys(rows[0]).join(', '), '— проверьте FIELDS в начале скрипта.');
