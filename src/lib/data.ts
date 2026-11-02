// Данные разделов: по одному JSON на раздел (так их удобно редактировать в кабинете /admin)
type Any = Record<string, any>;
const load = (mods: Record<string, unknown>) =>
  Object.values(mods).map((m) => ((m as { default?: Any }).default ?? m) as Any)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.title).localeCompare(String(b.title), 'ru'));

// Записи из кабинета могут прийти без необязательных полей — достраиваем их,
// чтобы новая запись никогда не ломала сборку сайта.
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const album = (a: Any) => ({ ...a, title: str(a?.title), text: str(a?.text),
  photos: arr(a?.photos).map((p: Any) => (typeof p === 'string' ? { src: p, thumb: '' } : { ...p, src: str(p?.src), thumb: str(p?.thumb) })).filter((p: Any) => p.src) });

export const gallery = load(import.meta.glob('../data/gallery/*.json', { eager: true })).map((g) => ({
  ...g, title: str(g.title), slug: str(g.slug), tone: g.tone || '#1F4A55',
  albums: arr(g.albums).map(album),
  groups: arr(g.groups).map((x: Any) => ({ ...x, title: str(x?.title), albums: arr(x?.albums).map(album) })),
})).filter((g) => g.slug);
export const video = load(import.meta.glob('../data/video/*.json', { eager: true }))
  .map((v) => ({ ...v, title: str(v.title), slug: str(v.slug), html: str(v.html) })).filter((v) => v.slug);
export const projects = load(import.meta.glob('../data/projects/*.json', { eager: true }))
  .map((p) => ({ ...p, title: str(p.title), slug: str(p.slug), kind: str(p.kind), place: str(p.place), cover: str(p.cover), html: str(p.html), tone: p.tone || '#22465A',
    images: arr(p.images).map((i: Any) => ({ ...i, src: str(i?.src), caption: str(i?.caption) })).filter((i: Any) => i.src) }))
  .filter((p) => p.slug);
export const services = load(import.meta.glob('../data/services/*.json', { eager: true }))
  .map((s) => ({ ...s, facts: arr(s.facts), includes: arr(s.includes), short: str(s.short) }));
