// Данные разделов: по одному JSON на раздел (так их удобно редактировать в кабинете /admin)
type Any = Record<string, any>;
const load = (mods: Record<string, unknown>) =>
  Object.values(mods).map((m) => ((m as { default?: Any }).default ?? m) as Any)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.title).localeCompare(String(b.title), 'ru'));

export const gallery = load(import.meta.glob('../data/gallery/*.json', { eager: true }));
export const video = load(import.meta.glob('../data/video/*.json', { eager: true }));
export const projects = load(import.meta.glob('../data/projects/*.json', { eager: true }));
export const services = load(import.meta.glob('../data/services/*.json', { eager: true }));
