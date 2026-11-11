const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
  // seed: appointment(8) in review, departure(67) known, refund(119) learning; others new
  await ctx.addInitScript(() => {
    if (localStorage.getItem('toeic-cards-v1')) return;
    const now = Date.now();
    const recs = { 8: { st: 'review', step: 0, iv: 5, ef: 2.5, due: now + 3 * 864e5, reps: 4, lapses: 0, last: now - 864e5 },
                   67: { st: 'known', step: 0, iv: 0, ef: 2.5, due: 0, reps: 0, lapses: 0, last: now - 864e5 },
                   119: { st: 'learning', step: 1, iv: 0, ef: 2.5, due: now + 6e5, reps: 1, lapses: 0, last: now } };
    localStorage.setItem('toeic-cards-v1', JSON.stringify({ v: 1, recs, log: [], level: 400, view: 'practice', settings: {} }));
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/claude/work/site/index.html'); await p.waitForTimeout(300);
  console.log('scope default:', await p.$eval('.chip.is-on', e => e.textContent));
  await p.click('[data-start="p5"]'); await p.waitForTimeout(200);
  const order = [];
  for (let i = 0; i < 5; i++) {
    const info = await p.evaluate(() => { const q = document.querySelector('.prac-q').textContent; const it = window.QUIZ_P5.find(x => q.startsWith(x.q.split('-------')[0])); return { a: it.a, wid: it.wid, w: it.o[it.a], note: (document.querySelector('.prac-top + .prac-bar + .note') || {}).textContent }; });
    order.push(info.w);
    if (i === 0) console.log('padding note:', info.note);
    await p.keyboard.press(String(((info.a + 1) % 4) + 1)); await p.waitForTimeout(80);   // answer everything wrong
    const note = await p.evaluate(() => (document.querySelector('.fb-note') || {}).textContent || '');
    console.log(' ', info.w, '→ note:', note || '(none)');
    await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  }
  console.log('order (learned first):', order.join(', '));
  console.log('recs after:', await p.evaluate(() => { const s = ToeicDebug.state().recs; return [8, 67, 119].map(i => i + ':' + s[i].st + (s[i].lapses ? '/lapses' + s[i].lapses : '')).join(' '); }));
  console.log('rail count 400:', await p.$eval('.tab-400 .tab-count', e => e.textContent));
  // round 2: previously wrong ones come back
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  console.log('round 2 top:', (await p.textContent('.prac-top')).replace(/\s+/g, ' '));
  // sync merge for practice + pday
  const r = await p.evaluate(() => {
    const st = ToeicDebug.state(); const now = Date.now();
    const res = ToeicDebug.mergeRemote({ practice: { p5: { p8: [9, 9, now + 5000, 1], p196: [1, 1, 1, 1], p999: [2, 1, now, 0] }, listen: { 'l400-001': [1, 1, now, 1] } },
                                          pday: { '2026-11-01': { p5: [10, 8], t: now }, [Object.keys(st.pday)[0]]: { p5: [1, 1], t: 5 } } });
    return { p8: st.practice.p5.p8.slice(0, 2), p196n: st.practice.p5.p196[0], l1: !!st.practice.listen['l400-001'], pWins: res.practiceLocalWins.length, dWins: res.pdayLocalWins, days: Object.keys(st.pday).sort(), changed: res.changed };
  });
  console.log('merge:', JSON.stringify(r));
  // reset clears practice
  p.on('dialog', d => d.accept());
  await p.click('[data-view="settings"]'); await p.click('#resetBtn'); await p.waitForTimeout(150);
  await p.click('[data-view="practice"]'); await p.waitForTimeout(150);
  console.log('after reset:', await p.$$eval('.prac-mode-stat', e => e.map(x => x.textContent)));
  console.log('errs', errs);
  await b.close();
})();
