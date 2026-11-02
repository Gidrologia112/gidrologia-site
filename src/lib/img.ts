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
    try { manifest = new Set(readFileSync('import/img-manifest.txt', 'utf8').split('\n').filter(Boolean)); }
    catch { manifest = new Set(); }
  }
  return manifest.has(rel);
}
