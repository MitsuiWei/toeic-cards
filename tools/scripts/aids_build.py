# -*- coding: utf-8 -*-
"""把 work/aids/out/*.json（自然發音、字根字首）加上 work/aids/fixes.json 的修正，產生 site/data/aids.js。
fixes.json：{"<id>": {"p": {...} 或 "r": {...} 或 null}}，整個欄位覆蓋。
用法：python3 /home/claude/scripts/aids_build.py"""
import json, glob, os
A = '/home/claude/work/aids'
fixes = json.load(open(A + '/fixes.json', encoding='utf-8')) if os.path.exists(A + '/fixes.json') else {}
import re
# 發音規則裡的「字首」常被寫手拿來指「開頭的字母／音節」（字首 a 弱化、字首 so 輕讀），會和「字根字首」的字首（prefix）搞混，
# 一律改成「開頭」：「字首 re 的 e」→「開頭 re 的 e」，「字首 a 弱化」→「開頭的 a 弱化」
def norm_n(n):
    n = re.sub(r'字首 ?([A-Za-z]+) ?的', r'開頭 \1 的', n)
    return re.sub(r'字首 ?([A-Za-z]+)', r'開頭的 \1', n)
out, nr = {}, 0
for f in sorted(glob.glob(A + '/out/*.json')):
    for x in json.load(open(f, encoding='utf-8')):
        e = {'p': dict(x['p'], n=norm_n(x['p']['n']))}
        if x.get('r'): e['r'] = x['r']
        for k, v in fixes.get(str(x['id']), {}).items():
            if v is None: e.pop(k, None)
            else: e[k] = dict(v, n=norm_n(v['n'])) if k == 'p' else v
        if e.get('r'): nr += 1
        out[str(x['id'])] = e
js = ('// 單字卡提示：自然發音與字根字首（scripts/aids_build.py 產生，不要手改）\n'
      '// p = { s: 音節（· 分隔）, st: 重音節（從 0 起算）, n: 發音規則 }；r = { p: [[字首／字根／字尾, 意思], …], m: 怎麼連到字義 }（沒有可靠拆法就沒有 r）\n'
      'window.TOEIC_AIDS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
open('/home/claude/work/site/data/aids.js', 'w', encoding='utf-8').write(js)
print('aids.js：%d 字，有字根拆解 %d，%d KB' % (len(out), nr, len(js.encode()) // 1024))
