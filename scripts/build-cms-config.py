#!/usr/bin/env python3
"""Собирает public/admin/config.yml из scripts/cms-config.src.yml: раскрывает общие блоки (якоря YAML)
и убирает служебные ключи, начинающиеся с «_». Запуск: python3 scripts/build-cms-config.py"""
import os, yaml
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = yaml.safe_load(open(os.path.join(root, 'scripts/cms-config.src.yml'), encoding='utf-8'))
cfg = {k: v for k, v in src.items() if not k.startswith('_')}
class NoAlias(yaml.SafeDumper):
    def ignore_aliases(self, data): return True
out = '# Собрано из scripts/cms-config.src.yml скриптом scripts/build-cms-config.py — правьте исходник.\n'
out += yaml.dump(cfg, Dumper=NoAlias, allow_unicode=True, sort_keys=False, width=200)
open(os.path.join(root, 'public/admin/config.yml'), 'w', encoding='utf-8').write(out)
print('ok', len(cfg['collections']), 'коллекций')
