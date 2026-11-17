cd /home/claude/work/notes/out/tmp_read_600
python3 - <<'PY'
import json,glob
o=[]
for f in sorted(glob.glob('b*.json')): o+=json.load(open(f))
json.dump(o,open('/home/claude/work/notes/out/read_600.json','w'),ensure_ascii=False)
i=json.load(open('/home/claude/work/notes/in/read_600.json'));json.dump(i[:len(o)//1],open('/tmp/inN.json','w'))
PY
python3 /home/claude/work/notes/validate.py read /tmp/inN.json /home/claude/work/notes/out/read_600.json
