#!/usr/bin/env python3
"""
Перенос содержимого из дампа базы NetCat (co66690_gidrolog) в новый сайт.

Подготовка: дамп загружен в локальный MySQL/MariaDB в базу `g`
  mysql -e 'create database g character set utf8mb4' && mysql g < dump.sql
Запуск из корня проекта:
  python3 scripts/import-db.py
Результат:
  src/content/publikatsii/*.md, src/content/sobytiya/*.md, src/content/uslugi/*.md
  src/data/gallery|video|projects|services/*.json, партнёры в site.json
  import/files-to-copy.tsv — какие файлы взять из netcat_files и куда положить
  import/redirects.htaccess — точечные редиректы для записей без ЧПУ
"""
import html, json, os, re, sys, unicodedata
import pymysql

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
db = pymysql.connect(unix_socket='/run/mysqld/mysqld.sock', user='root', database='g', charset='utf8mb4',
                     cursorclass=pymysql.cursors.DictCursor)

def q(sql, *a):
    with db.cursor() as c:
        c.execute(sql, a)
        return c.fetchall()

files = {}  # dest -> src (пути внутри netcat_files)

def asset(src):
    """/netcat_files/x/y.jpg -> /img/netcat/x/y.jpg (и запомнить файл для копирования)"""
    p = src.split('/netcat_files/', 1)[1]
    p = p.split('?')[0]
    if re.search(r'\.(mp4|webm|mov|avi)$', p, re.I):
        # видео (≈3 ГБ) остаются на хостинге в netcat_files и отдаются оттуда
        return '/netcat_files/' + p
    files['img/netcat/' + p] = p
    return '/img/netcat/' + p

TR = dict(zip('абвгдеёзийклмнопрстуфхыэ', 'abvgdeezijklmnoprstufhye'))
TR.update({'ж': 'zh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ь': '', 'ю': 'yu', 'я': 'ya'})
def slugify(s, n=60):
    s = ''.join(TR.get(ch, ch) for ch in s.lower())
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:n].rstrip('-')

def file_field(value, field_id, msg_id, sub, subclass, name_hint=''):
    """Поле-файл NetCat 'имя:тип:размер[:путь]' -> публичный путь"""
    if not value:
        return ''
    parts = value.split(':')
    real = parts[0]
    ft = q('select File_Path, Virt_Name from Filetable where Field_ID=%s and Message_ID=%s', field_id, msg_id)
    if ft:
        src = ft[0]['File_Path'].strip('/') + '/' + ft[0]['Virt_Name']
    elif len(parts) >= 4 and parts[3]:
        src = parts[3]
    else:
        src = f'{sub}/{subclass}/{real}'
    ext = os.path.splitext(real)[1].lower() or '.jpg'
    base = slugify(os.path.splitext(real)[0], 40) or 'img'
    dest = f'img/netcat/f/{field_id}-{msg_id}-{base}{ext}'
    files[dest] = src
    return '/' + dest

OLD_SECTIONS = 'uslugi|proekty|publikatsii|sobytiya|video'
VIDEO_RENAME = {'iskusstvennye-ozera-dlya-kottedzhnyh-poselkov': 'iskusstvennye-ozera'}
SERVICE_RENAME = {'vodoemybezopasnye-kaskadnye': 'vodoemy-bezopasnye-kaskadnye'}
nokw = {}  # (раздел, id) -> новый slug для записей без Keyword
forum_imgs = set()

FORUM_ATT = json.load(open('import/forum-attachments.json')) if os.path.exists('import/forum-attachments.json') else {}
EXIST = {}  # раздел -> множество существующих slug (заполняется ниже)
GAL_NUM = {'66': 'obsluzhivanie', '67': 'vodosohrannye-tehnologii', '72': 'proektirovanie'}

def fix_url(u):
    u = html.unescape(u).strip()
    if u.startswith('//'):
        u = 'https:' + u
    u = re.sub(r'^https?://(www\.)?(old\.)?gidrologia\.ru', '', u)
    u = re.sub(r'^http://(www\.)?shop\.gidrologia\.ru', 'https://shop.gidrologia.ru', u)
    if u.startswith('/netcat_files/'):
        return asset(u)
    m = re.match(r'^/forum/download/file\.php\?(?:.*&)?id=(\d+)', u)
    if m:
        # вложение форума: файл остаётся на хостинге в forum/files
        if m.group(1) in FORUM_ATT:
            return '/forum/files/' + FORUM_ATT[m.group(1)]
        forum_imgs.add(u)
        return u
    if u.startswith('/forum'):
        m = re.search(r'[?&]t=(\d+)', u)
        if m and os.path.exists(f'src/content/forum/{m.group(1)}.json'):
            return f'/arhiv-foruma/tema-{m.group(1)}/'
        return '/arhiv-foruma/'
    m = re.match(rf'^/({OLD_SECTIONS})/([^/?#]+)\.html(#.*)?$', u)
    if m:
        sec, slug = m.group(1), m.group(2)
        mm = re.match(r'^(sobytiya|publikatsii)_(\d+)$', slug)
        if mm and (sec, int(mm.group(2))) in nokw:
            slug = nokw[(sec, int(mm.group(2)))]
        slug = VIDEO_RENAME.get(slug, SERVICE_RENAME.get(slug, slug))
        if EXIST and slug not in EXIST.get(sec, set()):
            return f'/{sec}/'  # запись скрыта или удалена на старом сайте — ведём на раздел
        return f'/{sec}/{slug}/' + (m.group(3) or '')
    m = re.match(r'^/galereya/galereya_(\d+)\.html$', u)
    if m:
        return f'/galereya/{GAL_NUM[m.group(1)]}/' if m.group(1) in GAL_NUM else '/galereya/'
    if re.match(r'^/(content|node|taxonomy)(/|$)', u):
        return '/publikatsii/'  # адреса ещё более старой версии сайта
    if re.match(r'^/calc/?$', u):
        return '/kontakty/'
    m = re.match(r'^/galereya/([^/]+)/[^/]+\.html$', u)
    if m:
        return f'/galereya/{m.group(1)}/'
    if u.startswith('/geografiya'):
        return '/#geo'
    return u

def clean(h, title=''):
    if not h:
        return ''
    h = h.replace('\r', '')
    h = re.sub(r'<!--.*?-->', '', h, flags=re.S)
    h = re.sub(r'<(script|style)\b.*?</\1>', '', h, flags=re.S | re.I)
    h = re.sub(r'</?o:p>', '', h)
    # видео-файлы, вставленные через iframe -> <video>
    def iframe(m):
        tag = m.group(0)
        src = re.search(r'src="([^"]*)"', tag)
        src = src.group(1) if src else ''
        if re.search(r'youtube\.com|youtu\.be|rutube\.ru|vk\.com/video|vkvideo\.ru', src):
            if src.startswith('//'):
                src = 'https:' + src
            src = src.replace('http://', 'https://')
            return f'<div class="video-box"><iframe src="{src}" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>'
        if re.search(r'\.(mp4|webm|mov)(\?|$)', src, re.I):
            return f'<video controls preload="metadata" src="{fix_url(src)}"></video>'
        return ''
    h = re.sub(r'<(object|embed)\b.*?(</\1>|/>)', '', h, flags=re.S | re.I)
    h = re.sub(r'\son\w+\s*=\s*("[^"]*"|\'[^\']*\')', '', h, flags=re.I)
    h = re.sub(r'\s(style|class|id|align|width|height|border|hspace|vspace|valign|bgcolor|cellpadding|cellspacing|frameborder|scrolling|lang|dir)\s*=\s*("[^"]*"|\'[^\']*\'|\S+)', '', h, flags=re.I)
    h = re.sub(r'</?(font|span|center|u)\b[^>]*>', '', h, flags=re.I)
    h = re.sub(r'<iframe\b[^>]*>.*?</iframe>', iframe, h, flags=re.S | re.I)
    h = re.sub(r'<iframe\b[^>]*/>', iframe, h, flags=re.I)
    h = re.sub(r'<p>\s*((?:<div class="video-box">.*?</div>\s*|<video\b.*?</video>\s*)+)</p>', r'\1', h, flags=re.S)
    h = re.sub(r'href="javascript:[^"]*"', 'href="#"', h, flags=re.I)
    h = re.sub(r'\b(href|src)="([^"]*)"', lambda m: f'{m.group(1)}="{fix_url(m.group(2))}"', h)
    h = re.sub(r'<a ([^>]*target="_blank"[^>]*)>', lambda m: m.group(0) if 'rel=' in m.group(1) else f'<a {m.group(1)} rel="noopener">', h)
    h = re.sub(r'<img\b(?![^>]*\balt=)', '<img alt=""', h, flags=re.I)
    h = re.sub(r'<img\b', '<img loading="lazy"', h, flags=re.I)
    # заголовок h1 в начале текста дублирует заголовок страницы
    h = re.sub(r'^\s*(<p>\s*(&nbsp;|\s)*</p>\s*)*<h1>.*?</h1>', '', h, count=1, flags=re.S | re.I)
    h = re.sub(r'<h1>', '<h2>', h, flags=re.I); h = re.sub(r'</h1>', '</h2>', h, flags=re.I)
    h = re.sub(r'<p>(\s|&nbsp;|<br\s*/?>)*</p>', '', h, flags=re.I)
    h = re.sub(r'<(strong|b|em|i)>\s*</\1>', '', h)
    h = re.sub(r'\n{3,}', '\n\n', h)
    # markdown не должен трогать HTML: строки не начинаем с отступа
    h = '\n'.join(l.strip() for l in h.split('\n'))
    return h.strip()

def text_of(h):
    t = re.sub(r'<[^>]+>', ' ', h or '')
    t = html.unescape(t).replace('\xa0', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    return re.sub(r'\s+([.,!?;:])', r'\1', t)

def excerpt_of(h, n=200):
    t = text_of(h)
    return t if len(t) <= n else t[:n].rsplit(' ', 1)[0].rstrip(',.;:—- ') + '…'

def yaml_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def title_of(s):
    t = text_of(s)
    t = re.sub(r'^"(.*)"$', r'\1', t)
    return t.rstrip('.') if t.endswith('.') and not t.endswith('..') else t

site = json.load(open('src/data/site.json'))

def load_dir(name):
    """Разделы хранятся по одному JSON на файл: src/data/<name>/<slug>.json"""
    import glob
    items = [json.load(open(f)) for f in glob.glob(f'src/data/{name}/*.json')]
    return sorted(items, key=lambda x: x.get('order', 999))

def save_dir(name, items):
    for it in items:
        json.dump(it, open(f"src/data/{name}/{it['slug']}.json", 'w'), ensure_ascii=False, indent=1)
RUB = {str(r['PublTypes_ID']): r['Value'] for r in q('select * from Classificator_PublTypes')}
LABEL = {r['key']: r['label'] for r in site['pubRubrics']}

# ---------- Публикации и события ----------
redirects = []
SECS = ((13, 'publikatsii', 10), (6, 'sobytiya', 12))
ROWS = {}
for sub, sec, sc in SECS:
    rows = ROWS[sec] = q('select * from Message2004 where Subdivision_ID=%s and Checked=1 order by Message_ID', sub)
    used = set()
    for r in rows:
        kw = (r['Keyword'] or '').strip().lower()
        if not kw:
            kw = f"{slugify(title_of(r['Name']), 50)}-{r['Message_ID']}"
            nokw[(sec, r['Message_ID'])] = kw
            redirects.append(f"RewriteRule ^{sec}/{sec}_{r['Message_ID']}\\.html$ /{sec}/{kw}/ [L,R=301]")
        if kw in used:
            old = kw
            kw = f"{kw}-{r['Message_ID']}"
            redirects.append(f"# дубль адреса {sec}/{old}.html: вторая запись доступна как /{sec}/{kw}/")
        used.add(kw)
        r['_slug'] = kw
EXIST['publikatsii'] = {r['_slug'] for r in ROWS['publikatsii']}
EXIST['sobytiya'] = {r['_slug'] for r in ROWS['sobytiya']}
EXIST['uslugi'] = {x['slug'] for x in load_dir('services')}
EXIST['proekty'] = {x['slug'] for x in load_dir('projects')}
EXIST['video'] = {x['slug'] for x in load_dir('video')}
for sub, sec, sc in SECS:
    rows = ROWS[sec]
    outdir = f'src/content/{sec}'
    for f in os.listdir(outdir):
        if f.endswith('.md'):
            os.remove(os.path.join(outdir, f))
    for r in rows:
        title = title_of(r['Name'])
        body = clean(r['Descrption'], title)
        d = r['Date'] if r['Date'] and r['Date'].year > 2000 else r['Created']
        rubs = [LABEL.get(RUB.get(x, ''), '') for x in (r['PublTypes'] or '').split(',') if x]
        rubs = [x for x in rubs if x]
        cover = file_field(r['Thumbnail'], 2555, r['Message_ID'], sub, sc)
        exc = text_of(r['ncDescription']) or excerpt_of(body)
        fm = [f'title: {yaml_str(title)}']
        if d: fm.append(f'date: "{d:%Y-%m-%d}"')
        if rubs:
            fm.append(f'rubric: {yaml_str(rubs[0])}')
            fm.append('rubrics: [' + ', '.join(yaml_str(x) for x in rubs) + ']')
        if exc: fm.append(f'excerpt: {yaml_str(exc)}')
        if cover: fm.append(f'cover: "{cover}"')
        oldslug = (r['Keyword'] or '').strip() or f"{sec}_{r['Message_ID']}"
        fm.append(f'old: "/{sec}/{oldslug}.html"')
        fm.append(f"netcatId: {r['Message_ID']}")
        fm.append('imported: true')
        open(f"{outdir}/{r['_slug']}.md", 'w').write('---\n' + '\n'.join(fm) + '\n---\n\n' + body + '\n')
    print(sec, len(rows))

# ---------- Услуги ----------
svc = load_dir('services')
slugs = {s['slug'] for s in svc}
for f in os.listdir('src/content/uslugi'):
    os.remove(os.path.join('src/content/uslugi', f))
n = 0
for r in q('select * from Message2006 where Subdivision_ID=3 and Checked=1'):
    slug = SERVICE_RENAME.get(r['Keyword'], r['Keyword'])
    if slug not in slugs:
        print('  услуга без страницы:', slug); continue
    body = clean(r['Text'])
    open(f'src/content/uslugi/{slug}.md', 'w').write(f'---\ntitle: "{text_of(r["Name"])}"\nimported: true\n---\n\n' + body + '\n')
    cover = file_field(r['Thumbnail'], 2560, r['Message_ID'], 3, 0)
    for s in svc:
        if s['slug'] == slug:
            s['cover'] = cover
            s['short'] = text_of(r['Description']) or s['short']
    n += 1
save_dir('services', svc)
print('uslugi', n)

# ---------- Галерея ----------
gal = load_dir('gallery')
subs = {r['Hidden_URL'].strip('/').split('/')[-1]: r for r in q("select * from Subdivision where Hidden_URL like '/galereya/%%'")}
def albums_of(sub_id):
    out = []
    for m in q('select * from Message2005 where Subdivision_ID=%s and Checked=1 order by Priority, Message_ID', sub_id):
        pics = q('select Path, Preview, Name from Multifield where Field_ID=2557 and Message_ID=%s order by Priority, ID', m['Message_ID'])
        photos = [{'src': asset(p['Path']), 'thumb': asset(p['Preview']) if p['Preview'] else ''} for p in pics if p['Path']]
        if not photos: continue
        out.append({'title': title_of(m['Name']), 'text': text_of(m['Alttext']), 'photos': photos})
    return out
total = 0
for g in gal:
    s = subs.get(g['slug'])
    g.pop('photos', None)
    g['albums'] = albums_of(s['Subdivision_ID']) if s else []
    children = [r for r in subs.values() if s and r['Parent_Sub_ID'] == s['Subdivision_ID'] and r['Checked']]
    g['groups'] = [{'title': c['Subdivision_Name'], 'albums': albums_of(c['Subdivision_ID'])} for c in sorted(children, key=lambda c: c['Priority'])]
    g['groups'] = [x for x in g['groups'] if x['albums']]
    total += sum(len(a['photos']) for a in g['albums']) + sum(len(a['photos']) for x in g['groups'] for a in x['albums'])
save_dir('gallery', gal)
print('gallery photos', total)

# ---------- Видео и проекты (компонент 2010) ----------
vid = load_dir('video')
for r in q('select * from Message2010 m where Subdivision_ID=8 and Checked=1'):
    slug = VIDEO_RENAME.get(r['Keyword'], r['Keyword'])
    for v in vid:
        if v['slug'] == slug:
            v['html'] = clean(r['Description'])
            v.pop('videos', None)
save_dir('video', vid)
proj = load_dir('projects')
for r in q('select * from Message2010 m where Subdivision_ID=4 and Checked=1'):
    for p in proj:
        if p['slug'] == r['Keyword']:
            p['html'] = clean(r['Description'])
            p['cover'] = file_field(r['Thumbnail'], 2579, r['Message_ID'], 4, 0)
            for im in p['images']:
                im['src'] = fix_url(im['old'])
save_dir('projects', proj)
print('video/projects ok')

# ---------- Партнёры ----------
partners = []
for r in q('select * from Message2013 where Checked=1 order by Priority, Message_ID'):
    href = (r['Link'] or '').strip()
    name = re.sub(r'^https?://(www\.)?', '', href).strip('/') or r['Name'] or 'Партнёр'
    partners.append({'name': name, 'href': href, 'logo': file_field(r['Logo'], 2631, r['Message_ID'], 55, 0)})
site['partners'] = partners
json.dump(site, open('src/data/site.json', 'w'), ensure_ascii=False, indent=2)
print('partners', len(partners))

# ---------- Списки ----------
os.makedirs('import', exist_ok=True)
with open('import/files-to-copy.tsv', 'w') as f:
    f.write('# путь в netcat_files\tкуда положить в public/\n')
    for dest, src in sorted(files.items()):
        f.write(f'{src}\t{dest}\n')
with open('import/redirects.htaccess', 'w') as f:
    f.write('\n'.join(redirects) + '\n')
with open('import/forum-images.txt', 'w') as f:
    f.write('\n'.join(sorted(forum_imgs)) + '\n')
print('files', len(files), 'forum imgs', len(forum_imgs), 'redirects', len(redirects))
