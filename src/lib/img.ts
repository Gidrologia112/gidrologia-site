// Есть ли картинка на сайте: файл в public/ или в списке перенесённых фото (import/img-manifest.txt).
// Фото со старого сайта (≈450 МБ) лежат на хостинге в /img/netcat и в репозиторий не входят.
import { existsSync, readFileSync } from 'node:fs';
let manifest: Set<string> | null = null;
export function hasImg(src?: string): boolean {
  if (!src) return false;
  if (!src.startsWith('/')) return true;
  const rel = decodeURI(src).replace(/^\//, '');
  if (existsSync(`public/${rel}`)) return true;
  if (!manifest) {
    manifest = new Set();
    // фото со старого сайта и фото товаров магазина (лежат на хостинге, в репозиторий не входят)
    for (const f of ['import/img-manifest.txt', 'import/shop-media.txt']) {
      try { readFileSync(f, 'utf8').split('\n').filter(Boolean).forEach((x) => manifest!.add(x)); } catch { /* нет файла */ }
    }
  }
  return manifest.has(rel);
}
