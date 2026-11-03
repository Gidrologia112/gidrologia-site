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

// Обложка записи: своя (поле «Обложка») или первая картинка из текста, которая есть на сайте
import { hasImg } from './img';
export function coverOf(p: Post): string {
  if (p.data.cover && hasImg(p.data.cover)) return p.data.cover;
  for (const m of p.body.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img[^>]+src=["']([^"']+)["']/g)) {
    const src = (m[1] || m[2] || '').trim();
    if (src.startsWith('/') && hasImg(src)) return src;
  }
  return '';
}

export const getPublications = async () => sortPosts(await getCollection('publikatsii'));
export const getEvents = async () => sortPosts(await getCollection('sobytiya'));
