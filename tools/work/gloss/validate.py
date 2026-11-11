# -*- coding: utf-8 -*-
import json, re, sys
try:
    import hanzidentifier as hz
except Exception:
    hz = None
POS = {'n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'det.', 'aux.', 'num.', 'int.', 'abbr.', 'phr.'}
CJK = re.compile(r'[一-鿿]')
inp = json.load(open(sys.argv[1], encoding='utf-8')); out = json.load(open(sys.argv[2], encoding='utf-8'))
listw = set(open('/home/claude/work/gloss/in/list_words.txt', encoding='utf-8').read().split('\n'))
errs = []
if len(out) != len(inp): errs.append('要 %d 筆，目前 %d 筆' % (len(inp), len(out)))
defined = set(); used = {}
for i, (a, b) in enumerate(zip(inp, out)):
    w = '#%d %s' % (i, a['f'])
    if b.get('f') != a['f']: errs.append('%s: f 不一致或順序不對（輸出是 %r）' % (w, b.get('f'))); continue
    if b.get('name'):
        if 'l' in b or 'd' in b: errs.append('%s: name 的項目不要有 l 或 d' % w)
        continue
    l = b.get('l')
    if not isinstance(l, str) or not re.match(r"^[a-z][a-z'\-. ]*$", l): errs.append('%s: l 要是小寫英文' % w); continue
    used.setdefault(l, w)
    if 'd' in b:
        if l in listw: errs.append('%s: %s 在 1000 字表裡，不要給 d' % (w, l)); continue
        d = b['d']
        if not isinstance(d, list) or not 1 <= len(d) <= 3: errs.append('%s: d 要 1–3 個意思' % w); continue
        for s in d:
            if not (isinstance(s, list) and len(s) == 2 and s[0] in POS and isinstance(s[1], str) and s[1].strip()):
                errs.append('%s: 意思格式要是 [詞性, 中文]，詞性限 %s' % (w, sorted(POS))); break
            if not CJK.search(s[1]): errs.append('%s: 中文意思沒有中文字' % w); break
            if len(s[1]) > 18: errs.append('%s: 中文意思太長（%d 字）' % (w, len(s[1]))); break
            if re.search(r'[A-Za-z]{3,}', s[1]): errs.append('%s: 中文意思裡不要放英文' % w); break
            if hz:
                bad = sorted({c for c in s[1] if CJK.match(c) and hz.identify(c) == hz.SIMPLIFIED})
                if bad: errs.append('%s: 含簡體字 %s' % (w, ''.join(bad))); break
        defined.add(l)
for l, w in used.items():
    if l not in listw and l not in defined: errs.append('%s: 詞條 %s 沒有任何一筆給 d' % (w, l))
if errs:
    print('FAILED: %d 個問題' % len(errs))
    for e in errs[:60]: print(' ', e)
    sys.exit(1)
print('OK', len(out), '筆；詞條', len(defined), '；字表內', sum(1 for l in used if l in listw), '；專有名詞', sum(1 for b in out if b.get('name')))
