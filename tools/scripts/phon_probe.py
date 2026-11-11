import json, sys, cmudict, re
words = json.load(open(sys.argv[1]))
cmu = cmudict.dict()
missing = [w['w'] for w in words if w['w'].lower() not in cmu]
print('missing in CMU:', missing)
# heteronym candidates: multiple CMU prons that differ in stress skeleton or vowel sequence
def skel(p): return ''.join(re.sub(r'[^012]', '', x) for x in p)
het = []
for w in words:
    ps = cmu.get(w['w'].lower(), [])
    if len(ps) > 1 and len({skel(p) for p in ps}) > 1:
        het.append((w['w'], [d[0] for d in w['d']], [' '.join(p) for p in ps]))
print(len(het))
for h in het: print(h[0], h[1], ' | '.join(h[2]))
multi_pos = [(w['w'], [d[0] for d in w['d']]) for w in words if len({d[0] for d in w['d']}) > 1]
print('multi-pos entries:', len(multi_pos))
