#!/usr/bin/env python3
"""
Копирует картинки и видео старого сайта в public/ по списку import/files-to-copy.tsv
(список создаёт scripts/import-db.py).

  python3 scripts/copy-images.py /путь/к/распакованной/netcat_files

Пропущенные файлы записываются в import/files-missing.txt.
"""
import os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_root = sys.argv[1] if len(sys.argv) > 1 else None
if not src_root or not os.path.isdir(src_root):
    sys.exit('Укажите папку netcat_files: python3 scripts/copy-images.py /путь/к/netcat_files')

copied, missing = 0, []
for line in open(os.path.join(ROOT, 'import/files-to-copy.tsv'), encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    src, dest = line.rstrip('\n').split('\t')
    s = os.path.join(src_root, src)
    if not os.path.exists(s):
        # на хостинге регистр букв в именах мог отличаться
        d, name = os.path.split(s)
        alt = [f for f in os.listdir(d) if f.lower() == name.lower()] if os.path.isdir(d) else []
        if not alt:
            missing.append(src); continue
        s = os.path.join(d, alt[0])
    t = os.path.join(ROOT, 'public', dest)
    os.makedirs(os.path.dirname(t), exist_ok=True)
    if not os.path.exists(t) or os.path.getsize(t) != os.path.getsize(s):
        shutil.copy2(s, t)
    copied += 1

open(os.path.join(ROOT, 'import/files-missing.txt'), 'w').write('\n'.join(missing) + '\n')
# список имеющихся фото: по нему сборка понимает, какие картинки есть на хостинге
pub = os.path.join(ROOT, 'public')
have = sorted(os.path.relpath(os.path.join(d, f), pub) for d, _, fs in os.walk(os.path.join(pub, 'img', 'netcat')) for f in fs)
open(os.path.join(ROOT, 'import/img-manifest.txt'), 'w').write('\n'.join(have) + '\n')
print(f'Скопировано: {copied}, не найдено: {len(missing)} (список в import/files-missing.txt)')
