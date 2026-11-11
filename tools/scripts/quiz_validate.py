# -*- coding: utf-8 -*-
"""題庫格式檢查。
用法：
  python3 quiz_validate.py p5 <out.json> <in.json>
  python3 quiz_validate.py read <out.json> <level>
  python3 quiz_validate.py listen <out.json> <level>
全部通過會印出 OK；否則列出每一個問題並以非 0 結束。
"""
import json, re, sys

try:
    import hanzidentifier as hz
except Exception:
    hz = None

CJK = re.compile(r'[一-鿿]')
BLANK = '-------'
errors = []

def err(where, msg): errors.append(f'[{where}] {msg}')

def simp_chars(s):
    if not hz: return []
    return sorted({ch for ch in s if CJK.match(ch) and hz.identify(ch) == hz.SIMPLIFIED})

def check_zh(where, s, name, need_cjk=True):
    if not isinstance(s, str) or not s.strip(): err(where, f'{name} 是空的'); return
    if need_cjk and not CJK.search(s): err(where, f'{name} 沒有中文'); return
    bad = simp_chars(s)
    if bad: err(where, f'{name} 含簡體字：{"".join(bad)}')
    if re.search(r'[（(][A-Da-d][)）]|選項\s*[A-D]', s): err(where, f'{name} 不要用選項代號（A/B/C/D），選項順序之後會打亂，請直接寫單字')

def wc(s): return len(re.findall(r"[A-Za-z0-9'’\-]+", s))

def check_opts(where, answer, distractors, n):
    if not isinstance(answer, str) or not answer.strip(): err(where, 'answer 是空的'); return
    if not isinstance(distractors, list) or len(distractors) != n:
        err(where, f'distractors 必須剛好 {n} 個'); return
    opts = [answer] + distractors
    if any((not isinstance(o, str)) or not o.strip() for o in opts): err(where, '選項有空字串'); return
    low = [o.strip().lower() for o in opts]
    if len(set(low)) != len(low): err(where, f'選項重複：{opts}')

def v_p5(out, inp):
    items = json.load(open(out, encoding='utf-8'))
    words = json.load(open(inp, encoding='utf-8'))
    want = {w['wid']: w for w in words}
    if not isinstance(items, list): err('file', '最外層必須是陣列'); return
    seen = {}
    lv = int(re.search(r'p5_(\d+)_', inp).group(1)) if re.search(r'p5_(\d+)_', inp) else 600
    lim = {400: (7, 18), 600: (9, 22), 800: (11, 26), 990: (12, 30)}[lv]
    for i, it in enumerate(items):
        where = f'#{i} wid={it.get("wid")}'
        wid = it.get('wid')
        if wid not in want: err(where, 'wid 不在輸入檔裡'); continue
        if wid in seen: err(where, 'wid 重複'); continue
        seen[wid] = 1
        w = want[wid]
        if it.get('type') not in ('vocab', 'form'): err(where, 'type 必須是 vocab 或 form')
        q = it.get('q', '')
        if not isinstance(q, str) or q.count(BLANK) != 1 or re.search(r'-{8,}', q): err(where, f'q 必須剛好有一個 {BLANK}（7 個連字號）')
        elif re.search(r'-{3,}', q.replace(BLANK, '')): err(where, 'q 有多餘的連字號')
        n = wc(q.replace(BLANK, 'x'))
        if n < lim[0] or n > lim[1]: err(where, f'q 長度 {n} 個字，這一級要 {lim[0]}–{lim[1]}')
        check_opts(where, it.get('answer'), it.get('distractors'), 3)
        ans = (it.get('answer') or '').strip().lower()
        tgt = w['w'].lower()
        k = min(3, len(tgt))
        if ans and tgt[:k] != ans[:k] and tgt not in ans:
            err(where, f'answer「{it.get("answer")}」看起來不是目標字「{w["w"]}」或它的變化形')
        if it.get('type') == 'form' and ans != tgt:
            err(where, f'form 題的 answer 必須就是目標字本身「{w["w"]}」')
        filled = q.replace(BLANK, it.get('answer') or '')
        if re.sub(r'\W+', ' ', filled).strip().lower() == re.sub(r'\W+', ' ', w['seen_example']).strip().lower():
            err(where, '句子和 seen_example 一樣，要寫新的句子')
        for o in [it.get('answer')] + (it.get('distractors') or []):
            if isinstance(o, str) and ' ' in o.strip() and ' ' not in w['w']: err(where, f'選項「{o}」應該是單一個字')
        check_zh(where, it.get('zh'), 'zh')
        check_zh(where, it.get('ex'), 'ex')
    for wid in want:
        if wid not in seen: err('file', f'缺少 wid={wid}（{want[wid]["w"]}）')

KINDS = {'email', 'notice', 'memo', 'advertisement', 'message', 'article', 'letter', 'announcement', 'review', 'form'}

def v_read(out, lv):
    items = json.load(open(out, encoding='utf-8'))
    if not isinstance(items, list): err('file', '最外層必須是陣列'); return
    if len(items) != 30: err('file', f'要 30 篇，目前 {len(items)} 篇')
    lim = {400: (45, 90), 600: (75, 130), 800: (105, 170), 990: (140, 220)}[lv]
    parts = {6: 0, 7: 0}
    titles = set()
    for i, it in enumerate(items):
        where = f'#{i} {str(it.get("title"))[:30]}'
        part = it.get('part')
        if part not in (6, 7): err(where, 'part 必須是 6 或 7'); continue
        parts[part] += 1
        if it.get('kind') not in KINDS: err(where, f'kind 必須是 {sorted(KINDS)} 其中之一')
        t = it.get('title')
        if not isinstance(t, str) or not t.strip(): err(where, 'title 是空的')
        elif t in titles: err(where, 'title 重複')
        titles.add(t)
        text = it.get('text', '')
        if not isinstance(text, str) or not text.strip(): err(where, 'text 是空的'); continue
        n = wc(text.replace(BLANK, 'x'))
        if n < lim[0] or n > lim[1]: err(where, f'text 長度 {n} 個字，這一級要 {lim[0]}–{lim[1]}')
        check_zh(where, it.get('zh'), 'zh')
        if not isinstance(it.get('words'), list) or len(it.get('words')) < 3: err(where, 'words 至少列 3 個本級單字表裡、文中有用到的字')
        qs = it.get('qs')
        if not isinstance(qs, list) or len(qs) != 3: err(where, 'qs 必須剛好 3 題'); continue
        if part == 6:
            if text.count(BLANK) != 3: err(where, f'Part 6 的 text 必須剛好 3 個 {BLANK}')
            for k in (1, 2, 3):
                if f'[{k}] {BLANK}' not in text: err(where, f'Part 6 的空格要寫成 "[{k}] {BLANK}"')
        else:
            if BLANK in text: err(where, 'Part 7 的 text 不應該有空格')
        for j, q in enumerate(qs):
            qw = f'{where} Q{j + 1}'
            if part == 6:
                if q.get('q') != f'[{j + 1}]': err(qw, f'Part 6 的 q 要寫成 "[{j + 1}]"')
            else:
                if not isinstance(q.get('q'), str) or len(q.get('q', '')) < 8: err(qw, 'q 太短或是空的')
            check_opts(qw, q.get('answer'), q.get('distractors'), 3)
            check_zh(qw, q.get('ex'), 'ex')
    if len(items) == 30 and (parts[7] != 20 or parts[6] != 10): err('file', f'要 20 篇 part 7、10 篇 part 6，目前 {parts}')

LTYPES = {'wh', 'yesno', 'choice', 'statement', 'tag', 'request', 'negative'}

def v_listen(out, lv):
    items = json.load(open(out, encoding='utf-8'))
    if not isinstance(items, list): err('file', '最外層必須是陣列'); return
    if len(items) != 100: err('file', f'要 100 題，目前 {len(items)} 題')
    qmax = {400: 11, 600: 13, 800: 16, 990: 18}[lv]
    seen = set()
    for i, it in enumerate(items):
        where = f'#{i} {str(it.get("q"))[:30]}'
        q = it.get('q')
        if not isinstance(q, str) or not q.strip(): err(where, 'q 是空的'); continue
        if q.lower() in seen: err(where, 'q 重複')
        seen.add(q.lower())
        if it.get('type') not in LTYPES: err(where, f'type 必須是 {sorted(LTYPES)} 其中之一')
        if wc(q) > qmax: err(where, f'q 有 {wc(q)} 個字，這一級最多 {qmax}')
        check_opts(where, it.get('answer'), it.get('distractors'), 2)
        for o in [it.get('answer')] + (it.get('distractors') or []):
            if isinstance(o, str) and wc(o) > 14: err(where, f'回答太長（{wc(o)} 個字）：{o}')
        check_zh(where, it.get('zh_q'), 'zh_q')
        check_zh(where, it.get('zh_answer'), 'zh_answer')
        zd = it.get('zh_distractors')
        if not isinstance(zd, list) or len(zd) != 2: err(where, 'zh_distractors 必須剛好 2 個')
        else:
            for z in zd: check_zh(where, z, 'zh_distractors')
        check_zh(where, it.get('ex'), 'ex')
        if re.search(r'\b(Dr|St|Ave|Inc|Co|Ltd)\.', ' '.join([q, it.get('answer') or ''] + (it.get('distractors') or []))):
            err(where, '不要用縮寫（Dr. St. Ave. 等），語音合成會唸錯；改寫成完整的字')

mode = sys.argv[1]
try:
    if mode == 'p5': v_p5(sys.argv[2], sys.argv[3])
    elif mode == 'read': v_read(sys.argv[2], int(sys.argv[3]))
    elif mode == 'listen': v_listen(sys.argv[2], int(sys.argv[3]))
    else: raise SystemExit('unknown mode')
except json.JSONDecodeError as e:
    errors.append(f'[file] JSON 解析失敗：{e}')
if errors:
    print(f'FAILED: {len(errors)} 個問題')
    for e in errors[:80]: print(' ', e)
    if len(errors) > 80: print(f'  ... 還有 {len(errors) - 80} 個')
    sys.exit(1)
print('OK')
