// Магазин: разделы и товары (src/data/shop). Правятся в кабинете /admin → «Магазин».
import categoriesRaw from '../data/shop/categories.json';
import pages from '../data/shop/pages.json';
import { hasImg } from './img';
import { marked } from 'marked';

type Any = Record<string, any>;
export interface Category { id: number; parent: number; title: string; path: string; order: number; text?: string; }
export interface Photo { src: string; thumb: string; }
export interface Product {
  id: number; title: string; slug: string; category: number; also: number[]; price: number; vendor: string; sku: string; order: number;
  short: string; specs: string; specsFull: string; description: string; warranty: string;
  photos: Photo[]; file: string; files: { name: string; src: string }[]; video: string; montageLink: string; active: boolean; old?: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
// Тексты хранятся в Markdown (в нём допустим и HTML) — на сайт идут готовым HTML
export const html = (v: unknown) => { const t = str(v).trim(); return t ? (marked.parse(t, { async: false, gfm: true, breaks: false }) as string) : ''; };
// Номер товара для корзины: у перенесённых — ID из NetCat, у новых из кабинета — число из адреса
const idOf = (p: Any) => Number(p.id) || 1_000_000 + [...str(p.slug)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 8_999_999, 7);

const mods = import.meta.glob('../data/shop/products/*.json', { eager: true });
export const products: Product[] = Object.entries(mods)
  .map(([k, m]) => ({ ...(((m as { default?: Any }).default ?? m) as Any), file: k.split('/').pop()!.replace(/\.json$/, '') }))
  .map((p) => ({
    ...p, id: idOf(p), title: str(p.title), slug: str(p.slug), category: Number(p.category), also: arr(p.also).map(Number),
    price: Number(p.price) || 0, vendor: str(p.vendor), sku: str(p.sku), order: Number(p.order) || 0,
    short: html(p.short), specs: html(p.specs), specsFull: html(p.specsFull), description: html(p.description), warranty: html(p.warranty),
    photos: arr(p.photos).map((x: Any) => (typeof x === 'string' ? { src: x, thumb: '' } : { src: str(x?.src), thumb: str(x?.thumb) })).filter((x: Photo) => hasImg(x.src)),
    files: arr(p.files).filter((f: Any) => f && f.src), video: str(p.video), montageLink: str(p.montageLink), active: p.active !== false,
  } as Product))
  .filter((p) => p.active && p.slug && p.title)
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'ru'));

const catList = (Array.isArray(categoriesRaw) ? categoriesRaw : (categoriesRaw as Any).items ?? []) as Any[];
const allCats: Category[] = catList.filter((c) => c && c.path && c.title)
  .map((c, i) => ({ ...c, id: Number(c.id) || 900_000 + i, parent: Number(c.parent) || 0, order: Number(c.order) || 0, path: str(c.path).replace(/^\/+|\/+$/g, ''), title: str(c.title), text: html(c.text) }));
const childrenOf = (id: number) => allCats.filter((c) => c.parent === id).sort((a, b) => a.order - b.order);
const subtree = (id: number): number[] => [id, ...childrenOf(id).flatMap((c) => subtree(c.id))];
export const inCategory = (id: number) => {
  const ids = new Set(subtree(id));
  return products.filter((p) => ids.has(p.category) || p.also.some((a) => ids.has(a)));
};
// Пустые разделы на сайте не показываем
export const categories = allCats.filter((c) => inCategory(c.id).length > 0);
export const topCategories = categories.filter((c) => c.parent === 0).sort((a, b) => a.order - b.order);
export const subCategories = (id: number) => categories.filter((c) => c.parent === id).sort((a, b) => a.order - b.order);
export const categoryById = (id: number) => allCats.find((c) => c.id === id);
export const catHref = (c: Category) => `/magazin/${c.path}/`;
export const productHref = (p: Product) => `/magazin/tovar/${p.slug}/`;
export const trail = (c?: Category): Category[] => (c ? [...(c.parent ? trail(categoryById(c.parent)) : []), c] : []);
export const cover = (p: Product) => p.photos[0] ? (p.photos[0].thumb && hasImg(p.photos[0].thumb) ? p.photos[0].thumb : p.photos[0].src) : '';
export const catCover = (c: Category) => { const p = inCategory(c.id).find((x) => x.photos.length); return p ? cover(p) : ''; };
export const fmtPrice = (n: number) => (n ? n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽' : 'Цена по запросу');
export const shopPages = Object.fromEntries(Object.entries(pages as Record<string, Any>).map(([k, v]) => [k, { title: str(v?.title), html: html(v?.body ?? v?.html) }])) as Record<string, { title: string; html: string }>;
