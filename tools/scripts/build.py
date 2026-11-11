import subprocess, re, json, sys
from spellchecker import SpellChecker
pdf = sys.argv[1]
CJK = re.compile(r'[一-鿿]')
head_re = re.compile(r'^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ \-\'’/.]*?)\s*（(n|v|adj|adv|prep|conj)\.）(.*)$')
entries = []
for page in range(1, 101):
    txt = subprocess.run(['pdftotext','-f',str(page),'-l',str(page),pdf,'-'],capture_output=True,text=True).stdout
    lines = [l.strip() for l in txt.split('\n') if l.strip() and l.strip()!='\f']
    level = [400,600,800,990][(page-1)//25]
    cur = None
    for l in lines:
        m = head_re.match(l)
        if m:
            cur = {'word':m.group(1).strip(),'def':'（'+m.group(2)+'.）'+m.group(3),'rest':[], 'level':level,'page':page}
            entries.append(cur)
        else:
            cur['rest'].append(l)
out = []
for e in entries:
    rest = e['rest']
    zh = rest[-1]; body = rest[:-1]
    assert CJK.search(zh), e
    d = e['def']; i = 0
    while i < len(body) and (body[i].startswith('（') or body[i].startswith('；')):
        d += body[i]; i += 1
    ex = ' '.join(body[i:]).replace('’',"'").replace('‘',"'").replace('“','"').replace('”','"')
    assert ex and not CJK.search(ex), e
    # split def into pos groups
    parts = re.split(r'（(n|v|adj|adv|prep|conj)\.）', d)
    defs = []
    for k in range(1, len(parts), 2):
        meaning = parts[k+1].strip().strip('；').strip()
        defs.append({'pos': parts[k]+'.', 'meaning': meaning})
    w = e['word'].replace('’',"'")
    if w[0].isupper() and w.lower() != w and not w.isupper(): w = w[0].lower()+w[1:]
    out.append({'word':w,'defs':defs,'ex':ex,'exZh':zh,'level':e['level']})
print(len(out))
sp = SpellChecker()
sus = []
for o in out:
    toks = re.findall(r"[a-zà-ÿ]+", o['word'].lower())
    unk = sp.unknown(toks)
    stem = o['word'].lower()[:max(3,len(o['word'])-3)]
    inex = stem in o['ex'].lower()
    if unk or not inex:
        sus.append((o['level'], o['word'], list(unk), inex, o['ex']))
for s in sus: print(s)
json.dump(out, open(sys.argv[2],'w'), ensure_ascii=False, indent=1)
