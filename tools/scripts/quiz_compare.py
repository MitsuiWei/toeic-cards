# -*- coding: utf-8 -*-
"""比對「盲測作答」和答案，列出不一致或被標記的題目。
用法：python3 quiz_compare.py <name> [<name> ...]     name 例如 listen_400、read_600、p5_600_b
"""
import json, sys, os
QA = '/home/claude/work/qa_blind/in'; OUT = '/home/claude/work/qa_blind/out'; KEYS = '/home/claude/work/qa_keys'
L = 'ABCD'
tot = bad = flagged = 0
for name in sys.argv[1:]:
    q = json.load(open(os.path.join(QA, 'q_%s.json' % name), encoding='utf-8'))
    key = json.load(open(os.path.join(KEYS, 'key_%s.json' % name), encoding='utf-8'))
    ap = os.path.join(OUT, 'a_%s.json' % name)
    if not os.path.exists(ap): print('== %s: 還沒有作答檔' % name); continue
    ans = {x['id']: x for x in json.load(open(ap, encoding='utf-8'))}
    items = {}
    for it in q:
        if 'questions' in it:
            for x in it['questions']: items['%s.%d' % (it['id'], x['n'])] = (it, x)
        else: items[it['id']] = (None, it)
    n = m = f = 0
    from collections import Counter
    picks = Counter()
    for id_, k in key.items():
        n += 1; a = ans.get(id_)
        if a is None: print('  %s: 沒作答' % id_); continue
        picks[a['pick']] += 1
        mis = a['pick'] != k; fl = (a.get('sure') is False)
        if not mis and not fl: continue
        m += mis; f += fl
        psg, x = items[id_]
        print('\n--- %s %s%s' % (id_, 'MISMATCH ' if mis else '', 'FLAG' if fl else ''))
        if psg is not None: print('  [%s] %s' % (psg['title'], psg['text'].replace('\n', ' / ')[:900]))
        print('  Q:', x['q'])
        for i, o in enumerate(x['options']):
            print('   %s%s %s' % ('*' if i == k else ' ', '>' if i == a['pick'] else ' ', o))
        if a.get('note'): print('  note:', a['note'])
    print('== %s: %d 題，不一致 %d，被標記 %d；作答分布 %s' % (name, n, m, f, dict(picks)))
    tot += n; bad += m; flagged += f
print('\n總計 %d 題，不一致 %d，被標記 %d   （* = 答案，> = 盲測選的）' % (tot, bad, flagged))
