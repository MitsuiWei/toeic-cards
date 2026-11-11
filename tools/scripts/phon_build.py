# -*- coding: utf-8 -*-
"""產生音標：CMUdict（重音＋音素）為底，用 Wiktionary（WikiPron 美式）佐證弱母音，
再轉成美式 IPA 與 KK。人工覆寫表在 phon_overrides.py。
用法：python3 -I phon_build.py words.json wikipron.tsv out.json [review.tsv]
"""
import json, sys, re, itertools, importlib.util, os
import cmudict

VOW = {'IY': 'i', 'IH': 'ɪ', 'EY': 'eɪ', 'EH': 'ɛ', 'AE': 'æ', 'AA': 'ɑ', 'AO': 'ɔ', 'OW': 'oʊ',
       'UH': 'ʊ', 'UW': 'u', 'AY': 'aɪ', 'AW': 'aʊ', 'OY': 'ɔɪ'}
CON = {'P': 'p', 'B': 'b', 'T': 't', 'D': 'd', 'K': 'k', 'G': 'g', 'F': 'f', 'V': 'v', 'TH': 'θ', 'DH': 'ð',
       'S': 's', 'Z': 'z', 'SH': 'ʃ', 'ZH': 'ʒ', 'HH': 'h', 'CH': 'tʃ', 'JH': 'dʒ', 'M': 'm', 'N': 'n',
       'NG': 'ŋ', 'L': 'l', 'R': 'r', 'Y': 'j', 'W': 'w'}
ON2 = {('P','L'),('P','R'),('B','L'),('B','R'),('T','R'),('D','R'),('K','L'),('K','R'),('G','L'),('G','R'),
       ('F','L'),('F','R'),('TH','R'),('SH','R'),('S','P'),('S','T'),('S','K'),('S','M'),('S','N'),('S','L'),
       ('S','W'),('K','W'),('T','W'),('D','W'),('G','W')}
for c in ['P','B','K','G','F','V','M','HH','N','L','T','D','S','TH','Z']:
    ON2.add((c, 'Y'))
ON3 = {('S','P','L'),('S','P','R'),('S','T','R'),('S','K','R'),('S','K','W'),('S','P','Y'),('S','K','Y'),('S','T','Y')}

def parse(phones):
    out = []
    for p in phones:
        m = re.match(r'^([A-Z]+)([012])?$', p)
        out.append([m.group(1), int(m.group(2)) if m.group(2) is not None else None])
    return out

def is_v(seg): return seg[1] is not None

def normalize(word, segs):
    """CMU 的小毛病修正，讓結果接近學習型字典的美式標音"""
    w = word.lower()
    segs = [s[:] for s in segs]
    nv = sum(1 for s in segs if is_v(s))
    # 字尾 IY2 當作非重音（company）
    if nv > 1 and segs[-1][0] == 'IY' and segs[-1][1] == 2:
        segs[-1][1] = 0
    # -ire: AY ER0 → AY R
    for i in range(len(segs) - 1):
        if segs[i][0] == 'AY' and segs[i + 1][0] == 'ER' and segs[i + 1][1] == 0 and re.search(r'ire(s|d|ment|ments)?$', w) and i + 1 >= len(segs) - 3:
            segs[i + 1] = ['R', None]
    # -ual / -uate: AH0 W + 母音 → UW0 + 母音
    i = 0
    while i < len(segs) - 2:
        if i > 0 and segs[i] == ['AH', 0] and segs[i + 1][0] == 'W' and is_v(segs[i + 2]) and segs[i + 2][1] != 1:
            segs[i:i + 2] = [['UW', 0]]
        i += 1
    # ER0 + 母音 → ə r + 母音（separate, history）；over-/under- 等複合字除外
    if not re.match(r'(over|under|inter|super|cyber|hyper|counter|after)', w):
        i = 0
        while i < len(segs) - 1:
            if segs[i] == ['ER', 0] and is_v(segs[i + 1]):
                segs[i:i + 1] = [['AH', 0], ['R', None]]
                i += 1
            i += 1
    # IY/IH + R → ɪr
    for i in range(len(segs) - 1):
        if segs[i][0] == 'IY' and segs[i + 1][0] == 'R':
            segs[i][0] = 'IH'
    vi = [i for i, s in enumerate(segs) if is_v(s)]
    if len(vi) > 1 and segs[vi[0]][1] != 1:
        first = vi[0]
        pre = ''.join(s[0] for s in segs[:first])
        v = segs[first]
        nxt = segs[first + 1][0] if first + 1 < len(segs) else ''
        prim_second = segs[vi[1]][1] == 1
        # 字首 re-/de-/be-/pre-/e- 的弱母音 → ɪ
        if v[0] in ('IY', 'IH', 'AH') and v[1] in (0, 2):
            if (w.startswith('re') and pre == 'R') or (w.startswith('de') and pre == 'D') or \
               (w.startswith('be') and pre == 'B') or (w.startswith('pre') and pre == 'PR') or \
               (w[0] == 'e' and pre == ''):
                segs[first] = ['IH', 0]
        # en-/em-/es-/ex- 開頭的弱 ɛ → ɪ
        if w[0] == 'e' and pre == '' and v[0] == 'EH' and (v[1] == 0 or (v[1] == 2 and prim_second)):
            segs[first] = ['IH', 0]
        # un-/up- 開頭：ʌ（不標重音）
        if pre == '' and v == ['AH', 0] and ((w.startswith('un') and nxt == 'N' and w not in ('until', 'unless')) or
                                             (w.startswith('up') and nxt == 'P' and w != 'upon')):
            segs[first] = ['AH', 2]
        # ad- 開頭的弱 æ → ə（admit, advantage）
        if pre == '' and v[0] == 'AE' and v[1] in (0, 2) and re.match(r'ad[^aeiou d]', w) and nxt == 'D' and (v[1] == 0 or prim_second):
            segs[first] = ['AH', 0]
    # 字尾弱母音：這些拼法字典標 ɪ
    vi = [i for i, s in enumerate(segs) if is_v(s)]
    if len(vi) > 1:
        last = vi[-1]
        tail = ''.join(s[0] + ' ' for s in segs[last + 1:]).strip()
        if segs[last][0] in ('AH', 'IH') and segs[last][1] == 0:
            if re.search(r'(age|ege|edge|[^aeiou]et|it|ice|ise|est|ist|yst|is|[^aeiou]in|id|ace)(s|es)?$', w) and not re.search(r'(tion|sion|ain|oin)s?$', w):
                segs[last] = ['IH', 0]
            if re.search(r'[td]ed$', w) and tail == 'D':
                segs[last] = ['IH', 0]
            if re.search(r'(s|z|x|sh|ch|ge|ce)es$', w) and tail == 'Z':
                segs[last] = ['IH', 0]
        # -ical / -icle → ɪk
        if re.search(r'ic(al|le|als|les|ally)$', w):
            for j in range(len(segs) - 2):
                if segs[j] == ['AH', 0] and segs[j + 1][0] == 'K' and segs[j + 2] == ['AH', 0]:
                    segs[j] = ['IH', 0]
        # 字尾閉音節的 IY0 其實是完整母音（colleague, series）
        if segs[last] == ['IY', 0] and last < len(segs) - 1 and not w.endswith('ies'):
            segs[last] = ['IY', 2]
        # -ity → əti
        if re.search(r'it(y|ies)$', w) and len(vi) >= 2 and segs[vi[-2]] == ['IH', 0]:
            segs[vi[-2]] = ['AH', 0]
    return segs

def syllabify(segs):
    vi = [i for i, s in enumerate(segs) if is_v(s)]
    if not vi: return [segs]
    bounds = [0]
    for a, b in zip(vi, vi[1:]):
        cl = [s[0] for s in segs[a + 1:b]]
        k = 0
        for n in (3, 2, 1):
            if len(cl) >= n:
                suf = tuple(cl[-n:])
                if (n == 3 and suf in ON3) or (n == 2 and suf in ON2) or (n == 1 and suf[0] != 'NG'):
                    k = n; break
        bounds.append(b - k)
    syl = []
    for i, st in enumerate(bounds):
        en = bounds[i + 1] if i + 1 < len(bounds) else len(segs)
        syl.append(segs[st:en])
    return syl

def seg_ipa(s):
    p, st = s
    if st is None: return CON[p]
    if p == 'AH': return 'ə' if st == 0 else 'ʌ'
    if p == 'ER': return 'ɚ' if st == 0 else 'ɝ'
    return VOW[p]

def to_ipa(segs):
    syl = syllabify(segs)
    out = ''
    multi = len(syl) > 1
    for sy in syl:
        st = [s[1] for s in sy if is_v(s)]
        st = st[0] if st else 0
        if multi and st == 1: out += 'ˈ'
        elif multi and st == 2: out += 'ˌ'
        out += ''.join(seg_ipa(s) for s in sy)
    return out

DIGR = ('eɪ', 'oʊ', 'aɪ', 'aʊ', 'ɔɪ', 'tʃ', 'dʒ')
VCH = set('iɪeɛæɑɔoʊuʌəɝɚa')

def tokens(ipa):
    t = []; i = 0
    while i < len(ipa):
        if ipa[i:i + 2] in DIGR: t.append(ipa[i:i + 2]); i += 2
        else: t.append(ipa[i]); i += 1
    return t

def strip_adjacent(s, prim, sec):
    """次重音緊鄰主重音時不標（字典慣例），母音維持原樣"""
    out = []
    for part in s.split(' '):
        tk = tokens(part)
        marks = [i for i, x in enumerate(tk) if x in (prim, sec)]
        drop = set()
        for n, i in enumerate(marks):
            if tk[i] != sec: continue
            def nuclei(a, b): return sum(1 for x in tk[a:b] if x[0] in VCH)
            if n + 1 < len(marks) and tk[marks[n + 1]] == prim and nuclei(i, marks[n + 1]) == 1: drop.add(i)
            if n > 0 and tk[marks[n - 1]] == prim and nuclei(marks[n - 1], i) == 1: drop.add(i)
        out.append(''.join(x for i, x in enumerate(tk) if i not in drop))
    return ' '.join(out)

def to_kk(ipa):
    """美式 IPA → KK：eɪ→e、oʊ→o、非重音 i→ɪ、母音前的非重音 u→ʊ、重音符號 ˋ ˏ"""
    out = []
    for part in ipa.split(' '):
        tk = tokens(part)
        has_mark = any(x in 'ˈˌ' for x in tk)
        stressed_next = not has_mark   # 單音節：視為重音
        res = []
        for j, x in enumerate(tk):
            if x == 'ˈ': res.append('ˋ'); stressed_next = True; continue
            if x == 'ˌ': res.append('ˏ'); stressed_next = True; continue
            isv = x[0] in VCH
            if isv:
                stressed = stressed_next
                if has_mark: stressed_next = False
                if x == 'eɪ': x = 'e'
                elif x == 'oʊ': x = 'o'
                elif x == 'i' and not stressed: x = 'ɪ'
                elif x == 'u' and not stressed:
                    k = j + 1
                    while k < len(tk) and tk[k] in 'ˈˌ': k += 1
                    nxt = tk[k] if k < len(tk) else ''
                    if nxt and nxt[0] in VCH: x = 'ʊ'
            res.append(x)
        out.append(''.join(res))
    return ' '.join(out)

# ---------- Wiktionary 佐證 ----------
def wp_norm(s):
    s = s.replace(' ', '')
    for a, b in [('d͡ʒ', 'dʒ'), ('t͡ʃ', 'tʃ'), ('ɹ', 'r'), ('ɡ', 'g'), ('ː', ''), ('ɫ', 'l'), ('l̩', 'əl'), ('n̩', 'ən'),
                 ('m̩', 'əm'), ('ɚ̯', 'r'), ('̯', ''), ('ɾ', 't'), ('ʍ', 'w'), ('ɒ', 'ɑ'), ('ɨ', 'ɪ'), ('ᵻ', 'ɪ'), ('ɜr', 'ɝ'), ('ɜ', 'ɝ'),
                 ('(', ''), (')', ''), ('.', ''), ('ˈ', ''), ('ˌ', '')]:
        s = s.replace(a, b)
    return s

def key(s):
    s = s.replace('ˈ', '').replace('ˌ', '')
    s = s.replace('ər', 'ɚ').replace('ɝ', 'ɚ')
    for a in ('ɪɚ', 'iɚ', 'ir'): s = s.replace(a, 'ɪr')
    s = s.replace('ɛɚ', 'ɛr').replace('ɔɚ', 'ɔr').replace('ɑɚ', 'ɑr').replace('ʊɚ', 'ʊr').replace('aɪɚ', 'aɪr')
    s = re.sub(r'o(?!ʊ)', 'oʊ', s)
    s = re.sub(r'e(?!ɪ)', 'eɪ', s)
    s = s.replace('oʊr', 'ɔr').replace('ɔ', 'ɑ')
    return s

def loose(s):
    return key(s).replace('ɪ', 'ə').replace('i', 'ə').replace('ʌ', 'ə')

def main():
    words = json.load(open(sys.argv[1], encoding='utf-8'))
    wp = {}
    for line in open(sys.argv[2], encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) == 2:
            wp.setdefault(parts[0].lower(), set()).add(loose(wp_norm(parts[1])))
    ovp = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'phon_overrides.py')
    OV = {}
    if os.path.exists(ovp):
        spec = importlib.util.spec_from_file_location('phon_overrides', ovp)
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        OV = mod.OVERRIDES
    cmu = cmudict.dict()
    out = []; review = []
    for w in words:
        word = w['w']; poss = [d[0] for d in w['d']]
        flag = ''
        if word in OV:
            ipa = OV[word]; flag = 'manual'
        else:
            ps = cmu.get(word.lower())
            if not ps:
                ipa = '?'; flag = 'MISSING'
            else:
                segs = normalize(word, parse(ps[0]))
                ipa = to_ipa(segs)
                wk = wp.get(word.lower())
                flag = 'nowp' if not wk else ('ok' if loose(ipa) in wk else 'chk')
                if len(ps) > 1: flag += '+var'
        if isinstance(ipa, str):
            kk = strip_adjacent(to_kk(ipa), 'ˋ', 'ˏ'); ipa = strip_adjacent(ipa, 'ˈ', 'ˌ')
        else:   # [[pos, ipa], ...]
            kk = [[p, strip_adjacent(to_kk(x), 'ˋ', 'ˏ')] for p, x in ipa]
            ipa = [[p, strip_adjacent(x, 'ˈ', 'ˌ')] for p, x in ipa]
        out.append({'id': w['id'], 'w': word, 'ipa': ipa, 'kk': kk})
        review.append('\t'.join([str(w['id']), word, ','.join(poss),
                                 ipa if isinstance(ipa, str) else ' | '.join(p + ' ' + x for p, x in ipa),
                                 kk if isinstance(kk, str) else ' | '.join(p + ' ' + x for p, x in kk), flag]))
    json.dump(out, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False)
    if len(sys.argv) > 4:
        open(sys.argv[4], 'w', encoding='utf-8').write('\n'.join(review) + '\n')
    from collections import Counter
    print(Counter(r.split('\t')[-1] for r in review))

if __name__ == '__main__':
    main()
