// 舊格式的練習紀錄（沒有「選了哪個選項」那一欄）也要能看錯題分析
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/claude/work/site/index.html'); await p.waitForTimeout(300);
  await p.evaluate(() => { const s = ToeicDebug.state(), t = Date.now();
    s.practice.p5 = { p1: [1, 0, t, 0], p2: [2, 1, t, 1], p3: [1, 0, t - 5, 0, 'undefined'] };
    s.practice.read = { 'r400-01': [1, 1, t, 1], 'r400-03': [1, 3, t, 3] };
    s.practice.listen = { 'l400-001': [1, 0, t, 0], 'l400-002': [3, 2, t, 1] }; });
  await p.click('.tab[data-level="400"]'); await p.click('[data-view="practice"]'); await p.waitForTimeout(100);
  console.log('home:', await p.textContent('.prac-wrong .prac-mode-stat'));
  await p.click('[data-act="wrong"]'); await p.waitForTimeout(500);
  console.log('stats:', await p.$$eval('.wa-stats .stat', e => e.map(x => x.textContent)));
  console.log('list:', await p.$$eval('.wq summary', e => e.map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 60))));
  for (let i = 0; i < 4; i++) { await p.click('.wq >> nth=' + i + ' >> summary'); await p.waitForTimeout(40); }
  console.log('marks:', await p.$$eval('.wq[open] .wq-body', e => e.map(x => x.querySelectorAll('.is-correct').length + '/' + x.querySelectorAll('.is-wrong').length)));
  console.log('legacy read note:', await p.evaluate(() => { const e = [...document.querySelectorAll('.wq-body .fb-ex')].find(x => /更新前/.test(x.textContent)); return e ? e.textContent.slice(0, 30) : '(none)'; }));
  await p.click('[data-redo="read"]'); await p.waitForTimeout(300);
  console.log('redo read:', (await p.textContent('.prac-top')).replace(/\s+/g, ' '), '|', await p.textContent('.passage-head b'));
  console.log('errs', errs); await b.close();
})();
