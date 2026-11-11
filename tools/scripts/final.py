import json, re, sys
d = json.load(open(sys.argv[1]))
fix = {'aprove':'approve','nconvenience':'inconvenience','ompulsory':'compulsory'}
nohl = []
def find_hl(word, ex):
    w = word.lower()
    low = ex.lower()
    cands = [w]
    if ' ' not in w:
        base = w
        for suf in ('e','y'):
            if base.endswith(suf) and len(base) > 4: cands.append(base[:-1])
        cands.append(w[:max(4, len(w)-2)])
    for c in cands:
        for m in re.finditer(r"[a-zà-ÿ\-]+", low):
            tok = m.group(0)
            if tok.startswith(c) and len(tok) - len(c) <= 4:
                return [m.start(), m.end()]
        i = low.find(c)
        if ' ' in c and i >= 0: return [i, i+len(c)]
    return None
out = []
for i, x in enumerate(d):
    w = fix.get(x['word'], x['word'])
    hl = find_hl(w, x['ex'])
    manual = {'figure':'figure','shrink':'shrunk'}
    if not hl and w in manual:
        j = x['ex'].find(manual[w]); hl = [j, j+len(manual[w])]
    if not hl: nohl.append((w, x['ex']))
    out.append({'id': i, 'w': w, 'lv': x['level'], 'd': [[k['pos'], k['meaning']] for k in x['defs']], 'ex': x['ex'], 'zh': x['exZh'], 'hl': hl})
print('no highlight:', len(nohl))
for n in nohl: print(' ', n)
js = '// 多益單字資料（1000 字，分 400 / 600 / 800 / 990 四級）\n// 欄位：id, w=單字, lv=級別, d=[[詞性, 中文]], ex=例句, zh=例句翻譯, hl=例句中目標字位置\nwindow.WORDS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('},{', '},\n{') + ';\n'
open(sys.argv[2], 'w').write(js)
