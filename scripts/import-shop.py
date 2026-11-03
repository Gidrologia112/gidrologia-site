#!/usr/bin/env python3
"""
Перенос магазина shop.gidrologia.ru (NetCat, сайт №2) в раздел /magazin/ нового сайта.

  python3 scripts/import-shop.py      # база NetCat поднята локально как БД `g` (см. README)

Создаёт:
  src/data/shop/categories.json      — дерево разделов каталога
  src/data/shop/products/<id>.json   — товары (по одному файлу — удобно править в кабинете)
  src/data/shop/pages.json           — тексты «Оплата», «Доставка», «Гарантии»
  import/shop-redirects.htaccess     — старые адреса shop.gidrologia.ru → новые
  import/shop-media.txt              — фото и PDF товаров (копируются на хостинге из старой папки)
"""
import json, os, re, subprocess, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src/data/shop')
TR = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя', ['a','b','v','g','d','e','e','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','h','ts','ch','sh','sch','','y','','e','yu','ya']))

def q(sql):
    r = subprocess.run(['mysql', 'g', '--batch', '-e', sql], capture_output=True, check=True)
    lines = r.stdout.decode('utf-8', 'replace').replace('\r', '').split('\n')
    if not lines or not lines[0]: return []
    head = lines[0].split('\t')
    return [dict(zip(head, [None if v == 'NULL' else v for v in l.split('\t')])) for l in lines[1:] if l]

def slug(s, n=70):
    s = ''.join(TR.get(c, c) for c in (s or '').lower())
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s)).strip('-')[:n].strip('-')

def clean(h):
    """HTML из NetCat → аккуратный HTML: без стилей, шрифтов, пустых абзацев; ссылки на старый сайт → новые адреса."""
    if not h: return ''
    h = h.replace('\\n', '\n').replace('\\r', '').replace('\\t', ' ')
    h = re.sub(r'\s(style|class|align|face|size|color|lang|dir)="[^"]*"', '', h, flags=re.I)
    h = re.sub(r'</?(font|span|o:p)[^>]*>', '', h, flags=re.I)
    h = re.sub(r'<p>(\s|&nbsp;|<br\s*/?>)*</p>', '', h)
    h = re.sub(r'https?://(www\.)?gidrologia\.ru/forum/viewtopic\.php\?[^"\s<]*?\bt=(\d+)[^"\s<]*', r'/arhiv-foruma/tema-\2/', h)
    h = re.sub(r'https?://(www\.)?gidrologia\.ru/', '/', h)
    h = re.sub(r'https?://shop\.gidrologia\.ru/', '/magazin/', h)
    return h.strip()

def text(h):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', h or ''))).strip()

# --- Разделы каталога (сайт №2, только включённые, под /catalog/)
subs = q("select Subdivision_ID id, Parent_Sub_ID parent, Subdivision_Name name, Hidden_URL url, Priority pr from Subdivision "
         "where Catalogue_ID=2 and Checked=1 and Hidden_URL like '/catalog/%' order by Parent_Sub_ID, Priority")
by_id = {int(s['id']): s for s in subs}
cats = []
for s in subs:
    path = s['url'][len('/catalog/'):].strip('/')
    if not path: continue
    cats.append({'id': int(s['id']), 'parent': int(s['parent']) if int(s['parent']) in by_id and by_id[int(s['parent'])]['url'] != '/catalog/' else 0,
                 'title': re.sub(r'\s+', ' ', s['name']).strip(), 'path': path, 'order': int(s['pr'] or 0)})
cat_ids = {c['id'] for c in cats}

# --- Производители
vendors = {r['Message_ID']: r['Name'].strip() for r in q("select Message_ID, Name from Message2022")}

# --- Фото товаров (поле Images, мультифайл 2718)
imgs = {}
for r in q("select Message_ID, Path, Preview, Priority from Multifield where Field_ID=2718 order by Message_ID, Priority, ID"):
    imgs.setdefault(r['Message_ID'], []).append({'src': r['Path'], 'thumb': r['Preview'] or ''})

def fs2(v, sub_id, cc_id):
    """Файловое поле NetCat: «имя:тип:размер:путь» → /netcat_files/путь"""
    if not v: return None
    p = v.split(':')
    if len(p) < 4: return None
    return {'name': p[0], 'src': '/netcat_files/' + p[3].lstrip('/')}

rows = q("select m.*, sc.EnglishName cc from Message2019 m left join Sub_Class sc on sc.Sub_Class_ID=m.Sub_Class_ID where m.Checked=1 and m.Name<>'Тестовый товар'")
os.makedirs(os.path.join(OUT, 'products'), exist_ok=True)
for f in os.listdir(os.path.join(OUT, 'products')):
    os.remove(os.path.join(OUT, 'products', f))
media, redirects, used = set(), [], set()
for r in rows:
    mid = r['Message_ID']; sub = int(r['Subdivision_ID'])
    if sub not in cat_ids: continue
    name = re.sub(r'\s+', ' ', html.unescape(r['Name'] or '')).strip()
    s = slug(name) or f'tovar-{mid}'
    if s in used: s = f'{s}-{mid}'
    used.add(s)
    alt = [int(x) for x in re.findall(r'\d+', r.get('AltSubs') or '') if int(x) in cat_ids and int(x) != sub]
    photos = imgs.get(mid, [])
    files = [x for x in [fs2(r.get('Pdf'), sub, r['Sub_Class_ID']), fs2(r.get('Pdf_zap'), sub, r['Sub_Class_ID']), fs2(r.get('gidro'), sub, r['Sub_Class_ID'])] if x]
    for p in photos:
        media.add(p['src'].lstrip('/'))
        if p['thumb']: media.add(p['thumb'].lstrip('/'))
    for f in files: media.add(f['src'].lstrip('/'))
    video = (r.get('Video') or '').strip()
    price = float(r['Price'] or 0)
    prod = {
        'id': int(mid), 'title': name, 'slug': s, 'category': sub, 'also': alt,
        'price': int(round(price)) if price else 0,
        'vendor': vendors.get(r.get('Vendor') or '', ''),
        'sku': (r.get('ItemID') or '').strip(),
        'order': int(r.get('Priority') or 0),
        'short': clean(r.get('Short_description')),
        'specs': clean(r.get('Specifications_short')),
        'specsFull': clean(r.get('Specifications_full')),
        'description': clean(r.get('Description')),
        'warranty': clean(r.get('garantia')),
        'photos': photos,
        'files': files,
        'video': video if video.startswith('http') else '',
        'montageLink': clean(r.get('montag') or ''),
        'active': True,
        'old': f"/catalog/{by_id[sub]['url'][len('/catalog/'):].strip('/')}/{r['cc']}_{mid}.html" if r.get('cc') else '',
    }
    with open(os.path.join(OUT, 'products', f'{mid}.json'), 'w', encoding='utf-8') as fh:
        json.dump(prod, fh, ensure_ascii=False, indent=2)
    if prod['old']:
        redirects.append((prod['old'], f"/magazin/tovar/{s}/"))

with open(os.path.join(OUT, 'categories.json'), 'w', encoding='utf-8') as fh:
    json.dump(sorted(cats, key=lambda c: (c['parent'], c['order'])), fh, ensure_ascii=False, indent=2)

# --- Тексты «Оплата», «Доставка», «Гарантии»
pages = {}
for r in q("select s.Hidden_URL url, s.Subdivision_Name name, m.htmltext from Message2003 m join Subdivision s using(Subdivision_ID) where s.Catalogue_ID=2 and m.Checked=1"):
    key = r['url'].strip('/')
    if key in ('oplata', 'dostavka', 'guarantee'):
        pages[key] = {'title': r['name'], 'html': clean(r['htmltext'])}
with open(os.path.join(OUT, 'pages.json'), 'w', encoding='utf-8') as fh:
    json.dump(pages, fh, ensure_ascii=False, indent=2)

# --- Переадресации старого магазина (применяются только для хоста shop.gidrologia.ru)
lines = ['# Старый магазин shop.gidrologia.ru → раздел /magazin/ (создано scripts/import-shop.py)']
for old, new in sorted(redirects):
    lines.append(f"RewriteRule ^{re.escape(old.lstrip('/'))}$ https://gidrologia.ru{new} [L,R=301]")
for c in cats:
    lines.append(f"RewriteRule ^catalog/{re.escape(c['path'])}/?$ https://gidrologia.ru/magazin/{c['path']}/ [L,R=301]")
with open(os.path.join(ROOT, 'import/shop-redirects.htaccess'), 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(lines) + '\n')
with open(os.path.join(ROOT, 'import/shop-media.txt'), 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(sorted(media)) + '\n')
print(f'разделов {len(cats)}, товаров {len(redirects)}, фото+файлов {len(media)}, страниц {len(pages)}')
# Сразу вписываем переадресации в public/.htaccess
subprocess.run(['python3', os.path.join(ROOT, 'scripts/inject_shop_redirects.py')], check=True)
# Тексты → Markdown для кабинета (повторный импорт затирает правки, сделанные в кабинете!)
subprocess.run(['node', os.path.join(ROOT, 'scripts/shop-to-md.mjs')], check=True, cwd=ROOT)
subprocess.run(['node', os.path.join(ROOT, 'scripts/shop-tables-md.mjs')], check=True, cwd=ROOT)
subprocess.run(['node', os.path.join(ROOT, 'scripts/shop-fix-rows.mjs')], check=True, cwd=ROOT)

# Ссылки внутри текстов товаров: старые адреса магазина и сайта → новые страницы
import glob
prod_files = glob.glob(os.path.join(OUT, 'products', '*.json'))
by_mid = {}
for f in prod_files:
    d = json.load(open(f, encoding='utf-8')); by_mid[str(d['id'])] = d['slug']
def relink(t):
    if not t: return t
    t = re.sub(r'(?:https?://shop\.gidrologia\.ru)?(?:/magazin)?/catalog/[^\s)"\']*?_(\d+)\.html',
               lambda m: f"/magazin/tovar/{by_mid[m.group(1)]}/" if m.group(1) in by_mid else '/magazin/', t)
    t = re.sub(r'(?:/magazin)?/catalog/([a-z0-9/-]+?)/?(?=[\s)"\'])', r'/magazin/\1/', t)
    t = re.sub(r'https?://(www\.)?gidrologia\.ru/', '/', t)
    t = re.sub(r'(?<![\w/])/(publikatsii|sobytiya|uslugi|proekty|video)/([\w-]+)\.html', r'/\1/\2/', t)
    t = re.sub(r'/forum/viewforum\.php[^\s)"\']*', '/arhiv-foruma/', t)
    return t
for f in prod_files:
    d = json.load(open(f, encoding='utf-8'))
    for k in ('short', 'specs', 'specsFull', 'description', 'warranty', 'montageLink'): d[k] = relink(d[k])
    json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(f, 'a').write('\n')
