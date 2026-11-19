# -*- coding: utf-8 -*-
"""檢查查核結果的格式，並把修正套上去後再跑一次 validate。用法：python3 review_check.py in/400.json out/400.json review/400.json"""
import json, sys, subprocess, tempfile, os
inp, out, rev = sys.argv[1:4]
data = json.load(open(out, encoding='utf-8'))
try:
    rv = json.load(open(rev, encoding='utf-8'))
except Exception as e:
    print('查核檔不是合法 JSON：', e); sys.exit(1)
by = {x['id']: x for x in data}
errs = []
for r in rv:
    if r.get('id') not in by: errs.append('沒有這個 id：%s' % r.get('id')); continue
    if r.get('field') not in ('p', 'r'): errs.append('%s：field 要是 p 或 r' % r['id']); continue
    if r['field'] == 'p' and not isinstance(r.get('fix'), dict): errs.append('%s：p 的 fix 必須是完整物件' % r['id']); continue
    if not r.get('problem'): errs.append('%s：缺 problem' % r['id'])
    by[r['id']][r['field']] = r.get('fix')
if errs: print('\n'.join(errs)); sys.exit(1)
tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8')
json.dump(data, tmp, ensure_ascii=False); tmp.close()
res = subprocess.run(['python3', '/home/claude/work/aids/validate.py', inp, tmp.name], capture_output=True, text=True)
os.unlink(tmp.name)
if res.returncode != 0: print('套上修正後格式有問題：\n' + res.stdout); sys.exit(1)
print('OK %d 個問題' % len(rv))
