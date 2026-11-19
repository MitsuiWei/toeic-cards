# -*- coding: utf-8 -*-
"""查核結果（review/*.json，扣掉 review/rejected.json 列的）加上 manual_fixes.json → fixes.json（給 scripts/aids_build.py 用）。
rejected.json：["<id>|p", "<id>|r", …]；manual_fixes.json：{"<id>": {"p": {...}} 或 {"r": {...} 或 null}}，最後套、蓋過查核結果。"""
import json, glob, os
A = '/home/claude/work/aids'
rej = set(json.load(open(A + '/review/rejected.json', encoding='utf-8'))) if os.path.exists(A + '/review/rejected.json') else set()
fixes, n = {}, 0
for f in sorted(glob.glob(A + '/review/*.json')):
    if os.path.basename(f) == 'rejected.json': continue
    for r in json.load(open(f, encoding='utf-8')):
        if '%s|%s' % (r['id'], r['field']) in rej: continue
        fixes.setdefault(str(r['id']), {})[r['field']] = r['fix']; n += 1
man = json.load(open(A + '/manual_fixes.json', encoding='utf-8')) if os.path.exists(A + '/manual_fixes.json') else {}
for k, v in man.items(): fixes.setdefault(str(k), {}).update(v)
json.dump(fixes, open(A + '/fixes.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('fixes.json：%d 字（查核 %d 處、手動 %d 字、略過 %d 處）' % (len(fixes), n, len(man), len(rej)))
