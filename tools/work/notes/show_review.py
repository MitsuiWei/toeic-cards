# -*- coding: utf-8 -*-
"""列出查核找到的問題（目前的寫法、問題、建議修正）。
用法：python3 show_review.py read_400 listen_600 …        第一輪（review/，對照 out/）
      python3 show_review.py -2 read_400 …                第二輪（review2/，對照 cur/）"""
import json, sys
R2 = len(sys.argv) > 1 and sys.argv[1] == '-2'
SRC, REV = ('cur', 'review2') if R2 else ('out', 'review')
for name in sys.argv[(2 if R2 else 1):]:
    out = {}
    for x in json.load(open('/home/claude/work/notes/%s/%s.json' % (SRC, name), encoding='utf-8')):
        if 'qs' in x:
            for q in x['qs']: out['%s.%d' % (x['id'], q['n'])] = q
        else: out[x['id']] = x
    rs = json.load(open('/home/claude/work/notes/%s/%s.json' % (REV, name), encoding='utf-8'))
    print('== %s: %d' % (name, len(rs)))
    for r in rs:
        q = out[r['id']]; f = r['field']
        cur = q['key'] if f == 'key' else q['notes'][int(f.split('.')[1])][f.split('.')[2]]
        o = '' if f == 'key' else q['notes'][int(f.split('.')[1])]['o']
        print('%s %s [%s]\n   now: %s\n   problem: %s\n   fix: %s' % (r['id'], f, o[:40], cur, r['problem'], r['fix']))
