// 測單字填空作答後的句子：英文在上、中文在下；點英文或中文都唸英文；逐字標示（有 boundary 事件／沒有時用估的）；錯題分析裡也一樣。
// 用法：node test_kara.js
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const SHOTS = '/home/claude/work/shots/';
// withBoundary = true：每 60ms 送一個 word boundary；false：只送 start／end（網站要自己估時間）
const fakeSpeech = (withBoundary) => {
  window.__spoken = [];
  let tok = 0;
  const fake = { speaking: false, pending: false, getVoices() { return []; },
    cancel() { tok++; this.speaking = false; },
    speak(u) {
      const my = ++tok; window.__spoken.push(u.text); this.speaking = true;
      const fire = (type, extra) => { if (my !== tok) return; const e = new Event(type); Object.assign(e, extra || {}); u.dispatchEvent(e); };
      setTimeout(() => fire('start'), 5);
      const words = []; const re = /\S+/g; let m; while ((m = re.exec(u.text))) words.push(m.index);
      if (withBoundary) words.forEach((c, i) => setTimeout(() => fire('boundary', { name: 'word', charIndex: c }), 10 + i * 60));
      const total = withBoundary ? 10 + words.length * 60 + 40 : u.text.length * 45 / (u.rate || 1) + 300;
      setTimeout(() => { if (my === tok) { this.speaking = false; fire('end'); } }, total);
    } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, w, h, bd] of [['phone', 390, 844, true], ['small', 320, 640, false], ['desk', 1280, 900, true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: name === 'phone' ? 2 : 1, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech, bd);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    const need = (what, cond) => { if (!cond) errs.push(name + ': ' + what); };
    const overflow = async n => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o); };
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.evaluate(() => { const s = ToeicDebug.state(); s.settings.practiceScope = 'all'; });
    await p.click('.tab[data-level="400"]'); await p.click('[data-view="practice"]'); await p.waitForTimeout(150);
    await p.click('[data-start="p5"]'); await p.waitForTimeout(500);
    // 第一題故意答錯（之後看錯題分析）
    let it = null;
    for (let k = 0; k < 8; k++) {             // 一直選第一個選項，直到答錯一題（之後看錯題分析要有錯題）
      it = await p.evaluate(() => { const q = document.querySelector('.prac-q'); return { ex: q.getAttribute('data-ex'), zh: q.getAttribute('data-zh') }; });
      await p.click('.opts .opt >> nth=0'); await p.waitForTimeout(200);
      if (await p.$('.fb.is-no')) break;
      await p.click('.prac-next'); await p.waitForTimeout(200);
    }
    need('sentence block', await p.$$eval('.fb .fb-sent', e => e.length) === 1);
    need('old button gone', await p.$$eval('.fb-say', e => e.length) === 0);
    const blk = await p.$eval('.fb-sent', e => ({ en: e.querySelector('.fb-en').textContent, zh: e.querySelector('.fb-zh').textContent, enTop: e.querySelector('.fb-en').getBoundingClientRect().top, zhTop: e.querySelector('.fb-zh').getBoundingClientRect().top, n: e.querySelectorAll('.kw').length, ans: [...e.querySelectorAll('.kw-ans')].map(x => x.textContent).join(' ') }));
    need('english text = full sentence', blk.en === it.ex);
    need('chinese shown', blk.zh === it.zh);
    need('english above chinese', blk.enTop < blk.zhTop);
    need('one span per word', blk.n === it.ex.split(/\s+/).length);
    need('answer word bold: ' + blk.ans, blk.ans.length > 0 && it.ex.includes(blk.ans.replace(/[.,]$/, '')));
    await overflow('fb');
    // 點中文 → 唸英文、逐字標示
    const n0 = await p.evaluate(() => window.__spoken.length);
    await p.click('.fb-sent .fb-zh'); 
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      await p.waitForTimeout(bd ? 30 : 120);
      const cur = await p.evaluate(() => { const all = [...document.querySelectorAll('.fb-sent .kw')]; const now = document.querySelectorAll('.fb-sent .kw.is-now'); return now.length > 1 ? -9 : all.indexOf(now[0]); });
      if (cur === -9) errs.push(name + ': more than one word highlighted');
      if (cur >= 0) seen.add(cur);
      if (seen.size === 3) { await p.$eval('.fb', e => e.scrollIntoView({ block: 'center' })); await p.screenshot({ path: SHOTS + 'kara-' + name + '.png' }); }
      if (!(await p.evaluate(() => speechSynthesis.speaking)) && i > 3) break;
    }
    need('spoke the english sentence', await p.evaluate(([n, ex]) => window.__spoken.length === n + 1 && window.__spoken[n] === ex, [n0, it.ex]));
    need('highlight moved through words (' + seen.size + '/' + blk.n + ', ' + (bd ? 'boundary' : 'estimate') + ')', seen.size >= Math.min(4, blk.n - 1));
    const order = [...seen]; need('highlight goes forward', order.every((v, i) => i === 0 || v > order[i - 1]));
    await p.waitForTimeout(bd ? 300 : 1500);
    need('highlight cleared at end', await p.$$eval('.kw.is-now', e => e.length) === 0);
    // 點英文也會唸；唸到一半按下一題要停掉
    await p.click('.fb-sent .fb-en'); await p.waitForTimeout(bd ? 150 : 400);
    need('click english speaks', await p.evaluate(n => window.__spoken.length === n + 2, n0));
    need('highlight on while speaking', await p.$$eval('.kw.is-now', e => e.length) === 1);
    await p.click('.prac-next'); await p.waitForTimeout(200);
    need('next question stops highlight', await p.$$eval('.kw.is-now', e => e.length) === 0);
    // 題目上的字仍然可以點查
    await p.click('.prac-q .tw >> nth=0'); await p.waitForTimeout(300);
    need('tap-lookup still works', !(await p.evaluate(() => document.getElementById('wordPop').hidden)));
    await p.keyboard.press('Escape');
    // 錯題分析
    await p.evaluate(() => Practice.openWrong()); await p.waitForTimeout(300);
    await p.click('.wq >> nth=0 >> summary'); await p.waitForTimeout(120);
    need('wrong item has sentence block', await p.$$eval('.wq[open] .fb-sent .kw', e => e.length) > 2);
    await p.click('.wq[open] .fb-sent'); await p.waitForTimeout(bd ? 150 : 400);
    need('wrong item highlight', await p.$$eval('.wq[open] .kw.is-now', e => e.length) === 1);
    await overflow('wrong');
    if (name === 'phone') await p.screenshot({ path: SHOTS + 'kara-phone-wrong.png' });
    await ctx.close();
  }
  await b.close();
  console.log('errs', errs);
})();
