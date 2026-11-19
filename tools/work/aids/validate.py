# -*- coding: utf-8 -*-
"""檢查自然發音／字根字首的輸出格式。用法：python3 validate.py in/400.json out/400.json"""
import json, re, sys
inp = json.load(open(sys.argv[1], encoding='utf-8'))
try:
    out = json.load(open(sys.argv[2], encoding='utf-8'))
except Exception as e:
    print('輸出不是合法 JSON：', e); sys.exit(1)
SIMP = set('这们说时会过还发问题对现实开关门东车长书个为学习听读写语词义项应该没让认识较质节吗从买卖单转动务员产业设计价钱进运际场处经济结构网络头观点线级体变选择万与气历难双号图达边条样须视软页华简办调统员费货额资营销专业务够连续标优势销户补报释辅导导轨删键签证护驾驶际较闭团园坏奖离临热谁预压权厅饭馆庆庄乐爱亲轻')
errs = []
if not isinstance(out, list): print('輸出要是陣列'); sys.exit(1)
if len(out) != len(inp): errs.append('題數不同：輸入 %d、輸出 %d' % (len(inp), len(out)))
for a, b in zip(inp, out):
    i = a['id']
    if b.get('id') != i: errs.append('%s：id 對不上（%s）' % (i, b.get('id'))); continue
    p = b.get('p')
    if not isinstance(p, dict): errs.append('%s：缺 p' % i); continue
    s, st, n = p.get('s', ''), p.get('st'), p.get('n', '')
    if s.replace('·', '').lower() != a['w'].lower(): errs.append('%s %s：s 拿掉 · 之後和單字不同（%s）' % (i, a['w'], s))
    syl = [x for x in re.split('[·-]', s) if x]
    if not isinstance(st, int) or not (0 <= st < len(syl)): errs.append('%s %s：st 超出音節數（%s / %d）' % (i, a['w'], st, len(syl)))
    if not n or len(n) > 45: errs.append('%s %s：n 是空的或超過 45 字（%d）' % (i, a['w'], len(n)))
    r = b.get('r', 'missing')
    if r == 'missing': errs.append('%s：缺 r（沒有拆解要寫 null）' % i)
    elif r is not None:
        parts, m = r.get('p'), r.get('m', '')
        if not isinstance(parts, list) or not (2 <= len(parts) <= 5): errs.append('%s %s：r.p 要 2–5 段' % (i, a['w']))
        else:
            for x in parts:
                if not (isinstance(x, list) and len(x) == 2 and re.fullmatch(r'-?[A-Za-z]+(-[A-Za-z]+)*-?', x[0] or '') and x[1] and len(x[1]) <= 8):
                    errs.append('%s %s：r.p 這段格式不對 %s' % (i, a['w'], x))
        if not m or len(m) > 30 or '→' not in m: errs.append('%s %s：r.m 要有「→」且不超過 30 字（%s）' % (i, a['w'], m))
    txt = json.dumps(b, ensure_ascii=False)
    bad = sorted(set(c for c in txt if c in SIMP))
    if bad: errs.append('%s %s：疑似簡體字 %s' % (i, a['w'], ''.join(bad)))
if errs:
    print('\n'.join(errs[:80])); print('共 %d 個問題' % len(errs)); sys.exit(1)
print('OK（%d 字，有字根拆解 %d）' % (len(out), sum(1 for b in out if b.get('r'))))
