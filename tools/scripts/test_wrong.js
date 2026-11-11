// 測「統計頁點進去看單字」和「錯題分析」：先塞一些卡片進度、做幾回練習（故意答錯），再檢查畫面。
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const SHOTS = '/home/claude/work/shots/';
const fakeSpeech = () => {
  window.__spoken = [];
  const fake = { speaking: false, pending: false, cancel() {}, getVoices() { return []; },
    speak(u) { window.__spoken.push(u.text); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 5); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
// 像截圖裡的狀態：400 分 79 張複習中、2 張學習中、3 張已會；600 分 2 張
const seed = () => {
  const now = Date.now(), DAY = 864e5, st = ToeicDebug.state();
  const W = window.WORDS.filter(w => w.lv === 400);
  W.slice(0, 79).forEach((w, i) => { const iv = [1, 1, 2, 3, 4, 6, 9, 15, 24, 40][i % 10];
    st.recs[w.id] = { st: 'review', step: 0, iv, ef: 2.5, due: now + (i % 7 === 0 ? -3600e3 : (i % 9) * DAY + 3600e3), reps: 3 + i % 4, lapses: i % 11 === 0 ? 2 : i % 5 === 0 ? 1 : 0, last: now - DAY }; });
  W.slice(79, 80).forEach(w => { st.recs[w.id] = { st: 'learning', step: 1, iv: 0, ef: 2.5, due: now + 8 * 60e3, reps: 1, lapses: 0, last: now }; });
  W.slice(80, 81).forEach(w => { st.recs[w.id] = { st: 'relearning', step: 0, iv: 1, ef: 2.3, due: now - 60e3, reps: 4, lapses: 1, last: now }; });
  W.slice(81, 84).forEach(w => { st.recs[w.id] = { st: 'known', step: 0, iv: 0, ef: 2.5, due: 0, reps: 0, lapses: 0, last: now }; });
  const W6 = window.WORDS.filter(w => w.lv === 600);
  W6.slice(0, 2).forEach(w => { st.recs[w.id] = { st: 'learning', step: 0, iv: 0, ef: 2.5, due: now + 60e3, reps: 1, lapses: 0, last: now }; });
};
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, w, h, dsf] of [['phone', 390, 844, 2], ['ipad', 820, 1180, 2], ['desk', 1280, 900, 1]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
    const shot = async (n, full) => { await p.screenshot({ path: SHOTS + 'w-' + name + '-' + n + '.png', fullPage: !!full }); const o = await overflow(p); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o + 'px'); };
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.evaluate(seed);
    await p.click('.tab[data-level="400"]'); await p.waitForTimeout(100);

    // ---------- 統計：點圖例 ----------
    await p.click('[data-view="stats"]'); await p.waitForTimeout(150);
    console.log(name, 'legend:', await p.$$eval('.legend-btn', e => e.map(x => x.textContent.trim())));
    await p.click('.legend-btn[data-stat-g="review"]'); await p.waitForTimeout(100);
    console.log(name, 'review:', (await p.textContent('.sw-head')).replace(/\s+/g, ' '), '|', (await p.textContent('.sw-note')).slice(0, 70), '| rows', await p.$$eval('.sw-list .wl-item', e => e.length));
    console.log(name, 'first rows:', await p.$$eval('.sw-list .wl-item', e => e.slice(0, 3).map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 70))));
    await p.evaluate(() => document.querySelector('#levelBars').scrollIntoView()); await p.waitForTimeout(60);
    await shot('s1-review');
    await p.click('.sw-list .wl-word >> nth=0'); await p.waitForTimeout(40);
    console.log(name, 'spoken from list:', (await p.evaluate(() => window.__spoken)).slice(-1));
    await p.click('.legend-btn[data-stat-g="learning"]'); await p.waitForTimeout(100);
    console.log(name, 'learning:', (await p.textContent('.sw-head')).replace(/\s+/g, ' '), '|', await p.$$eval('.sw-list .wl-item', e => e.map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 60))));
    await p.evaluate(() => document.querySelector('#levelBars').scrollIntoView()); await p.waitForTimeout(60);
    await shot('s2-learning');
    await p.click('.sw-levels [data-stat-lv="600"]'); await p.waitForTimeout(80);
    console.log(name, 'learning@600 rows:', await p.$$eval('.sw-list .wl-item', e => e.length));
    await p.click('.legend-btn[data-stat-g="new"]'); await p.waitForTimeout(100);
    console.log(name, 'new@600:', (await p.textContent('.sw-head')).replace(/\s+/g, ' '), 'rows', await p.$$eval('.sw-list .wl-item', e => e.length), 'more?', !!(await p.$('#statMore')));
    await p.click('#statMore'); await p.waitForTimeout(80);
    console.log(name, 'after more rows:', await p.$$eval('.sw-list .wl-item', e => e.length));
    await p.click('[data-stat-close]'); await p.waitForTimeout(60);
    console.log(name, 'closed:', await p.evaluate(() => document.getElementById('statWords').hidden));
    await p.click('.lb[data-stat-lv="800"]'); await p.waitForTimeout(80);       // 從級別那一列點
    console.log(name, 'row 800 →', (await p.textContent('.sw-head')).replace(/\s+/g, ' '));
    await p.click('[data-stat-close]');

    // ---------- 練習：做幾回，故意答錯 ----------
    await p.click('[data-view="practice"]'); await p.waitForTimeout(150);
    console.log(name, 'home wrong card (before):', (await p.textContent('.prac-wrong .prac-mode-stat')));
    await p.click('[data-start="p5"]'); await p.waitForTimeout(300);
    for (let i = 0; i < 10; i++) {
      const a = await p.evaluate(() => { const q = document.querySelector('.prac-q').textContent; const it = window.QUIZ_P5.find(x => q.indexOf(x.q.split('-------')[0].trim()) === 0 && q.indexOf(x.q.split('-------')[1].trim()) >= 0); return it.a; });
      await p.click('.opt >> nth=' + ([0, 3, 6, 7].includes(i) ? (a + 1) % 4 : a)); await p.waitForTimeout(60);
      await p.click('[data-act="next"]'); await p.waitForTimeout(60);
    }
    console.log(name, 'p5 done buttons:', await p.$$eval('.prac-done .btn-row button', e => e.map(x => x.textContent.trim())));
    await p.click('.prac-done [data-act="quit"]'); await p.waitForTimeout(80);
    await p.click('[data-start="listen"]'); await p.waitForTimeout(500);
    for (let i = 0; i < 10; i++) {
      const a = await p.evaluate(() => null);
      await p.click('.opts-abc .opt >> nth=' + (i % 3)); await p.waitForTimeout(80);
      await p.click('[data-act="next"]'); await p.waitForTimeout(250);
    }
    await p.click('.prac-done [data-act="quit"]'); await p.waitForTimeout(80);
    for (let k = 0; k < 4; k++) {
      if (k === 0) { await p.click('[data-start="read"]'); await p.waitForTimeout(300); }
      for (let qi = 0; qi < 3; qi++) { await p.click('.rq >> nth=' + qi + ' >> .opt >> nth=' + ((qi + k) % 4)); await p.waitForTimeout(60); }
      if (k < 3) { await p.click('[data-act="next"]'); await p.waitForTimeout(250); }
    }
    await p.click('.prac-home'); await p.waitForTimeout(100);
    console.log(name, 'home wrong card (after):', (await p.textContent('.prac-wrong .prac-mode-stat')));
    await shot('a0-home');

    // ---------- 錯題分析 ----------
    await p.click('[data-act="wrong"]'); await p.waitForTimeout(300);
    console.log(name, 'stats:', await p.$$eval('.wa-stats .stat', e => e.map(x => x.textContent.replace(/\s+/g, ' '))));
    console.log(name, 'weak:', await p.evaluate(() => { const e = document.querySelector('.wa-weak-h'); return e ? e.textContent : '(none)'; }));
    console.log(name, 'cats:', await p.$$eval('.wa-row', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
    console.log(name, 'redo btns:', await p.$$eval('[data-redo]', e => e.map(x => x.textContent)), '| chips:', await p.$$eval('[data-wf]', e => e.map(x => x.textContent)), '| listed', await p.$$eval('.wq', e => e.length));
    await shot('a1-analysis', true);
    // 展開三種題型各一題
    for (const tp of ['p5', 'listen', 'read']) {
      await p.click('[data-wf="' + tp + '"]'); await p.waitForTimeout(80);
      await p.click('.wq >> nth=0 >> summary'); await p.waitForTimeout(80);
      if (tp === 'read') { await p.click('.wq[open] .read-zh summary'); await p.waitForTimeout(60); }
      const marks = await p.evaluate(() => { const b = document.querySelector('.wq[open] .wq-body'); return { ok: b.querySelectorAll('.is-correct').length, no: b.querySelectorAll('.is-wrong').length }; });
      console.log(name, tp, 'opened → correct/wrong marks', JSON.stringify(marks), '|', (await p.textContent('.wq[open] summary')).replace(/\s+/g, ' ').slice(0, 80));
      await p.evaluate(() => document.querySelector('.wq[open]').scrollIntoView()); await p.waitForTimeout(60);
      await shot('a2-open-' + tp, tp === 'read');
    }
    // 重做單字填空錯題：全部答對 → 錯題應該清掉
    await p.click('[data-wf="all"]'); await p.waitForTimeout(60);
    await p.click('[data-redo="p5"]'); await p.waitForTimeout(300);
    console.log(name, 'redo top:', (await p.textContent('.prac-top')).replace(/\s+/g, ' '));
    const n = await p.evaluate(() => +document.querySelector('.prac-top').textContent.match(/\/\s*(\d+)/)[1]);
    for (let i = 0; i < n; i++) {
      const a = await p.evaluate(() => { const q = document.querySelector('.prac-q').textContent; const it = window.QUIZ_P5.find(x => q.indexOf(x.q.split('-------')[0].trim()) === 0 && q.indexOf(x.q.split('-------')[1].trim()) >= 0); return it.a; });
      await p.click('.opt >> nth=' + a); await p.waitForTimeout(60);
      await p.click('[data-act="next"]'); await p.waitForTimeout(60);
    }
    console.log(name, 'redo done:', (await p.textContent('.prac-done')).replace(/\s+/g, ' ').slice(0, 60), '| buttons:', await p.$$eval('.prac-done .btn-row button', e => e.map(x => x.textContent.trim())));
    await p.click('.prac-done [data-act="quit"]'); await p.waitForTimeout(100);
    console.log(name, 'back on analysis:', (await p.textContent('.prac-top')).replace(/\s+/g, ' ').slice(0, 30), '| redo btns:', await p.$$eval('[data-redo]', e => e.map(x => x.textContent)));
    // 重做閱讀錯題一篇
    await p.click('[data-redo="read"]'); await p.waitForTimeout(300);
    console.log(name, 'redo read top:', (await p.textContent('.prac-top')).replace(/\s+/g, ' '));
    await p.click('[data-act="quit"]'); await p.waitForTimeout(80);
    // 切級別：分析頁要跟著換
    await p.click('.tab[data-level="800"]'); await p.waitForTimeout(100);
    console.log(name, '800 analysis:', (await p.textContent('#pracRoot')).replace(/\s+/g, ' ').slice(0, 60));
    await p.click('.tab[data-level="all"]'); await p.waitForTimeout(100);
    console.log(name, 'all analysis stats:', await p.$$eval('.wa-stats .stat b', e => e.map(x => x.textContent)));
    await p.click('[data-act="wrong-home"]'); await p.waitForTimeout(80);
    // 統計頁的捷徑
    await p.click('[data-view="stats"]'); await p.waitForTimeout(150);
    console.log(name, 'stats link:', await p.textContent('[data-goto="wrong"]'));
    await p.click('[data-goto="wrong"]'); await p.waitForTimeout(200);
    console.log(name, 'via stats →', (await p.textContent('.prac-top b')), '| view:', await p.evaluate(() => ToeicDebug.state().view));
    console.log(name, 'sample record:', await p.evaluate(() => { const s = ToeicDebug.state().practice; return JSON.stringify([Object.values(s.p5)[0], Object.values(s.read)[0], Object.values(s.listen)[0]]).replace(/\d{13}/g, 'T'); }));
    await ctx.close();
  }
  console.log('errs', errs);
  await b.close();
})();
