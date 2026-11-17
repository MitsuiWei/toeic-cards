// 測「各選項解析」：作答後每個選項底下有解析、回饋框有解題關鍵；設定改成「先收起來」時要按「看解析」才展開；錯題分析裡也有。
// 用法：node test_notes.js [level]   （預設 400；該級要已經有解析資料）
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const SHOTS = '/home/claude/work/shots/';
const LV = process.argv[2] || '400';
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
  for (const [name, w, h, dsf] of [['phone', 390, 844, 2], ['small', 320, 640, 1], ['ipad', 820, 1180, 2], ['desk', 1280, 900, 1]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
    const shot = async (n, full) => { await p.screenshot({ path: SHOTS + 'n-' + name + '-' + n + '.png', fullPage: !!full }); const o = await overflow(p); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o + 'px'); };
    const count = sel => p.$$eval(sel, e => e.length);
    const need = async (what, cond) => { if (!cond) errs.push(name + ': ' + what); };
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.click('.tab[data-level="' + LV + '"]'); await p.click('[data-view="practice"]'); await p.waitForTimeout(150);
    await p.click('[data-scope="all"]'); await p.waitForTimeout(60);

    // ---- 單字填空：預設直接顯示 ----
    await p.click('[data-start="p5"]'); await p.waitForTimeout(400);
    await need('p5: notes shown before answering', await count('.ox') === 0);
    const a = await p.evaluate(() => { const q = document.querySelector('.prac-q').textContent; const it = window.QUIZ_P5.find(x => q.indexOf(x.q.split('-------')[0].trim()) === 0 && q.indexOf(x.q.split('-------')[1].trim()) >= 0); return it.a; });
    await p.click('.opt >> nth=' + ((a + 1) % 4)); await p.waitForTimeout(120);          // 故意答錯
    await need('p5: 4 option notes', await count('.opts .ox') === 4);
    await need('p5: key line', await count('.fb .fb-key') === 1);
    await need('p5: 你選的 tag', await count('.opt.is-wrong .opt-mine') === 1);
    await need('p5: old ex still shown', await count('.fb .fb-ex') === 0);
    if (name === 'phone') console.log('p5:', (await p.textContent('.fb-key')).trim(), '||', await p.$$eval('.opts .opt', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
    await p.evaluate(() => document.querySelector('.prac-q').scrollIntoView()); await p.waitForTimeout(60);
    await shot('1-p5', true);
    // 選項裡的字仍然可以點
    await p.click('.opts .opt .tw >> nth=0'); await p.waitForTimeout(250);
    await need('p5: word pop after tapping option word', !(await p.evaluate(() => document.getElementById('wordPop').hidden)));
    await p.keyboard.press('Escape');
    await p.click('[data-act="quit"]'); await p.waitForTimeout(80);

    // ---- 聽力 ----
    await p.click('[data-start="listen"]'); await p.waitForTimeout(500);
    await p.click('.opts-abc .opt >> nth=0'); await p.waitForTimeout(150);
    await need('listen: 3 option notes', await count('.opts .ox') === 3);
    await need('listen: key line', await count('.fb .fb-key') === 1);
    if (name === 'phone') console.log('listen:', (await p.textContent('.fb-key')).trim(), '||', await p.$$eval('.opts .ox', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
    await shot('2-listen', true);
    await p.click('[data-act="quit"]'); await p.waitForTimeout(80);

    // ---- 閱讀 ----
    await p.click('[data-start="read"]'); await p.waitForTimeout(300);
    for (let qi = 0; qi < 3; qi++) { await p.click('.rq >> nth=' + qi + ' >> .opt >> nth=' + (qi % 4)); await p.waitForTimeout(80); }
    await need('read: 12 option notes', await count('.rq .ox') === 12);
    await need('read: 3 key lines', await count('.rq .fb-key') === 3);
    if (name === 'phone') console.log('read:', await p.$$eval('.rq .fb-key', e => e.map(x => x.textContent.trim())), '||', await p.$$eval('.rq >> nth=0 >> .ox', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
    await p.evaluate(() => document.querySelector('.rq').scrollIntoView()); await p.waitForTimeout(60);
    await shot('3-read', true);
    await p.click('.prac-home'); await p.waitForTimeout(100);

    // ---- 錯題分析：點開的題目有解析 ----
    await p.click('[data-act="wrong"]'); await p.waitForTimeout(300);
    await p.click('.wq >> nth=0 >> summary'); await p.waitForTimeout(80);
    await need('wrong list: notes in opened item', await count('.wq[open] .ox') >= 3);
    await need('wrong list: key in opened item', await count('.wq[open] .fb-key') === 1);
    await shot('4-wrong', true);
    await p.click('[data-act="wrong-home"]'); await p.waitForTimeout(80);

    // ---- 設定改成「先收起來」 ----
    await p.click('[data-view="settings"]'); await p.waitForTimeout(100);
    await p.selectOption('select[name="explain"]', 'fold'); await p.waitForTimeout(100);
    await need('setting saved', await p.evaluate(() => ToeicDebug.state().settings.explain === 'fold'));
    if (name === 'phone') { await p.evaluate(() => document.querySelector('select[name="explain"]').scrollIntoView({ block: 'center' })); await shot('5-setting'); }
    await p.click('[data-view="practice"]'); await p.waitForTimeout(100);
    await p.click('[data-start="p5"]'); await p.waitForTimeout(400);
    await p.click('.opt >> nth=0'); await p.waitForTimeout(120);
    await need('fold: notes hidden', await count('.opts .ox') === 0);
    await need('fold: no key', await count('.fb .fb-key') === 0);
    await need('fold: 看解析 button', await count('.fb [data-act="xp"]') === 1);
    await shot('6-fold');
    await p.click('.fb [data-act="xp"]'); await p.waitForTimeout(100);
    await need('fold→open: 4 notes', await count('.opts .ox') === 4);
    await need('fold→open: key', await count('.fb .fb-key') === 1);
    await p.click('[data-act="next"]'); await p.waitForTimeout(120);
    await p.click('.opt >> nth=0'); await p.waitForTimeout(120);
    await need('fold: next question folded again', await count('.opts .ox') === 0);
    await p.click('[data-act="quit"]'); await p.waitForTimeout(80);
    await p.click('[data-start="read"]'); await p.waitForTimeout(300);
    await p.click('.rq >> nth=1 >> .opt >> nth=0'); await p.waitForTimeout(80);
    await need('fold read: hidden', await count('.rq .ox') === 0);
    await p.click('.rq >> nth=1 >> [data-act="xp"]'); await p.waitForTimeout(80);
    await need('fold read: opened only that question', await count('.rq >> nth=1 >> .ox') === 4 && await count('.rq .ox') === 4);
    await p.click('[data-act="quit"]'); await p.waitForTimeout(60);
    await p.click('[data-start="listen"]'); await p.waitForTimeout(500);
    await p.click('.opts-abc .opt >> nth=1'); await p.waitForTimeout(150);
    await need('fold listen: hidden', await count('.opts .ox') === 0);
    await p.click('.fb [data-act="xp"]'); await p.waitForTimeout(80);
    await need('fold listen: opened', await count('.opts .ox') === 3);
    await ctx.close();
  }
  console.log('errs', errs);
  await b.close();
})();
