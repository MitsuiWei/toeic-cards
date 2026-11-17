# -*- coding: utf-8 -*-
"""把題目（in/）和目前的解析（cur/）合在一起，產生給查核者讀的 rv/*.json。先跑 make_cur.py。"""
import json, os
D = '/home/claude/work/notes'
os.makedirs(D + '/rv', exist_ok=True)
for name in sorted(os.listdir(D + '/cur')):
    inp = json.load(open(D + '/in/' + name, encoding='utf-8')); cur = json.load(open(D + '/cur/' + name, encoding='utf-8'))
    out = []
    for a, b in zip(inp, cur):
        assert a['id'] == b['id']
        if 'questions' in a:
            out.append({'id': a['id'], 'part': a['part'], 'title': a['title'], 'text': a['text'],
                        'questions': [{'n': q['n'], 'q': q['q'], 'options': q['options'], 'answer': q['answer'], 'key': x['key'], 'notes': x['notes']} for q, x in zip(a['questions'], b['qs'])]})
        else:
            row = {k: a[k] for k in a if k != 'old_explanation'}
            row['key'] = b['key']; row['notes'] = b['notes']; out.append(row)
    json.dump(out, open(D + '/rv/' + name, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('rv/：%d 個檔' % len(os.listdir(D + '/rv')))
