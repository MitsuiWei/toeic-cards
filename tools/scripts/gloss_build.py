# -*- coding: utf-8 -*-
"""把題庫小字典合併成網站用的 data/gloss.js，並用 CMUdict 補上音標（和單字卡同一套轉換）。
用法：python3 gloss_build.py
輸入：/home/claude/work/gloss/out/gloss_{1..4}.json、/home/claude/work/gloss/fixes.json（人工修正，可無）
輸出：site/data/gloss.js
  window.GLOSS = {
    f: { 變化形: 原形 },                         只列和原形不同的
    w: { 原形: [KK, IPA, '詞性|中文', …] },      字表以外的字
    n: { 專有名詞: 1 },
    c: { 原形: 顯示時的大小寫 }                 例如 monday → Monday、ceo → CEO
  }
"""
import json, os, sys, importlib.util
import cmudict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('phon_build', os.path.join(HERE, 'phon_build.py'))
pb = importlib.util.module_from_spec(spec); spec.loader.exec_module(pb)

G = '/home/claude/work/gloss'
SITE = '/home/claude/work/site'
listw = set(open(os.path.join(G, 'in', 'list_words.txt'), encoding='utf-8').read().split('\n'))
entries = []
for i in (1, 2, 3, 4):
    entries += json.load(open(os.path.join(G, 'out', 'gloss_%d.json' % i), encoding='utf-8'))
fixes = {}
fp = os.path.join(G, 'fixes.json')
if os.path.exists(fp): fixes = json.load(open(fp, encoding='utf-8'))
# fixes.json：{"forms": {form: 原形 或 null（=專有名詞）}, "defs": {原形: [[詞性, 中文], …]}}
for e in entries:
    f = e['f']
    if f in fixes.get('forms', {}):
        v = fixes['forms'][f]
        e.pop('name', None); e.pop('l', None)
        if v is None: e['name'] = 1
        else: e['l'] = v

names, fmap, defs = {}, {}, {}
for e in entries:
    if e.get('name'): names[e['f']] = 1; continue
    if e['f'] != e['l']: fmap[e['f']] = e['l']
    if 'd' in e and e['l'] not in defs and e['l'] not in listw: defs[e['l']] = e['d']
for l, d in fixes.get('defs', {}).items(): defs[l] = d
missing = sorted({l for l in list(fmap.values()) + [e['l'] for e in entries if not e.get('name')] if l not in defs and l not in listw})
if missing: print('沒有解釋的原形：', missing); sys.exit(1)

cmu = cmudict.dict()
def phon(word):
    ps = cmu.get(word.lower())
    if not ps: return '', ''
    try:
        ipa = pb.to_ipa(pb.normalize(word, pb.parse(ps[0])))
        return pb.strip_adjacent(pb.to_kk(ipa), 'ˋ', 'ˏ'), pb.strip_adjacent(ipa, 'ˈ', 'ˌ')
    except Exception:
        return '', ''

w = {}; nophon = []
for l in sorted(defs):
    kk, ip = phon(l)
    if not kk: nophon.append(l)
    w[l] = [kk, ip] + ['%s|%s' % (p, z.strip()) for p, z in defs[l]]
# 顯示時要大寫的原形（月份、星期、國籍語言、I、縮寫）
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
NAT = ['english', 'european', 'italian', 'korean', 'japanese', 'chinese', 'american', 'french', 'german', 'spanish', 'asian', 'british', 'canadian', 'australian', 'taiwanese', 'indian', 'mexican', 'thai', 'vietnamese']
UPPER = ['ceo', 'hr', 'id', 'pdf', 'qr', 'ok', 'tv', 'atm', 'vip', 'usb', 'gps', 'faq', 'it', 'pc', 'cv', 'pr', 'diy', 'ai']
TITLE = ['mr', 'mrs', 'ms', 'dr', 'ltd', 'inc']
disp = {}
for l in w:
    zh = ''.join(w[l][2:])
    if l in DAYS or l in NAT or l in TITLE: disp[l] = l.capitalize()
    elif l in MONTHS and '月' in zh and l != 'may': disp[l] = l.capitalize()
    elif l == 'i' or l.startswith("i'"): disp[l] = 'I' + l[1:]
    elif l in UPPER and any(x.startswith('abbr.') or x.startswith('int.') for x in w[l][2:]): disp[l] = l.upper()
    elif l == 'wi-fi': disp[l] = 'Wi-Fi'
out = {'f': dict(sorted(fmap.items())), 'w': w, 'n': dict(sorted(names.items())), 'c': disp}
body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(SITE, 'data', 'gloss.js'), 'w', encoding='utf-8').write(
    '// 題庫小字典：練習題裡出現的字（字表以外的）→ 原形、音標、中文。在題目上點一個字時用。\n'
    '// f = 變化形 → 原形；w = 原形 → [KK, IPA, "詞性|中文", …]；n = 專有名詞（人名、公司名、地名）\n'
    'window.GLOSS = ' + body + ';\n')
print('變化形', len(fmap), '；詞條', len(w), '；專有名詞', len(names), '；沒有音標', len(nophon), '；大寫顯示', len(disp), ' '.join(sorted(disp.values())))
print('沒有音標的：', ' '.join(nophon[:80]))
print('gloss.js', os.path.getsize(os.path.join(SITE, 'data', 'gloss.js')) // 1024, 'KB')
