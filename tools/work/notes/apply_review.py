# -*- coding: utf-8 -*-
"""把查核找到、我看過同意的修正併進 fixes.json（建置題庫時套用）。
用法：python3 apply_review.py            讀 review/*.json，略過 review/rejected.json 裡列的 "id|field"
人工另外加的修正放在 manual_fixes.json（格式同 fixes.json），會蓋過查核的修正。"""
import json, glob, os
D = '/home/claude/work/notes'
rej = set(json.load(open(D + '/review/rejected.json', encoding='utf-8'))) if os.path.exists(D + '/review/rejected.json') else set()
fixes = {}; n = 0
# 第一輪查核（review/）之後是第二輪（review2/，美籍英文老師的角度）；後面的蓋過前面的
rej2 = set(json.load(open(D + '/review2/rejected.json', encoding='utf-8'))) if os.path.exists(D + '/review2/rejected.json') else set()
for folder, skip in (('review', rej), ('review2', rej2)):
    for f in sorted(glob.glob(D + '/' + folder + '/*.json')):
        if os.path.basename(f) == 'rejected.json': continue
        for r in json.load(open(f, encoding='utf-8')):
            if '%s|%s' % (r['id'], r['field']) in skip: continue
            fixes.setdefault(r['id'], {})[r['field']] = r['fix'].strip(); n += 1
mp = D + '/manual_fixes.json'
if os.path.exists(mp):
    for i, d in json.load(open(mp, encoding='utf-8')).items():
        fixes.setdefault(i, {}).update(d); n += len(d)
json.dump(fixes, open(D + '/fixes.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
print('fixes.json：%d 題、%d 處修正；略過 %d 處' % (len(fixes), n, len(rej) + len(rej2)))
