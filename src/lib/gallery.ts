// Галерея: разделы → объекты (альбомы) → фото. У каждого объекта своя страница /galereya/<раздел>/<объект>/.
import { gallery } from './data';

export type Photo = { src: string; thumb: string };
export type Album = { title: string; text: string; photos: Photo[]; slug: string; group: string };

const TR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = (s: string) => [...s.toLowerCase()].map((c) => TR[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');

/** Объект показываем, если по нему есть описание или хотя бы 3 фото (решение 14.11.2026) */
export const full = (a: { text: string; photos: unknown[] }) => a.photos.length > 0 && (a.text.trim() !== '' || a.photos.length >= 3);

/** Объекты раздела по группам; адреса объектов уникальны внутри раздела */
export function albumsOf(g: (typeof gallery)[number]): { title: string; albums: Album[] }[] {
  const used = new Set<string>();
  const mk = (a: any, group: string): Album => {
    let base = slugify(String(a.title || '')) || 'obekt';
    let s = base, n = 2;
    while (used.has(s)) s = `${base}-${n++}`;
    used.add(s);
    return { title: String(a.title || 'Объект'), text: String(a.text || ''), photos: (a.photos || []) as Photo[], slug: s, group };
  };
  const out: { title: string; albums: Album[] }[] = [];
  if ((g.albums as any[]).length) out.push({ title: '', albums: (g.albums as any[]).map((a) => mk(a, '')) });
  for (const grp of g.groups as any[]) out.push({ title: grp.title, albums: (grp.albums || []).map((a: any) => mk(a, grp.title)) });
  return out.map((x) => ({ ...x, albums: x.albums.filter(full) })).filter((x) => x.albums.length > 0);
}
