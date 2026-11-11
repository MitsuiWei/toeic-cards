import subprocess, re, json, sys
pdf = sys.argv[1]
head_re = re.compile(r'^([A-Za-z][A-Za-z \-\'’/().]*?)\s*（([a-z.]+)）(.*)$')
entries = []
for page in range(1, 101):
    txt = subprocess.run(['pdftotext','-f',str(page),'-l',str(page),pdf,'-'],capture_output=True,text=True).stdout
    lines = [l.strip() for l in txt.split('\n')]
    lines = [l for l in lines if l and l != '\f']
    level = [400,600,800,990][(page-1)//25]
    cur = None
    for l in lines:
        m = head_re.match(l)
        if m:
            cur = {'word':m.group(1).strip(),'raw_def':'（'+m.group(2)+'）'+m.group(3),'lines':[], 'level':level,'page':page}
            entries.append(cur)
        elif cur is not None:
            cur['lines'].append(l)
json.dump(entries, open(sys.argv[2],'w'), ensure_ascii=False, indent=1)
print(len(entries))
from collections import Counter
print(Counter(e['level'] for e in entries))
print(Counter(len(e['lines']) for e in entries))
pc = Counter(e['page'] for e in entries)
print([p for p in range(1,101) if pc[p]!=10])
