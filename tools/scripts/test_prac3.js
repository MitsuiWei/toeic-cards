// 用真正的題庫跑一遍「練習」分頁：手機、iPad、桌機各一次，截圖並檢查有沒有橫向溢出或錯誤。
// 用法：node test_prac3.js [level]   （預設 600）
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const SHOTS = '/home/claude/work/shots/';
const LV = process.argv[2] || '600';
const fakeSpeech = () => {
  window.__spoken = [];
  const fake = { speaking: false, pending: false, cancel() {}, getVoices() { return []; },
    speak(u) { window.__spoken.push(u.text); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 5); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const sizes = [['phone', 390, 844, 2], ['ipad', 820, 1180, 2], ['desk', 1280, 900, 1]];
  for (const [name, w, h, dsf] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
    const shot = async (n, full) => { await p.screenshot({ path: SHOTS + 'r-' + name + '-' + n + '.png', fullPage: !!full }); const o = await overflow(p); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o + 'px'); };
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.click('.tab[data-level="' + LV + '"]'); await p.waitForTimeout(100);
    await p.click('[data-view="practice"]'); await p.waitForTimeout(200);
    await shot('0-home');
    console.log(name, 'home:', await p.$$eval('.prac-mode-stat', e => e.map(x => x.textContent)));

    // ---- 單字填空：一回 10 題，第 1、4 題故意答錯
    await p.click('[data-scope="all"]'); await p.waitForTimeout(80);
    await p.click('[data-start="p5"]'); await p.waitForTimeout(300);
    await shot('1-p5-q');
    const total = await p.evaluate(() => { const m = document.querySelector('.prac-top').textContent.match(/\/\s*(\d+)/); return m ? +m[1] : 10; });
    for (let i = 0; i < total; i++) {
      const a = await p.evaluate(() => { const q = document.querySelector('.prac-q').textContent; const it = window.QUIZ_P5.find(x => q.indexOf(x.q.split('-------')[0].trim()) === 0 && q.indexOf(x.q.split('-------')[1].trim()) >= 0); return it ? it.a : -1; });
      if (a < 0) { errs.push(name + ' p5: cannot match question ' + i); break; }
      const wrong = i === 0 || i === 3;
      await p.click('.opt >> nth=' + (wrong ? (a + 1) % 4 : a)); await p.waitForTimeout(100);
      if (i === 0) await shot('2-p5-wrong', true);
      if (i === 1) await shot('3-p5-right', true);
      await p.click('[data-act="next"]'); await p.waitForTimeout(100);
    }
    await shot('4-p5-done', true);
    console.log(name, 'p5 done:', (await p.textContent('.prac-done')).replace(/\s+/g, ' ').slice(0, 70));
    await p.click('[data-act="quit"]'); await p.waitForTimeout(100);

    // ---- 聽力：答 3 題就離開
    await p.click('[data-start="listen"]'); await p.waitForTimeout(700);
    await shot('5-listen-q');
    for (let i = 0; i < 3; i++) {
      await p.click('.opts-abc .opt >> nth=' + (i % 3)); await p.waitForTimeout(150);
      if (i === 0) await shot('6-listen-a', true);
      await p.click('[data-act="next"]'); await p.waitForTimeout(600);
    }
    await p.click('[data-act="quit"]'); await p.waitForTimeout(100);

    // ---- 閱讀：做 3 篇（會遇到 Part 7 和 Part 6）
    await p.click('[data-start="read"]'); await p.waitForTimeout(300);
    const seen = {};
    for (let k = 0; k < 3; k++) {
      const part = await p.evaluate(() => /-------|\(\d\)/.test(document.querySelector('.passage').textContent) ? 6 : 7);
      if (!seen[part]) { seen[part] = 1; await shot('7-read-p' + part + '-q', true); }
      for (let qi = 0; qi < 3; qi++) { await p.click('.rq >> nth=' + qi + ' >> .opt >> nth=' + ((qi + k) % 4)); await p.waitForTimeout(100); }
      if (seen[part] === 1) { seen[part] = 2; await shot('8-read-p' + part + '-a', true); }
      await p.click('[data-act="next"]'); await p.waitForTimeout(200);
    }
    console.log(name, 'read parts seen:', Object.keys(seen).join(','));
    await p.click('[data-act="quit"]'); await p.waitForTimeout(100);
    await shot('9-home-after');
    await p.click('[data-view="stats"]'); await p.waitForTimeout(150);
    await p.evaluate(() => { const e = document.getElementById('pracStats'); e && e.scrollIntoView(); }); await p.waitForTimeout(80);
    await shot('10-stats');
    console.log(name, 'stats:', (await p.textContent('#pracStats')).replace(/\s+/g, ' ').slice(0, 160));
    await ctx.close();
  }
  console.log('errs', errs);
  await b.close();
})();
