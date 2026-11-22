// 測單字填空裡的文法題：每回 10 題固定 2 題文法題（不受「只出學過的字」限制）、標籤、解析、沒有單字列、錯題分析的文法分類、統計。
// 用法：node test_gram.js [級別，預設 400]
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const SHOTS = '/home/claude/work/shots/';
const LV = process.argv[2] || '400';
const fakeSpeech = () => {
  const fake = { speaking: false, pending: false, cancel() {}, getVoices() { return []; }, speak(u) { setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 3); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, w, h, scope] of [['phone', 390, 844, 'all'], ['small', 320, 640, 'learned'], ['desk', 1280, 900, 'all']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: name === 'phone' ? 2 : 1, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    const need = (what, cond) => { if (!cond) errs.push(name + ': ' + what); };
    const overflow = async n => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o); };
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.evaluate(s => { ToeicDebug.state().settings.practiceScope = s; }, scope);
    await p.click('.tab[data-level="' + LV + '"]'); await p.click('[data-view="practice"]'); await p.waitForTimeout(150);
    need('home shows 300 questions', /共 300 題/.test(await p.textContent('[data-start="p5"]')));
    let gramSeen = 0, shot = false, total = 0, gramWrong = 0;
    for (let round = 0; round < 2; round++) {
      await p.click(round === 0 ? '[data-start="p5"]' : '[data-act="again"], [data-start="p5"]'); await p.waitForTimeout(500);
      let g = 0, n = 0;
      for (let i = 0; i < 12; i++) {
        const tag = await p.$eval('.prac-tag', e => e.textContent).catch(() => null);
        if (!tag) break;
        n++;
        const isG = /^文法題・/.test(tag);
        const info = await p.evaluate(() => { const q = document.querySelector('.prac-q'); const ex = q.getAttribute('data-ex'), txt = q.textContent; const opts = [...document.querySelectorAll('.opts .opt .opt-t')].map(e => e.textContent); let a = -1; opts.forEach((o, i) => { if (ex === txt.replace(/\s*$/, '') ) a = a; }); return { ex, opts, n: opts.length }; });
        need('4 options', info.n === 4);
        // 文法題故意選第一個選項（多半會錯），單字題也選第一個
        await p.click('.opts .opt >> nth=0'); await p.waitForTimeout(150);
        const wrong = await p.$$eval('.fb.is-no', e => e.length) === 1;
        if (isG) {
          g++;
          need('grammar: no word line', await p.$$eval('.fb .fb-wordline', e => e.length) === 0);
          need('grammar: notes on 4 options', await p.$$eval('.opts .ox', e => e.length) === 4);
          need('grammar: key shown', await p.$$eval('.fb .fb-key', e => e.length) === 1);
          need('grammar: sentence block', await p.$$eval('.fb .fb-sent .kw', e => e.length) > 3);
          need('grammar: no send-back note', await p.$$eval('.fb .fb-note', e => e.length) === 0);
          if (wrong) gramWrong++;
          if (!shot && wrong) { shot = true; await overflow('gram'); await p.screenshot({ path: SHOTS + 'gram-' + name + '.png', fullPage: true }); }
        } else {
          need('word question keeps word line', await p.$$eval('.fb .fb-wordline', e => e.length) === 1);
        }
        await p.click('.prac-next'); await p.waitForTimeout(150);
      }
      total += n; gramSeen += g;
      need('round ' + round + ': 10 questions (' + n + ')', n === 10);
      need('round ' + round + ': exactly 2 grammar (' + g + ', scope ' + scope + ')', g === 2);
      await p.click('[data-view="practice"]'); await p.waitForTimeout(100);
      const home = await p.$('[data-act="home"]'); if (home) { await home.click(); await p.waitForTimeout(100); }
    }
    // 沒有重複出同一題文法題：做過的 4 題都記到了
    const rec = await p.evaluate(() => Object.keys(ToeicDebug.state().practice.p5).filter(k => k[0] === 'g'));
    need('3–4 distinct grammar questions recorded (' + rec.length + ')', rec.length === 3 || rec.length === 4);   // 第二回會先帶 1 題上一回答錯的文法題
    need('no word sent back for grammar', await p.evaluate(() => { const s = ToeicDebug.state(); return Object.keys(s.recs).every(k => !/^g/.test(k)); }));
    // 錯題分析
    if (gramWrong) {
      await p.evaluate(() => Practice.openWrong()); await p.waitForTimeout(300);
      const cats = await p.$$eval('.wa-row .wa-name', e => e.map(x => x.textContent));
      need('wrong analysis has grammar category: ' + cats.join('|'), cats.some(c => /^文法題：/.test(c)));
      await overflow('wrong');
      if (name === 'phone') await p.screenshot({ path: SHOTS + 'gram-phone-wrong.png', fullPage: true });
    }
    // 統計頁估分不會壞
    await p.click('[data-view="stats"]'); await p.waitForTimeout(150);
    need('stats ok', await p.$$eval('.pt-est', e => e.length) === 1);
    await ctx.close();
  }
  await b.close();
  console.log('errs', errs);
})();
