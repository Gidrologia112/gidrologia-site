#!/usr/bin/env python3
"""
Перенос форума phpBB (база co66690_forum) в статичный «Архив форума».

Подготовка: дамп форума загружен в локальный MySQL в базу `f`.
Запуск из корня проекта: python3 scripts/import-forum.py

Результат:
  src/data/forum.json                 — разделы и список тем
  src/content/forum/<id>.json         — темы с сообщениями
  import/forum-redirects.htaccess     — 301 со старых адресов viewforum/viewtopic

Вложения (≈3,7 ГБ фото) не копируются: они остаются на хостинге в public_html/forum/files
и отдаются оттуда (см. public/forum/files/.htaccess). Личные сообщения, e-mail, IP и подписи
участников не переносятся — только имя автора, дата и текст сообщения.
"""
import html, json, os, re
import pymysql

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
db = pymysql.connect(unix_socket='/run/mysqld/mysqld.sock', user='root', database='f', charset='utf8mb4',
                     cursorclass=pymysql.cursors.DictCursor)
P = 'wrv2F_'
def q(sql, *a):
    with db.cursor() as c:
        c.execute(sql.replace('{P}', P), a)
        return c.fetchall()

TR = dict(zip('абвгдеёзийклмнопрстуфхыэ', 'abvgdeezijklmnoprstufhye'))
TR.update({'ж': 'zh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ь': '', 'ю': 'yu', 'я': 'ya'})
def slugify(s, n=50):
    s = ''.join(TR.get(ch, ch) for ch in s.lower())
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:n].rstrip('-')

SPAM_USERS = {'konctruktor', 'Jul345', 'Afroditadot'}  # реклама и просьбы «связаться с модератором»
BASE = '/arhiv-foruma/'

forums = {f['forum_id']: f for f in q("select * from {P}forums")}
topics = {t['topic_id']: t for t in q("select * from {P}topics where topic_approved=1 and topic_moved_id=0")}

def fslug(fid):
    return f"{fid}-{slugify(html.unescape(forums[fid]['forum_name']))}"

SECTIONS = 'uslugi|proekty|publikatsii|sobytiya|video'
def fix_link(u):
    u = html.unescape(u).strip()
    if u.startswith('//'):
        u = 'https:' + u
    m = re.search(r'gidrologia\.ru/forum/viewtopic\.php\?[^"]*?\bt=(\d+)', u) or re.match(r'^(?:\./)?viewtopic\.php\?[^"]*?\bt=(\d+)', u)
    if m and int(m.group(1)) in topics:
        return f'{BASE}tema-{m.group(1)}/'
    m = re.search(r'gidrologia\.ru/forum/viewforum\.php\?[^"]*?\bf=(\d+)', u)
    if m and int(m.group(1)) in forums:
        return f'{BASE}{fslug(int(m.group(1)))}/'
    if re.search(r'gidrologia\.ru/forum', u):
        return BASE
    u = re.sub(r'^https?://(www\.)?gidrologia\.ru', '', u)
    m = re.match(rf'^/({SECTIONS})/(?:\1/)?([^/?#]+)\.html', u)
    if m:
        slug = {'vodoemybezopasnye-kaskadnye': 'vodoemy-bezopasnye-kaskadnye', 'iskusstvennye-ozera-dlya-kottedzhnyh-poselkov': 'iskusstvennye-ozera'}.get(m.group(2), m.group(2))
        if os.path.exists(f'dist/{m.group(1)}/{slug}/index.html') or m.group(1) in ('uslugi', 'video'):
            return f'/{m.group(1)}/{slug}/'
        return f'/{m.group(1)}/'
    m = re.match(r'^/galereya/([^/]+)/[^/]+\.html', u)
    if m:
        return f'/galereya/{m.group(1)}/'
    if re.match(r'^/(content|node|taxonomy|sites)(/|$)', u):
        return '/publikatsii/'
    if u.startswith('/netcat_files/') and not re.search(r'\.(mp4|webm|mov)$', u, re.I):
        return '/img/netcat/' + u.split('/netcat_files/', 1)[1]
    return u

EMBED = re.compile(r'(youtube\.com/embed/|youtu\.be/|rutube\.ru/play/embed/|youtube\.com/watch\?v=)')
def video_or_link(url, label):
    u = fix_link(url)
    if EMBED.search(u):
        m = re.search(r'youtube\.com/watch\?v=([\w-]+)|youtu\.be/([\w-]+)', u)
        if m:
            u = 'https://www.youtube.com/embed/' + (m.group(1) or m.group(2))
        return f'<div class="video-box"><iframe src="{html.escape(u, True)}" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>'
    return f'<a href="{html.escape(u, True)}" rel="nofollow noopener" target="_blank">{label}</a>'

def bbcode(text, uid):
    t = text or ''
    t = t.replace(f':{uid}', '') if uid else t
    # смайлики → их текст
    t = re.sub(r'<!-- s(.*?) --><img [^>]*><!-- s.*? -->', lambda m: html.escape(m.group(1)), t)
    # «магические» ссылки phpBB
    t = re.sub(r'<!-- [mwle] --><a [^>]*href="([^"]+)"[^>]*>(.*?)</a><!-- [mwle] -->',
               lambda m: video_or_link(m.group(1), m.group(2)), t)
    t = re.sub(r'<!-- ia\d+ -->(.*?)<!-- ia\d+ -->', r'\1', t)
    t = re.sub(r'\[(/?)(b|i|u|s)\]', lambda m: f"<{m.group(1)}{'strong' if m.group(2)=='b' else 'em' if m.group(2)=='i' else 'span'}>", t)
    t = re.sub(r'\[/?(color|size|font|center|left|right)(=[^\]]*)?\]', '', t)
    t = re.sub(r'\[url=([^\]]+)\](.*?)\[/url\]', lambda m: video_or_link(m.group(1), m.group(2)), t, flags=re.S)
    t = re.sub(r'\[url\](.*?)\[/url\]', lambda m: video_or_link(m.group(1), m.group(1)), t, flags=re.S)
    t = re.sub(r'\[img\](.*?)\[/img\]', lambda m: f'<img src="{html.escape(fix_link(m.group(1)), True)}" alt="" loading="lazy">', t, flags=re.S)
    t = re.sub(r'\[quote(?:=&quot;(.*?)&quot;)?\]', lambda m: '<blockquote>' + (f'<p><strong>{m.group(1)} пишет:</strong></p>' if m.group(1) else ''), t)
    t = t.replace('[/quote]', '</blockquote>')
    t = re.sub(r'\[list(=[^\]]*)?\]', '<ul>', t)
    t = re.sub(r'\[/list(:[ou])?\]', '</ul>', t)
    t = re.sub(r'\[\*\]', '<li>', t)
    t = re.sub(r'\[/\*(:m)?\]', '</li>', t)
    t = re.sub(r'\[attachment=\d+\].*?\[/attachment\]', '', t, flags=re.S)
    t = re.sub(r'\[/?(code|flash|youtube|video)(=[^\]]*)?\]', '', t)
    paras = [p.strip() for p in re.split(r'\n\s*\n', t) if p.strip()]
    out = ''.join(f'<p>{p.replace(chr(10), "<br>")}</p>' for p in paras)
    out = re.sub(r'<p>((?:<div class="video-box">.*?</div>(?:<br>)*\s*)+)</p>', lambda m: m.group(1).replace('<br>', ''), out, flags=re.S)
    return out

def plain(h, n=200):
    t = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', h))).strip()
    return t if len(t) <= n else t[:n].rsplit(' ', 1)[0] + '…'

users = {u['user_id']: u['username'] for u in q("select user_id, username from {P}users")}
atts = {}
for a in q("select * from {P}attachments where in_message=0 and is_orphan=0 order by filetime, attach_id"):
    atts.setdefault(a['post_msg_id'], []).append(a)

os.makedirs('src/content/forum', exist_ok=True)
for f in os.listdir('src/content/forum'):
    os.remove(os.path.join('src/content/forum', f))

index = []
skipped = 0
for tid, t in sorted(topics.items()):
    posts = []
    for p in q("select * from {P}posts where topic_id=%s and post_approved=1 order by post_time, post_id", tid):
        author = p['post_username'] or users.get(p['poster_id'], 'Гость')
        if author in SPAM_USERS:
            skipped += 1; continue
        body = bbcode(p['post_text'], p['bbcode_uid'])
        files = [{'src': f"/forum/files/{a['physical_filename']}",
                  'thumb': f"/forum/files/thumb_{a['physical_filename']}" if a['thumbnail'] else '',
                  'name': a['real_filename']} for a in atts.get(p['post_id'], [])
                 if a['extension'].lower() in ('jpg', 'jpeg', 'png', 'gif')]
        if not body and not files:
            continue
        posts.append({'id': p['post_id'], 'author': author, 'date': f"{__import__('datetime').datetime.fromtimestamp(p['post_time'], __import__('datetime').timezone.utc):%Y-%m-%d}",
                      'html': body, 'photos': files})
    if not posts:
        continue
    title = html.unescape(t['topic_title'])
    photos = sum(len(p['photos']) for p in posts)
    first_photo = next((p['photos'][0] for p in posts if p['photos']), None)
    data = {'id': tid, 'forum': fslug(t['forum_id']), 'title': title, 'posts': posts}
    json.dump(data, open(f'src/content/forum/{tid}.json', 'w'), ensure_ascii=False)
    index.append({'id': tid, 'forum': t['forum_id'], 'title': title, 'date': posts[0]['date'], 'last': posts[-1]['date'],
                  'posts': len(posts), 'photos': photos, 'excerpt': plain(posts[0]['html']),
                  'cover': (first_photo['thumb'] or first_photo['src']) if first_photo else ''})

used = {x['forum'] for x in index}
out_forums = []
for f in sorted(forums.values(), key=lambda f: f['left_id']):
    if f['forum_id'] not in used:
        continue
    parent = forums.get(f['parent_id'])
    name = html.unescape(f['forum_name'])
    if parent and parent['parent_id']:  # подразделы «Эскизы, проекты…»
        name = f"{html.unescape(parent['forum_name'])}: {name}"
    out_forums.append({'id': f['forum_id'], 'slug': fslug(f['forum_id']), 'title': name,
                       'desc': plain(html.unescape(f.get('forum_desc') or ''), 160)})
json.dump({'forums': out_forums, 'topics': sorted(index, key=lambda x: x['last'], reverse=True)},
          open('src/data/forum.json', 'w'), ensure_ascii=False, indent=1)

# 301-редиректы: viewtopic.php?…t=ID и viewforum.php?f=ID
rules = ['# Архив форума: старые адреса phpBB → статичные страницы']
rules.append('RewriteRule ^forum/files/ - [L]')
rules.append('RewriteCond %{QUERY_STRING} (^|&)t=(\\d+)')
rules.append('RewriteRule ^forum/viewtopic\\.php$ /arhiv-foruma/tema-%2/? [L,R=301]')
for f in out_forums:
    rules.append(f"RewriteCond %{{QUERY_STRING}} (^|&)f={f['id']}(&|$)")
    rules.append(f"RewriteRule ^forum/viewforum\\.php$ /arhiv-foruma/{f['slug']}/? [L,R=301]")
rules.append('RewriteRule ^forum(/.*)?$ /arhiv-foruma/? [L,R=301]')
os.makedirs('import', exist_ok=True)
open('import/forum-redirects.htaccess', 'w').write('\n'.join(rules) + '\n')

# адреса вложений форума, вставленных в статьи сайта (forum/download/file.php?id=N)
amap = {str(a['attach_id']): a['physical_filename'] for a in q("select attach_id, physical_filename from {P}attachments")}
json.dump(amap, open('import/forum-attachments.json', 'w'))
print('разделов', len(out_forums), 'тем', len(index), 'сообщений', sum(x['posts'] for x in index),
      'фото', sum(x['photos'] for x in index), 'спам пропущен', skipped)
