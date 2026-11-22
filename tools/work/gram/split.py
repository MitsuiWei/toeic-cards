# -*- coding: utf-8 -*-
"""文法題原始檔（gram/out/<級別>.json，題目和解析寫在一起）→ 題庫原始檔 quiz/out/p5g_<級別>.json ＋ 解析原始檔 notes/out/p5g_<級別>.json。
題號 g<級別>-<兩位數序號>，照原始檔順序；之後要拿掉某題用 quiz/fixes.json 的 "drop"，不要刪原始檔（題號才不會變）。
用法：python3 /home/claude/work/gram/split.py"""
import json, os
W = '/home/claude/work'
for lv in (400, 600, 800, 990):
    p = '%s/gram/out/%d.json' % (W, lv)
    if not os.path.exists(p): print(lv, '還沒有'); continue
    d = json.load(open(p, encoding='utf-8'))
    qs, ns = [], []
    for i, x in enumerate(d):
        gid = 'g%d-%02d' % (lv, i + 1)
        qs.append({'gid': gid, 'type': x['cat'], 'q': x['q'], 'answer': x['answer'], 'distractors': x['distractors'], 'zh': x['zh']})
        ns.append({'id': gid, 'key': x['key'], 'notes': x['notes']})
    json.dump(qs, open('%s/quiz/out/p5g_%d.json' % (W, lv), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(ns, open('%s/notes/out/p5g_%d.json' % (W, lv), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(lv, len(qs), '題')
