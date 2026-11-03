"""Вставляет переадресации старого магазина (import/shop-redirects.htaccess) в public/.htaccess между метками."""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HT = os.path.join(ROOT, 'public/.htaccess')
import json, glob
rules = open(os.path.join(ROOT, 'import/shop-redirects.htaccess'), encoding='utf-8').read().strip()
# Разделы без товаров на сайте не публикуются — их адреса ведём в ближайший непустой раздел выше
cats = json.load(open(os.path.join(ROOT, 'src/data/shop/categories.json'), encoding='utf-8'))
prods = [json.load(open(f, encoding='utf-8')) for f in glob.glob(os.path.join(ROOT, 'src/data/shop/products/*.json'))]
prods = [p for p in prods if p.get('active', True) is not False]
byid = {c['id']: c for c in cats}
def sub(i): return [i] + [x for c in cats if c['parent'] == i for x in sub(c['id'])]
def full(i):
    ids = set(sub(i)); return any(p['category'] in ids or set(p.get('also') or []) & ids for p in prods)
def target(path):
    c = next((c for c in cats if c['path'] == path), None)
    while c and not full(c['id']): c = byid.get(c['parent'])
    return f"/magazin/{c['path']}/" if c else '/magazin/'
rules = re.sub(r'https://gidrologia\.ru/magazin/(?!tovar/)([^ ]+?)/ ', lambda m: 'https://gidrologia.ru' + target(m.group(1)) + ' ', rules)
block = f"""# >>> магазин (scripts/inject_shop_redirects.py)
# Старый магазин shop.gidrologia.ru: когда поддомен направлен на этот сайт, его адреса ведут в /magazin/.
RewriteCond %{{HTTP_HOST}} ^(www\\.)?shop\\.gidrologia\\.ru$ [NC]
RewriteRule ^oplata/?$ https://gidrologia.ru/magazin/oplata/ [L,R=301]
RewriteCond %{{HTTP_HOST}} ^(www\\.)?shop\\.gidrologia\\.ru$ [NC]
RewriteRule ^dostavka/?$ https://gidrologia.ru/magazin/dostavka/ [L,R=301]
RewriteCond %{{HTTP_HOST}} ^(www\\.)?shop\\.gidrologia\\.ru$ [NC]
RewriteRule ^guarantee/?$ https://gidrologia.ru/magazin/garantii/ [L,R=301]
RewriteCond %{{HTTP_HOST}} ^(www\\.)?shop\\.gidrologia\\.ru$ [NC]
RewriteRule ^(netcat_files|images)/ - [L]
RewriteCond %{{HTTP_HOST}} ^(www\\.)?shop\\.gidrologia\\.ru$ [NC]
RewriteRule !^catalog/ https://gidrologia.ru/magazin/ [L,R=301]
{rules}
# Товара или раздела больше нет — в ближайший существующий раздел, иначе в магазин
RewriteCond %{{DOCUMENT_ROOT}}/magazin/$1 -d
RewriteRule ^catalog/(.+)/[^/]+_\\d+\\.html$ https://gidrologia.ru/magazin/$1/ [L,R=301]
RewriteCond %{{DOCUMENT_ROOT}}/magazin/$1 -d
RewriteRule ^catalog/([^/]+)/.+$ https://gidrologia.ru/magazin/$1/ [L,R=301]
RewriteRule ^catalog(/.*)?$ https://gidrologia.ru/magazin/ [L,R=301]
# <<< магазин"""
s = open(HT, encoding='utf-8').read()
s = re.sub(r'\n# Магазин пока на поддомене[^\n]*\nRewriteRule \^magazin/\?\$ https://shop\.gidrologia\.ru/ \[L,R=302\]', '', s)
if '# >>> магазин' in s:
    s = re.sub(r'# >>> магазин.*?# <<< магазин', lambda m: block, s, flags=re.S)
else:
    # до приведения хоста к gidrologia.ru — чтобы старые ссылки вели в товар за один переход
    s = s.replace('RewriteCond %{HTTP_HOST} !^gidrologia\\.ru$ [NC]', block + '\n\nRewriteCond %{HTTP_HOST} !^gidrologia\\.ru$ [NC]', 1)
open(HT, 'w', encoding='utf-8').write(s)
print('ok')
