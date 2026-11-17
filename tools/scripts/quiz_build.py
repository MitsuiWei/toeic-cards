# -*- coding: utf-8 -*-
"""把各級題目合併成網站用的題庫檔，並產生給「盲測檢查」用的無答案版本。
用法：python3 quiz_build.py [--site /path/to/site]
輸入：/home/claude/work/quiz/out/*.json（撰寫的原始題目）、/home/claude/work/quiz/fixes.json（人工修正）
輸出：site/data/quiz_{p5,read,listen,meta}.js、qa_blind/in/q_*.json（無答案）、qa_keys/key_*.json（答案）
選項順序用題號當亂數種子打亂，所以重建不會變動。
"""
import json, random, hashlib, os, re, sys

ROOT = '/home/claude/work/quiz'
SITE = '/home/claude/work/site'
if '--site' in sys.argv: SITE = sys.argv[sys.argv.index('--site') + 1]
LEVELS = [400, 600, 800, 990]
QA = '/home/claude/work/qa_blind/in'      # 無答案版本（給盲測用，和答案分開放）
KEYS = '/home/claude/work/qa_keys'        # 答案
words = json.load(open('/home/claude/work/phon/words.json', encoding='utf-8'))
by_word = {w['w'].lower(): w for w in words}
fixes = {}
fp = os.path.join(ROOT, 'fixes.json')
if os.path.exists(fp): fixes = json.load(open(fp, encoding='utf-8'))
used_fix = set()

def apply_fix(id_, item):
    """fixes.json: {id: "drop"} 或 {id: {"q": "...", "qs.1.answer": "..."}}（點號路徑，數字是陣列索引）"""
    f = fixes.get(id_)
    if f is None: return item
    used_fix.add(id_)
    if f == 'drop': return None
    for k, v in f.items():
        cur = item; parts = k.split('.')
        for p in parts[:-1]: cur = cur[int(p)] if p.isdigit() else cur[p]
        last = parts[-1]
        if last.isdigit(): cur[int(last)] = v
        else: cur[last] = v
    return item

def shuffled(id_, answer, distractors):
    opts = [answer.strip()] + [d.strip() for d in distractors]
    rnd = random.Random(int(hashlib.md5(id_.encode()).hexdigest()[:8], 16))
    order = list(range(len(opts))); rnd.shuffle(order)
    return [opts[i] for i in order], order.index(0)

def load(name):
    p = os.path.join(ROOT, 'out', name)
    if not os.path.exists(p): return None
    return json.load(open(p, encoding='utf-8'))

# ---------- 各選項解析（/home/claude/work/notes/out/*.json，另外寫的；沒有的題目保留舊的 ex）----------
NOTES = '/home/claude/work/notes'
nfix = {}
nfp = os.path.join(NOTES, 'fixes.json')
if os.path.exists(nfp): nfix = json.load(open(nfp, encoding='utf-8'))
used_nfix = set()
def load_notes(name):
    p = os.path.join(NOTES, 'out', name)
    if not os.path.exists(p): return {}
    out = {}
    for x in json.load(open(p, encoding='utf-8')):
        if 'qs' in x:
            for q in x['qs']: out['%s.%d' % (x['id'], q['n'])] = q
        else: out[x['id']] = x
    return out
def notes_for(nid, src, opts, fields):
    """回傳 (解題關鍵, [每個選項一筆，順序和 opts 一樣])；沒有或對不上就回傳 None。
    notes/fixes.json：{題號: {"key": "...", "notes.2.why": "..."}}（notes 的索引是原始檔裡的順序）"""
    x = src.get(nid)
    if not x: return None
    if nid in nfix:
        used_nfix.add(nid)
        for k, v in nfix[nid].items():
            cur = x; parts = k.split('.')
            for p in parts[:-1]: cur = cur[int(p)] if p.isdigit() else cur[p]
            cur[int(parts[-1]) if parts[-1].isdigit() else parts[-1]] = v
    by = {n['o'].strip(): n for n in x['notes']}
    if any(o not in by for o in opts): print('解析和選項對不上：', nid); return None
    return x['key'].strip(), [[(by[o].get(f) or '').strip() for f in fields] for o in opts]
has_notes = {'p5': 0, 'read': 0, 'listen': 0}

def js(name, items):
    body = json.dumps(items, ensure_ascii=False, separators=(',', ':')).replace('},{"id"', '},\n{"id"')
    return 'window.%s = %s;\n' % (name, body)

os.makedirs(QA, exist_ok=True)
os.makedirs(KEYS, exist_ok=True)
meta = {'p5': {}, 'read': {}, 'listen': {}}
missing = []

# ---------- 單字填空 ----------
p5 = []
for lv in LEVELS:
    n = 0
    for tag in ('a', 'b'):
        raw = load('p5_%d_%s.json' % (lv, tag))
        if raw is None: missing.append('p5_%d_%s' % (lv, tag)); continue
        qa, key = [], {}
        nsrc = load_notes('p5_%d_%s.json' % (lv, tag))
        for it in raw:
            id_ = 'p%d' % it['wid']
            it = apply_fix(id_, it)
            if it is None: continue
            o, a = shuffled(id_, it['answer'], it['distractors'])
            row = {'id': id_, 'wid': it['wid'], 'lv': lv, 't': 'f' if it['type'] == 'form' else 'v',
                   'q': it['q'].strip(), 'o': o, 'a': a, 'zh': it['zh'].strip()}
            nn = notes_for(id_, nsrc, o, ('pos', 'zh', 'use', 'why'))
            if nn: row['k'], row['n'] = nn; has_notes['p5'] += 1
            else: row['ex'] = it['ex'].strip()
            p5.append(row)
            qa.append({'id': id_, 'q': it['q'].strip(), 'options': o}); key[id_] = a
        n += len(qa)
        json.dump(qa, open(os.path.join(QA, 'q_p5_%d_%s.json' % (lv, tag)), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        json.dump(key, open(os.path.join(KEYS, 'key_p5_%d_%s.json' % (lv, tag)), 'w', encoding='utf-8'))
    meta['p5'][str(lv)] = n
p5.sort(key=lambda x: x['wid'])

# ---------- 短文閱讀 ----------
read = []
for lv in LEVELS:
    raw = load('read_%d.json' % lv)
    qa, key = [], {}
    nsrc = load_notes('read_%d.json' % lv)
    if raw is None: missing.append('read_%d' % lv); raw = []
    for i, it in enumerate(raw):
        id_ = 'r%d-%02d' % (lv, i + 1)
        it = apply_fix(id_, it)
        if it is None: continue
        qs, qqs = [], []
        for j, q in enumerate(it['qs']):
            o, a = shuffled('%s.%d' % (id_, j), q['answer'], q['distractors'])
            row = {'q': q['q'].strip(), 'o': o, 'a': a}
            nn = notes_for('%s.%d' % (id_, j + 1), nsrc, o, ('zh', 'use', 'why'))
            if nn: row['k'], row['n'] = nn; has_notes['read'] += 1
            else: row['ex'] = q['ex'].strip()
            qs.append(row)
            qqs.append({'n': j + 1, 'q': q['q'].strip(), 'options': o}); key['%s.%d' % (id_, j + 1)] = a
        wids = []
        for w in it.get('words', []):
            x = by_word.get(str(w).lower())
            if x and x['id'] not in wids: wids.append(x['id'])
        read.append({'id': id_, 'lv': lv, 'p': it['part'], 'k': it['kind'], 'ti': it['title'].strip(), 'tx': it['text'].strip(),
                     'zh': it['zh'].strip(), 'w': wids, 'qs': qs})
        qa.append({'id': id_, 'part': it['part'], 'title': it['title'].strip(), 'text': it['text'].strip(), 'questions': qqs})
    meta['read'][str(lv)] = len(qa)
    if qa:
        json.dump(qa, open(os.path.join(QA, 'q_read_%d.json' % lv), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        json.dump(key, open(os.path.join(KEYS, 'key_read_%d.json' % lv), 'w', encoding='utf-8'))

# ---------- 聽力應答 ----------
listen = []
for lv in LEVELS:
    raw = load('listen_%d.json' % lv)
    qa, key = [], {}
    nsrc = load_notes('listen_%d.json' % lv)
    if raw is None: missing.append('listen_%d' % lv); raw = []
    for i, it in enumerate(raw):
        id_ = 'l%d-%03d' % (lv, i + 1)
        it = apply_fix(id_, it)
        if it is None: continue
        opts = [it['answer'].strip()] + [d.strip() for d in it['distractors']]
        zh = [it['zh_answer'].strip()] + [z.strip() for z in it['zh_distractors']]
        rnd = random.Random(int(hashlib.md5(id_.encode()).hexdigest()[:8], 16))
        order = [0, 1, 2]; rnd.shuffle(order)
        o = [opts[k] for k in order]; zo = [zh[k] for k in order]; a = order.index(0)
        row = {'id': id_, 'lv': lv, 't': it['type'], 'q': it['q'].strip(), 'o': o, 'a': a, 'zq': it['zh_q'].strip(), 'zo': zo}
        nn = notes_for(id_, nsrc, o, ('trap', 'why'))
        if nn: row['k'], row['n'] = nn; has_notes['listen'] += 1
        else: row['ex'] = it['ex'].strip()
        listen.append(row)
        qa.append({'id': id_, 'q': it['q'].strip(), 'options': o}); key[id_] = a
    meta['listen'][str(lv)] = len(qa)
    if qa:
        json.dump(qa, open(os.path.join(QA, 'q_listen_%d.json' % lv), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        json.dump(key, open(os.path.join(KEYS, 'key_listen_%d.json' % lv), 'w', encoding='utf-8'))

d = os.path.join(SITE, 'data')
open(os.path.join(d, 'quiz_p5.js'), 'w', encoding='utf-8').write('// 單字填空題庫（Part 5 風格，原創）：id, wid=目標單字, lv, t=v 單字題/f 詞性題, q, o=選項, a=答案索引, zh, k=解題關鍵, n=各選項解析 [詞性, 中文, 用法, 為什麼]（沒有解析的題目是 ex）\n' + js('QUIZ_P5', p5))
open(os.path.join(d, 'quiz_read.js'), 'w', encoding='utf-8').write('// 短文閱讀題庫（Part 6、7 風格，原創）：id, lv, p=6/7, k=類型, ti, tx, zh, w=用到的單字 id, qs=[{q, o, a, k=解題關鍵, n=各選項解析 [中文, 用法, 為什麼]}]\n' + js('QUIZ_READ', read))
open(os.path.join(d, 'quiz_listen.js'), 'w', encoding='utf-8').write('// 聽力應答題庫（Part 2 風格，原創）：id, lv, t=題型, q, o=三個回答, a, zq, zo, k=解題關鍵, n=各選項解析 [陷阱類型, 為什麼]\n' + js('QUIZ_LISTEN', listen))
open(os.path.join(d, 'quiz_meta.js'), 'w', encoding='utf-8').write('// 各題型各級的題數（統計頁和練習首頁用，不必先載入整個題庫）\nwindow.QUIZ_META = %s;\n' % json.dumps(meta, separators=(',', ':')))

from collections import Counter
print('p5', len(p5), dict(Counter(x['lv'] for x in p5)), 'answer positions', dict(Counter(x['a'] for x in p5)), 'types', dict(Counter(x['t'] for x in p5)))
print('read', len(read), dict(Counter(x['lv'] for x in read)), 'parts', dict(Counter(x['p'] for x in read)))
print('listen', len(listen), dict(Counter(x['lv'] for x in listen)), 'answer positions', dict(Counter(x['a'] for x in listen)))
print('有各選項解析的題數', has_notes, '（單字填空 %d、閱讀 %d、聽力 %d 題）' % (len(p5), sum(len(x['qs']) for x in read), len(listen)))
if set(nfix) - used_nfix: print('UNUSED notes fixes:', sorted(set(nfix) - used_nfix))
if missing: print('MISSING inputs:', missing)
unused = set(fixes) - used_fix
if unused: print('UNUSED fixes:', sorted(unused))
for f in ('quiz_p5.js', 'quiz_read.js', 'quiz_listen.js'): print(f, os.path.getsize(os.path.join(d, f)) // 1024, 'KB')
