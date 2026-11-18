# -*- coding: utf-8 -*-
"""第二輪查核（美籍英文老師）挑出的題目本身不自然的說法：改題目原文（quiz/fixes.json）並同步改解析（notes/manual_fixes.json）。
跑一次就好；重複跑結果相同。"""
import json, copy
W = '/home/claude/work'
qf_path = W + '/quiz/fixes.json'; mf_path = W + '/notes/manual_fixes.json'
qf = json.load(open(qf_path, encoding='utf-8')); mf = json.load(open(mf_path, encoding='utf-8'))
raw = {}
for lv in (400, 600, 800, 990):
    for i, x in enumerate(json.load(open(W + '/quiz/out/read_%d.json' % lv, encoding='utf-8'))): raw['r%d-%02d' % (lv, i + 1)] = x
    for i, x in enumerate(json.load(open(W + '/quiz/out/listen_%d.json' % lv, encoding='utf-8'))): raw['l%d-%03d' % (lv, i + 1)] = x
cur = {}
for name in ('read_400', 'read_600', 'read_800', 'read_990', 'listen_400', 'listen_600', 'listen_800', 'listen_990'):
    for x in json.load(open(W + '/notes/cur/%s.json' % name, encoding='utf-8')):
        if 'qs' in x:
            for q in x['qs']: cur['%s.%d' % (x['id'], q['n'])] = q
        else: cur[x['id']] = x

# 每篇：(英文原文替換, 中文替換, 單字表替換)
P = {
 'r400-03': ([('The quantity is limited', 'Quantities are limited')], [], {'quantity': 'quantities'}),
 'r400-16': ([('The only negative point is the manual.', 'My only complaint is the manual.')], [], {'negative': 'complaint'}),
 'r400-26': ([('all beverages are sold at a 20% discount', 'all beverages are 20% off')], [], {}),
 'r600-05': ([('Access will return on Sunday morning', 'Access will be restored on Sunday morning')], [], {}),
 'r600-22': ([('a reward of $1,000', 'a $1,000 prize')], [], {'reward': 'prize'}),
 'r600-06': ([('guarantee', 'warranty')], [], {'guarantee': 'warranty'}),
 'r600-10': ([('inside the city', 'within the city'), ('guarantee', 'warranty')], [], {'guarantee': 'warranty'}),
 'r600-26': ([('In conclusion,', 'Overall,')], [], {'conclusion': 'overall'}),
 'l400-022': ([('At the city hall.', 'At City Hall.'), ('At the city hall', 'At City Hall')], [], {}),
 'l600-056': ([('guarantee', 'warranty')], [], {}),
 'l600-087': ([('charity sale', 'charity auction')], [('慈善義賣', '慈善拍賣會')], {}),
 # 800／990 分（11/19 第二輪查核）
 'r800-07': ([('tax statement', 'tax return')], [], {}),
 'r800-21': ([('a saving of 20 percent on the regular price', '20 percent off the regular price')], [], {}),
 'r800-22': ([('restricted to the construction personnel', 'restricted to construction personnel')], [], {}),
 'r800-25': ([('agreed in advance', 'agreed upon in advance')], [], {}),
 'r800-26': ([('at the headquarters', 'at headquarters')], [], {}),
 'r800-02': ([('Cancel them until next week', 'Postpone them until next week')], [], {}),
 'r990-03': ([('projected saving during', 'projected savings during')], [], {}),
 'r990-11': ([('managerial retreat', 'leadership retreat')], [], {}),
 'r990-13': ([('rigid shift patterns', 'rigid shift schedules'), ('a similar scheme', 'a similar program')], [], {}),
 'r990-25': ([('imported timber', 'imported lumber')], [], {}),
 'r990-28': ([("in the city's calendar", "on the city's calendar")], [], {}),
 'l990-027': ([('incentive scheme', 'incentive program')], [], {}),
 'l990-043': ([('liaise with', 'coordinate with')], [], {}),
 'l990-028': ([('the consignment from', 'the shipment from')], [], {}),
 'l990-072': ([('Go forward two blocks and turn left.', 'Please step forward when your name is called.')], [('往前走兩個街區再左轉。', '叫到名字時請往前站。')], {}),
 'l800-042': ([('Would you like me to delegate some of your workload?', 'Would you like to delegate some of your workload to me?')],
              [('要不要我把你的一部分工作分派給別人？', '你要不要把一部分工作交給我？')], {}),
}
def rep(s, pairs):
    for a, b in pairs: s = s.replace(a, b)
    return s
nq = nn = 0
for pid, (en, zh, wmap) in P.items():
    src = raw[pid]; fx = {}
    if pid.startswith('r'):
        for fld in ('text',):
            new = rep(src[fld], en)
            if new != src[fld]: fx[fld] = new
        if zh:
            new = rep(src['zh'], zh)
            if new != src['zh']: fx['zh'] = new
        if wmap:
            nw = [wmap.get(w, w) for w in src['words']]
            if nw != src['words']: fx['words'] = nw
        for j, q in enumerate(src['qs']):
            for fld in ('q', 'answer'):
                new = rep(q[fld], en)
                if new != q[fld]: fx['qs.%d.%s' % (j, fld)] = new
            for k, d in enumerate(q['distractors']):
                new = rep(d, en)
                if new != d: fx['qs.%d.distractors.%d' % (j, k)] = new
            # 解析
            nid = '%s.%d' % (pid, j + 1); c = cur[nid]; nf = {}
            if rep(c['key'], en) != c['key']: nf['key'] = rep(c['key'], en)
            for i, n in enumerate(c['notes']):
                for f in ('o', 'use', 'why'):
                    if n.get(f) and rep(n[f], en) != n[f]: nf['notes.%d.%s' % (i, f)] = rep(n[f], en)
            if nf: mf.setdefault(nid, {}).update(nf); nn += len(nf)
    else:
        for fld in ('q', 'answer'):
            new = rep(src[fld], en)
            if new != src[fld]: fx[fld] = new
        for k, d in enumerate(src['distractors']):
            new = rep(d, en)
            if new != d: fx['distractors.%d' % k] = new
        for fld in ('zh_q', 'zh_answer'):
            if zh and rep(src[fld], zh) != src[fld]: fx[fld] = rep(src[fld], zh)
        for k, d in enumerate(src.get('zh_distractors', [])):
            if zh and rep(d, zh) != d: fx['zh_distractors.%d' % k] = rep(d, zh)
        c = cur[pid]; nf = {}
        if rep(c['key'], en) != c['key']: nf['key'] = rep(c['key'], en)
        for i, n in enumerate(c['notes']):
            for f in ('o', 'why'):
                if n.get(f) and rep(n[f], en) != n[f]: nf['notes.%d.%s' % (i, f)] = rep(n[f], en)
        if nf: mf.setdefault(pid, {}).update(nf); nn += len(nf)
    if fx:
        old = qf.get(pid, {}); old.update(fx); qf[pid] = old; nq += len(fx)
    print(pid, sorted(fx), '| 解析：', {k: v for k, v in mf.items() if k == pid or k.startswith(pid + '.')} if pid in mf or any(k.startswith(pid + '.') for k in mf) else '')
json.dump(qf, open(qf_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(mf, open(mf_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('題目修正 %d 處、解析修正 %d 處' % (nq, nn))
