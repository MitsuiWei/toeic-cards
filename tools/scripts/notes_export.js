// 把建好的題庫匯出成「寫各選項解析」用的輸入檔（含答案）：/home/claude/work/notes/in/*.json
// 用法：node notes_export.js      （新增或改了題目之後重跑，再請人照 notes/BRIEF_*.md 補解析）
global.window = {};
for (const f of ['quiz_p5', 'quiz_read', 'quiz_listen']) require('/home/claude/work/site/data/' + f + '.js');
const fs = require('fs'), D = '/home/claude/work/notes/in/';
fs.mkdirSync(D, { recursive: true });
const dump = (n, x) => fs.writeFileSync(D + n, JSON.stringify(x, null, 0).replace(/\},\{"id"/g, '},\n{"id"'));
// 已經有解析的題目，舊的一段說明 ex 不在建好的題庫裡，改從原始檔拿不到也沒關係（給空字串）
for (const lv of [400, 600, 800, 990]) {
  const row = q => ({ id: q.id, kind: q.t === 'f' ? '詞性題' : q.t === 'v' ? '單字題' : '文法題', q: q.q, options: q.o, answer: q.o[q.a], zh: q.zh, old_explanation: q.ex || '' });
  const qs = window.QUIZ_P5.filter(q => q.lv === lv && q.wid !== undefined).sort((a, b) => a.wid - b.wid).map(row);
  dump('p5_' + lv + '_a.json', qs.slice(0, 125)); dump('p5_' + lv + '_b.json', qs.slice(125));
  const gs = window.QUIZ_P5.filter(q => q.lv === lv && q.wid === undefined).map(row);      // 文法題
  if (gs.length) dump('p5g_' + lv + '.json', gs);
  dump('read_' + lv + '.json', window.QUIZ_READ.filter(p => p.lv === lv).map(p => ({ id: p.id, part: p.p, title: p.ti, text: p.tx,
    questions: p.qs.map((q, i) => ({ n: i + 1, q: q.q, options: q.o, answer: q.o[q.a], old_explanation: q.ex || '' })) })));
  dump('listen_' + lv + '.json', window.QUIZ_LISTEN.filter(q => q.lv === lv)
    .map(q => ({ id: q.id, type: q.t, q: q.q, options: q.o, answer: q.o[q.a], zh_q: q.zq, zh_options: q.zo, old_explanation: q.ex || '' })));
}
console.log(fs.readdirSync(D).join(' '));
