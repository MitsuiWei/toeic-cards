// 測「多益落點測驗」與平常練習估分：首頁卡片、說明頁、40 題適性出題、結果頁、建議級別、統計頁估分、中途結束、
// 切級別不中斷、沒有語音時只測閱讀、雲端合併（place／placeCleared）、清除進度。
// 用法：node test_place.js
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const SHOTS = '/home/claude/work/shots/';
const fakeSpeech = () => {
  window.__spoken = [];
  const fake = { speaking: false, pending: false, cancel() {}, getVoices() { return []; },
    speak(u) { window.__spoken.push(u.text); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 3); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
const noSpeech = () => { Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); };
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
// 模擬一個大約 500 分的考生：各級答對機率
const PROB = { 400: 0.85, 600: 0.6, 800: 0.35, 990: 0.25 };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, w, h, dsf] of [['phone', 390, 844, 2], ['small', 320, 640, 1], ['desk', 1280, 900, 1]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    const shot = async (n, full) => { await p.screenshot({ path: SHOTS + 'pt-' + name + '-' + n + '.png', fullPage: !!full }); const o = await overflow(p); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o + 'px'); };
    const count = sel => p.$$eval(sel, e => e.length);
    const need = (what, cond) => { if (!cond) errs.push(name + ': ' + what); };
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.click('.tab[data-level="400"]'); await p.click('[data-view="practice"]'); await p.waitForTimeout(150);
    need('home card', await count('.prac-place') === 1);
    need('home card says not tested', /還沒測過/.test(await p.textContent('.prac-place')));
    if (name !== 'desk') await shot('0-home');

    // ---- 說明頁 → 中途結束 ----
    await p.click('.prac-place'); await p.waitForTimeout(100);
    need('intro shown', await count('.pt-intro') === 1);
    await shot('1-intro', true);
    await p.click('[data-act="pt-start"]'); await p.waitForTimeout(500);
    need('first item is listening', await p.evaluate(() => Practice._pt().type === 'listen'));
    need('listening auto-played', await p.evaluate(() => window.__spoken.length >= 1));
    need('next disabled before choosing', await p.$eval('[data-act="pt-next"]', e => e.disabled));
    await p.click('.opts .opt >> nth=1'); await p.waitForTimeout(60);
    need('option selected', await count('.opt.is-sel') === 1);
    need('no feedback during test', await count('.fb') === 0);
    // 切級別不會中斷測驗
    await p.click('.tab[data-level="600"]'); await p.waitForTimeout(120);
    need('test survives level switch', await p.evaluate(() => !!Practice._pt() && Practice._pt().phase === 'run'));
    await p.click('[data-act="pt-quit"]'); await p.waitForTimeout(100);
    need('quit returns home', await count('.prac-place') === 1 && await p.evaluate(() => !Practice._pt()));
    need('quit does not save a result', await p.evaluate(() => Object.keys(ToeicDebug.state().place).length === 0));
    await p.click('.tab[data-level="400"]'); await p.waitForTimeout(80);

    // ---- 完整做一次 ----
    const before = await p.evaluate(() => { const s = ToeicDebug.state(); return ['p5', 'read', 'listen'].map(t => Object.keys(s.practice[t]).length); });
    await p.click('.prac-place'); await p.waitForTimeout(80);
    await p.click('[data-act="pt-start"]'); await p.waitForTimeout(300);
    const log = []; let shots = 0, guard = 0;
    while (guard++ < 60) {
      const st = await p.evaluate(() => { const x = Practice._pt(); return x && x.phase === 'run' ? { type: x.type, lv: x.it.lv, id: x.it.id, a: x.it.a, qa: x.it.qs ? x.it.qs.map(q => q.a) : null, n: x.it.o ? x.it.o.length : 4 } : null; });
      if (!st) break;
      log.push(st.type[0] + st.lv);
      if (st.type === 'read') {
        for (let qi = 0; qi < 3; qi++) {
          const ok = rnd() < PROB[st.lv];
          await p.click('.rq >> nth=' + qi + ' >> .opt >> nth=' + (ok ? st.qa[qi] : (st.qa[qi] + 1) % 4)); await p.waitForTimeout(30);
        }
      } else {
        const ok = rnd() < PROB[st.lv];
        if (name === 'phone' || name === 'desk') await p.keyboard.press(String((ok ? st.a : (st.a + 1) % st.n) + 1));
        else await p.click('.opts .opt >> nth=' + (ok ? st.a : (st.a + 1) % st.n));
        await p.waitForTimeout(30);
      }
      if (shots < 3 && ((st.type === 'listen' && shots === 0) || (st.type === 'p5' && shots === 1) || (st.type === 'read' && shots === 2))) { await shot('2-run-' + st.type, true); shots++; }
      if (name === 'phone') await p.keyboard.press('Enter'); else await p.click('[data-act="pt-next"]');
      await p.waitForTimeout(st.type === 'listen' ? 120 : 50);
    }
    if (name === 'phone') console.log('levels asked:', log.join(' '));
    need('40 questions in 34 steps', log.length === 34);
    need('15 listening / 16 p5 / 3 passages', log.filter(x => x[0] === 'l').length === 15 && log.filter(x => x[0] === 'p').length === 16 && log.filter(x => x[0] === 'r').length === 3);
    need('adaptive: more than one level asked', new Set(log.map(x => x.slice(1))).size > 1);
    need('result page', await count('.pt-score') === 1);
    const res = await p.evaluate(() => { const s = ToeicDebug.state(); const k = Object.keys(s.place); return k.length === 1 ? s.place[k[0]] : null; });
    need('one saved result', !!res);
    if (res) {
      need('result has L/R/S bands', res.L && res.R && res.S && res.S[0] <= res.S[1] && res.S[1] <= res.S[2]);
      need('total = L + R (±5)', Math.abs(res.L[1] + res.R[1] - res.S[1]) <= 5);
      need('counts 15/16/9', res.m.listen[1] === 15 && res.m.p5[1] === 16 && res.m.read[1] === 9);
      need('suggested level valid', [400, 600, 800, 990].includes(res.lv));
      if (name === 'phone') console.log('result:', JSON.stringify(res));
    }
    const after = await p.evaluate(() => { const s = ToeicDebug.state(); return ['p5', 'read', 'listen'].map(t => Object.keys(s.practice[t]).length); });
    need('answers recorded into practice (16/3/15 new)', after[0] - before[0] === 16 && after[1] - before[1] === 3 && after[2] - before[2] === 15);
    const nMiss = await count('.wq-list .wq');
    need('wrong list matches', res && nMiss === (40 - res.m.listen[0] - res.m.p5[0] - res.m.read[0]));
    await shot('3-result', true);
    if (nMiss) {
      await p.click('.wq >> nth=0 >> summary'); await p.waitForTimeout(80);
      need('wrong item opens with notes', await count('.wq[open] .ox') >= 3);
      await p.click('.wq[open] .tw >> nth=0'); await p.waitForTimeout(250);
      need('word pop works on result page', !(await p.evaluate(() => document.getElementById('wordPop').hidden)));
      await p.keyboard.press('Escape');
    }
    // 建議級別按鈕
    const lvBtn = await p.$('[data-act="pt-level"]');
    if (lvBtn) {
      const target = await lvBtn.getAttribute('data-lv');
      await lvBtn.click(); await p.waitForTimeout(120);
      need('level switched to suggestion', await p.evaluate(t => String(ToeicDebug.state().level) === t, target));
      need('result page still shown after switch', await count('.pt-score') === 1);
    }
    // 統計頁
    await p.click('[data-view="stats"]'); await p.waitForTimeout(150);
    need('stats estimate box', await count('.pt-est') === 1);
    need('stats estimate has total', await count('.pt-est-big') === 1);
    if (name === 'phone') console.log('stats:', (await p.textContent('.pt-est')).replace(/\s+/g, ' ').slice(0, 220));
    await p.evaluate(() => document.querySelector('.pt-est').scrollIntoView()); await shot('4-stats');
    await p.click('[data-goto="place"]'); await p.waitForTimeout(150);
    need('stats button opens intro', await count('.pt-intro') === 1 && await count('.pt-hist-row') === 1);
    await shot('5-intro-hist', true);
    await p.click('[data-act="pt-home"]'); await p.waitForTimeout(80);
    need('home card shows last result', /上次/.test(await p.textContent('.prac-place')));

    if (name === 'desk') {
      // 雲端合併：遠端多一筆結果 → 併進來；遠端 placeCleared 比較新 → 舊結果清掉
      const m1 = await p.evaluate(() => ToeicDebug.mergeRemote({ place: { '111': { t: 111, L: [100, 150, 200], R: [100, 150, 200], S: [220, 300, 380], m: {}, lv: 400 } }, placeCleared: 0 }));
      need('merge adds remote result', m1.changed && await p.evaluate(() => !!ToeicDebug.state().place['111']));
      need('merge reports local-only result', m1.placeLocalWins.length === 1);
      const m2 = await p.evaluate(() => ToeicDebug.mergeRemote({ place: {}, placeCleared: Date.now() + 1000 }));
      need('remote clear wipes results', m2.changed && await p.evaluate(() => Object.keys(ToeicDebug.state().place).length === 0));
      // 清除進度
      await p.evaluate(() => { ToeicDebug.state().place['5'] = { t: Date.now() + 5000, L: null, R: [5, 5, 5], S: null, m: {}, lv: 400 }; });
      await p.click('[data-view="settings"]'); await p.waitForTimeout(80);
      await p.click('#resetBtn'); await p.waitForTimeout(150);
      need('reset clears results', await p.evaluate(() => Object.keys(ToeicDebug.state().place).length === 0 && ToeicDebug.state().placeCleared > 0));
    }
    await ctx.close();
  }
  // ---- 沒有語音：只測閱讀 ----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    await ctx.addInitScript(noSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('nospeech: ' + e.message));
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.click('[data-view="practice"]'); await p.waitForTimeout(100);
    await p.click('.prac-place'); await p.waitForTimeout(80);
    if (!/只測閱讀/.test(await p.textContent('.pt-intro'))) errs.push('nospeech: intro warning missing');
    await p.click('[data-act="pt-start"]'); await p.waitForTimeout(300);
    let n = 0;
    while (n++ < 40) {
      const st = await p.evaluate(() => { const x = Practice._pt(); return x && x.phase === 'run' ? x.type : null; });
      if (!st) break;
      if (st === 'listen') { errs.push('nospeech: listening asked'); break; }
      if (st === 'read') for (let qi = 0; qi < 3; qi++) await p.click('.rq >> nth=' + qi + ' >> .opt >> nth=0');
      else await p.click('.opts .opt >> nth=0');
      await p.click('[data-act="pt-next"]'); await p.waitForTimeout(30);
    }
    const r = await p.evaluate(() => { const s = ToeicDebug.state(); const k = Object.keys(s.place); return k.length ? s.place[k[0]] : null; });
    if (!r || r.L !== null || r.S !== null || !r.R) errs.push('nospeech: result should be reading only ' + JSON.stringify(r));
    await p.screenshot({ path: SHOTS + 'pt-nospeech-result.png', fullPage: true });
    await ctx.close();
  }
  await b.close();
  console.log('errs', errs);
})();
