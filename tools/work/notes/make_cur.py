# -*- coding: utf-8 -*-
"""把 fixes.json 套到 out/*.json，產生「目前線上會看到的解析」cur/*.json（給第二輪查核看的；索引和 out 一樣）。"""
import json, glob, os
D = '/home/claude/work/notes'
fixes = json.load(open(D + '/fixes.json', encoding='utf-8'))
n = 0
for f in sorted(glob.glob(D + '/out/*.json')):
    data = json.load(open(f, encoding='utf-8'))
    for x in data:
        targets = [('%s.%d' % (x['id'], q['n']), q) for q in x['qs']] if 'qs' in x else [(x['id'], x)]
        for i, q in targets:
            for k, v in fixes.get(i, {}).items():
                cur = q; parts = k.split('.')
                for p in parts[:-1]: cur = cur[int(p)] if p.isdigit() else cur[p]
                cur[int(parts[-1]) if parts[-1].isdigit() else parts[-1]] = v; n += 1
    json.dump(data, open(D + '/cur/' + os.path.basename(f), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('cur/：%d 個檔，套用 %d 處修正' % (len(glob.glob(D + '/cur/*.json')), n))
