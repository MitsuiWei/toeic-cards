# -*- coding: utf-8 -*-
"""各選項解析的格式檢查。用法：python3 validate.py p5|listen|read <input.json> <output.json>"""
import json, re, sys
try:
    import hanzidentifier as hz
except Exception:
    hz = None
CJK = re.compile(r'[一-鿿]')
TRAPS = {'', 'Yes／No 陷阱', '答非所問', '重複字陷阱', '相關字陷阱', '相似音陷阱', '一字多義陷阱', '時態或主詞不合', '語意不連貫'}
errs = []
def E(w, m): errs.append('[%s] %s' % (w, m))
def text(w, name, s, mx, need_cjk=True, allow_empty=False):
    if not isinstance(s, str): E(w, '%s 必須是字串' % name); return
    if not s.strip():
        if not allow_empty: E(w, '%s 是空的' % name)
        return
    if len(s) > mx: E(w, '%s 太長（%d 字，上限 %d）：%s' % (name, len(s), mx, s[:30]))
    if need_cjk and not CJK.search(s): E(w, '%s 沒有中文' % name)
    if hz:
        bad = sorted({c for c in s if CJK.match(c) and hz.identify(c) == hz.SIMPLIFIED})
        if bad: E(w, '%s 含簡體字：%s' % (name, ''.join(bad)))
    if re.search(r'選項\s*[A-D]|[（(][A-D][)）]|第[一二三四1-4]個選項', s): E(w, '%s 不要用選項代號或位置，直接寫那個字' % name)
def notes(w, ns, opts, answer, fields):
    if not isinstance(ns, list) or len(ns) != len(opts): E(w, 'notes 要剛好 %d 個' % len(opts)); return
    for o, n in zip(opts, ns):
        ww = '%s / %s' % (w, o[:24])
        if not isinstance(n, dict) or n.get('o') != o: E(ww, 'notes 的順序要和 options 一樣，o 要原樣照抄'); continue
        for name, mx, cjk, empty in fields:
            text(ww, name, n.get(name), mx, cjk, empty)
        if 'trap' in n or any(f[0] == 'trap' for f in fields):
            t = n.get('trap', '')
            if t not in TRAPS: E(ww, 'trap 必須是清單裡的標籤')
            if o == answer and t: E(ww, '正確答案的 trap 要是空字串')
            if o != answer and not t: E(ww, '錯的回答要給 trap 標籤')
mode, inp, out = sys.argv[1], json.load(open(sys.argv[2], encoding='utf-8')), None
try:
    out = json.load(open(sys.argv[3], encoding='utf-8'))
except json.JSONDecodeError as e:
    print('FAILED: JSON 解析失敗：%s' % e); sys.exit(1)
if not isinstance(out, list) or len(out) != len(inp): E('file', '要 %d 筆，目前 %d 筆' % (len(inp), len(out) if isinstance(out, list) else -1))
else:
    for a, b in zip(inp, out):
        w = a['id']
        if b.get('id') != w: E(w, 'id 不一致或順序不對（輸出是 %r）' % b.get('id')); continue
        if mode == 'p5':
            text(w, 'key', b.get('key'), 70)                     # 說明書寫 60／45，這裡多留一點餘裕
            notes(w, b.get('notes'), a['options'], a['answer'], [('pos', 16, False, False), ('zh', 16, True, False), ('use', 50, False, False), ('why', 50, False, False)])
        elif mode == 'listen':
            text(w, 'key', b.get('key'), 50)
            notes(w, b.get('notes'), a['options'], a['answer'], [('trap', 10, False, True), ('why', 45, True, False)])
        elif mode == 'read':
            qs = b.get('qs')
            if not isinstance(qs, list) or len(qs) != len(a['questions']): E(w, 'qs 要 %d 題' % len(a['questions'])); continue
            for qa, qb in zip(a['questions'], qs):
                ww = '%s.%d' % (w, qa['n'])
                if qb.get('n') != qa['n']: E(ww, 'n 不一致'); continue
                text(ww, 'key', qb.get('key'), 60)
                notes(ww, qb.get('notes'), qa['options'], qa['answer'], [('zh', 30, True, False), ('use', 50, False, True), ('why', 50, True, False)])
if errs:
    print('FAILED: %d 個問題' % len(errs))
    for e in errs[:70]: print(' ', e)
    if len(errs) > 70: print('  … 還有 %d 個' % (len(errs) - 70))
    sys.exit(1)
print('OK', len(out), '筆')
