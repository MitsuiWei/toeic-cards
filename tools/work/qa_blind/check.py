import json, sys
q = json.load(open(sys.argv[1], encoding='utf-8')); a = json.load(open(sys.argv[2], encoding='utf-8'))
want = {}
for it in q:
    if 'questions' in it:
        for x in it['questions']: want['%s.%d' % (it['id'], x['n'])] = len(x['options'])
    else: want[it['id']] = len(it['options'])
errs = []; seen = set()
for x in a:
    i = x.get('id')
    if i not in want: errs.append('unknown id %r' % i); continue
    if i in seen: errs.append('duplicate id %s' % i)
    seen.add(i)
    if not isinstance(x.get('pick'), int) or not 0 <= x['pick'] < want[i]: errs.append('%s: pick must be 0..%d' % (i, want[i] - 1))
    if not isinstance(x.get('sure'), bool): errs.append('%s: sure must be true/false' % i)
    if not isinstance(x.get('note'), str): errs.append('%s: note must be a string' % i)
    elif x.get('sure') is False and not x['note'].strip(): errs.append('%s: sure=false needs a note' % i)
for i in want:
    if i not in seen: errs.append('missing %s' % i)
if errs:
    print('FAILED: %d problems' % len(errs))
    for e in errs[:60]: print(' ', e)
    sys.exit(1)
print('OK', len(a), 'answers')
