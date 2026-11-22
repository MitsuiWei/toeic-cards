# -*- coding: utf-8 -*-
"""檢查文法題原始檔的格式。用法：python3 validate.py out/400.json"""
import json, sys, re
from collections import Counter
WANT = {'verb': 15, 'prep': 10, 'conj': 10, 'pron': 7, 'other': 8}
SIMP = set('这们说时会过还发问题对现实开关门东车长书个为学习听读写语词义项应该没让认识较质节吗从买卖单转动务员产业设计价钱进运际场处经济结构网络头观点线级体变选择万与气历难双号图达边条样须视软页华简办调统费货额资营销专够连续标优势户补报释辅导删键签证护驾驶闭团园坏奖离临热谁预压权厅饭馆庆庄乐爱亲轻后')
try: d = json.load(open(sys.argv[1], encoding='utf-8'))
except Exception as e: print('不是合法 JSON：', e); sys.exit(1)
errs = []
cnt = Counter(x.get('cat') for x in d)
if dict(cnt) != WANT: errs.append('各類題數要是 %s，現在是 %s' % (WANT, dict(cnt)))
order = [x.get('cat') for x in d]
if order != sorted(order, key=lambda c: list(WANT).index(c) if c in WANT else 9): errs.append('要依 cat 順序排列：verb, prep, conj, pron, other')
seen_q, seen_o = set(), Counter()
for i, x in enumerate(d):
    t = '第 %d 題（%s）' % (i + 1, x.get('q', '')[:30])
    q = x.get('q', '')
    if q.count('-------') != 1 or '--------' in q: errs.append(t + '：要剛好一個 -------')
    if q in seen_q: errs.append(t + '：題目重複')
    seen_q.add(q)
    ans, ds = x.get('answer', ''), x.get('distractors', [])
    opts = [ans] + list(ds)
    if not ans or len(ds) != 3 or len(set(o.strip().lower() for o in opts)) != 4: errs.append(t + '：要 1 個答案＋3 個不同的誘答')
    seen_o[tuple(sorted(o.lower() for o in opts))] += 1
    if not x.get('zh'): errs.append(t + '：缺 zh')
    k = x.get('key', '')
    if not k or len(k) > 70: errs.append(t + '：key 是空的或超過 70 字（%d）' % len(k))
    ns = x.get('notes', [])
    if [n.get('o') for n in ns] != opts: errs.append(t + '：notes 的 o 要依序是 answer、distractors')
    for n in ns:
        for f, lim in (('pos', 14), ('zh', 16), ('use', 50), ('why', 50)):
            v = n.get(f, '')
            if not v or len(v) > lim: errs.append('%s：%s 的 %s 是空的或超過 %d 字（%d）' % (t, n.get('o'), f, lim, len(v)))
    bad = sorted(set(c for c in json.dumps(x, ensure_ascii=False) if c in SIMP))
    if bad: errs.append(t + '：疑似簡體字 ' + ''.join(bad))
for o, c in seen_o.items():
    if c > 2: errs.append('同一組選項出現 %d 次：%s' % (c, ' / '.join(o)))
if errs:
    print('\n'.join(errs[:80])); print('共 %d 個問題' % len(errs)); sys.exit(1)
print('OK（%d 題）' % len(d))
