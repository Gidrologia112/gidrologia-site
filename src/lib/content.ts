import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'publikatsii'> | CollectionEntry<'sobytiya'>;

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const fmtDate = (d?: string) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
};

// Свежие сверху: по дате, затем по полю order
export function sortPosts<T extends Post>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const da = a.data.date || '', db = b.data.date || '';
    if (da !== db) return db.localeCompare(da);
    return (a.data.order ?? 999) - (b.data.order ?? 999);
  });
}

// Обложка записи. Со старого сайта у многих записей обложка — миниатюра 200×200 (/img/netcat/f/),
// на карточке она выглядит мутной. Поэтому ищем большое фото: оригинал миниатюры по имени файла,
// затем первую большую картинку из текста. Если большого фото нет — миниатюра с пометкой small.
import { hasImg } from './img';
import { readFileSync } from 'node:fs';

const isThumb = (src: string) => src.startsWith('/img/netcat/f/');
const IMG_RE = /\.(jpe?g|png|webp|gif)$/i;
const norm = (s: string) => decodeURI(s).split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9а-яё]+/g, '-').replace(/^-+|-+$/g, '');
const GENERIC = /^(img|dsc|dscn|dscf|photo|foto|image|p|pic|snimok|izobrazhenie)-?\d{1,5}$/;
let byName: Map<string, string[]> | null = null;
function originals(key: string): string[] {
  if (!byName) {
    byName = new Map();
    for (const f of ['import/img-manifest.txt', 'import/media-refs.txt']) {
      let lines: string[] = [];
      try { lines = readFileSync(f, 'utf8').split('\n'); } catch { /* нет файла */ }
      for (const l of lines) {
        const x = l.trim();
        if (!x || x.includes('/f/') || !IMG_RE.test(x)) continue;
        const k = norm(x), list = byName.get(k) || [];
        if (!list.includes('/' + x)) list.push('/' + x);
        byName.set(k, list);
      }
    }
  }
  return byName.get(key) || [];
}
const bodyImages = (body: string) => [...body.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img[^>]+src=["']([^"']+)["']/g)]
  .map((m) => (m[1] || m[2] || '').trim()).filter((s) => s.startsWith('/') && hasImg(s));

const cache = new Map<string, { src: string; small: boolean }>();
export function coverInfo(p: Post): { src: string; small: boolean } {
  const id = p.collection + '/' + p.id;
  if (cache.has(id)) return cache.get(id)!;
  const cover = p.data.cover && hasImg(p.data.cover) ? p.data.cover : '';
  const body = bodyImages(p.body).filter((s) => !isThumb(s));
  let res = { src: cover, small: false };
  if (cover && isThumb(cover)) {
    const key = norm(cover.replace(/^.*\/\d+-\d+-/, ''));
    const cands = originals(key).filter(hasImg);
    const inBody = cands.find((c) => body.includes(c));
    const pick = inBody || (cands.length === 1 && key.length >= 5 && !GENERIC.test(key) ? cands[0] : '') || body[0];
    res = pick ? { src: pick, small: false } : { src: cover, small: true };
  } else if (!cover) {
    res = body[0] ? { src: body[0], small: false } : { src: '', small: false };
  }
  cache.set(id, res);
  return res;
}
export const coverOf = (p: Post): string => coverInfo(p).src;

export const getPublications = async () => sortPosts(await getCollection('publikatsii'));
export const getEvents = async () => sortPosts(await getCollection('sobytiya'));
