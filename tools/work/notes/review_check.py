# -*- coding: utf-8 -*-
import json, re, sys
try:
    import hanzidentifier as hz
except Exception:
    hz = None
CJK = re.compile(r'[一-鿿]')
src = {}
for x in json.load(open(sys.argv[1], encoding='utf-8')):
    if 'qs' in x:
        for q in x['qs']: src['%s.%d' % (x['id'], q['n'])] = q
    else: src[x['id']] = x
out = json.load(open(sys.argv[2], encoding='utf-8'))
errs = []
if not isinstance(out, list): print('FAILED: 最外層要是陣列'); sys.exit(1)
for i, r in enumerate(out):
    w = '#%d %s' % (i, r.get('id'))
    q = src.get(r.get('id'))
    if not q: errs.append('%s: 找不到這個 id' % w); continue
    f = r.get('field', '')
    if f != 'key':
        m = re.match(r'^notes\.(\d+)\.(why|use|zh|pos|trap)$', f)
        if not m or int(m.group(1)) >= len(q['notes']) or m.group(2) not in q['notes'][int(m.group(1))]:
            errs.append('%s: field %r 不存在' % (w, f)); continue
    if not isinstance(r.get('problem'), str) or not r['problem'].strip(): errs.append('%s: problem 是空的' % w)
    fx = r.get('fix')
    if not isinstance(fx, str) or (not fx.strip() and not f.endswith('.use') and not f.endswith('.trap')): errs.append('%s: fix 是空的' % w); continue
    if hz:
        bad = sorted({c for c in fx if CJK.match(c) and hz.identify(c) == hz.SIMPLIFIED})
        if bad: errs.append('%s: fix 含簡體字 %s' % (w, ''.join(bad)))
if errs:
    print('FAILED: %d 個問題' % len(errs))
    for e in errs[:40]: print(' ', e)
    sys.exit(1)
print('OK', len(out), '個問題')
