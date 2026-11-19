// 測單字卡提示行：自然發音、字根字首（翻面前不顯示）、沒有資料退回 KK、點一下臨時切換、看中文想英文、單字庫維持 KK。
// 用法：node test_aids.js
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const SHOTS = '/home/claude/work/shots/';
const fakeSpeech = () => {
  const fake = { speaking: false, pending: false, cancel() {}, getVoices() { return []; }, speak(u) { setTimeout(() => { u.onend && u.onend(); }, 3); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, w, h] of [['phone', 390, 844], ['small', 320, 640], ['desk', 1280, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: name === 'phone' ? 2 : 1, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    const need = (what, cond) => { if (!cond) errs.push(name + ': ' + what); };
    const shot = async n => { await p.screenshot({ path: SHOTS + 'aid-' + name + '-' + n + '.png' }); const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o); };
    const setAid = async v => { await p.click('[data-view="settings"]'); await p.selectOption('select[name="phonetic"]', v); await p.click('[data-view="study"]'); await p.waitForTimeout(250); };
    const cardWord = () => p.evaluate(() => document.querySelector('#cardFront .word') ? document.querySelector('#cardFront .word').textContent.trim() : '');
    await p.goto(SITE); await p.waitForTimeout(300);
    // 挑一個 400 級、有字根拆解的字，用 pri 排到新字第一個
    const pickRes = await p.evaluate(() => new Promise(res => {
      const sc = document.createElement('script'); sc.src = 'data/aids.js';
      sc.onload = () => {
        const A = window.TOEIC_AIDS, W = window.WORDS.filter(w => w.lv === 400);
        const withR = W.find(w => A[w.id] && A[w.id].r && A[w.id].r.p.length >= 2);
        const s = ToeicDebug.state(); s.recs[withR.id] = Object.assign({}, s.recs[withR.id] || {}, { st: 'new', pri: 1 });
        res({ id: withR.id, w: withR.w, kk: withR.kk, ip: withR.ip, a: A[withR.id] });
      };
      document.head.appendChild(sc);
    }));
    await p.click('.tab[data-level="600"]'); await p.click('.tab[data-level="400"]'); await p.waitForTimeout(150);
    need('first card is the picked word ' + pickRes.w, (await cardWord()).startsWith(pickRes.w));
    const KK = typeof pickRes.kk === 'string' ? pickRes.kk : pickRes.kk[0][1];
    const IP = typeof pickRes.ip === 'string' ? pickRes.ip : pickRes.ip[0][1];
    need('default shows KK', await p.$eval('.aid-line', (e, kk) => e.textContent.includes(kk), KK));
    if (name === 'phone') await shot('0-kk');
    // 自然發音
    await setAid('phonics');
    need('phonics line', await p.$$eval('.aid-line.is-rich .aid-syl', e => e.length) === 1);
    need('syllables + stress', await p.$eval('.aid-syl', (e, ph) => e.textContent === ph.s && e.querySelector('b').textContent === ph.s.split(/[·-]/)[ph.st], pickRes.a.p));
    need('phonics rule shown', await p.$eval('.aid-rule', (e, n) => e.textContent === n, pickRes.a.p.n));
    await shot('1-phonics');
    // 字根字首：翻面前是 KK
    await setAid('roots');
    need('roots hidden before reveal', await p.$$eval('.aid-parts', e => e.length) === 0);
    need('roots note before reveal', await p.$eval('.aid-line', (e, kk) => /翻面後看字根字首/.test(e.textContent) && e.textContent.includes(kk), KK));
    await shot('2-roots-front');
    await p.click('#revealBtn'); await p.waitForTimeout(150);
    need('roots after reveal', await p.$$eval('.aid-parts .aid-part', e => e.length) === pickRes.a.r.p.length);
    need('roots m line', await p.$eval('.aid-rule', (e, m) => e.textContent === m, pickRes.a.r.m));
    await shot('3-roots-back');
    // 點提示行臨時切換：roots → kk
    await p.click('.aid-line'); await p.waitForTimeout(120);
    need('cycle to kk', await p.$eval('.aid-line', e => e.getAttribute('data-aid') === 'kk'));
    need('setting unchanged after cycle', await p.evaluate(() => ToeicDebug.state().settings.phonetic === 'roots'));
    await p.click('.aid-line'); await p.waitForTimeout(80);
    need('cycle to ipa', await p.$eval('.aid-line', (e, ip) => e.getAttribute('data-aid') === 'ipa' && e.textContent.includes(ip), IP));
    // 評分後恢復設定
    await p.keyboard.press('3'); await p.waitForTimeout(200);
    const second = await cardWord();
    need('next card uses setting again', await p.$eval('.aid-line', e => e.getAttribute('data-aid') === 'roots'));
    // 沒有拆解的字（receipt 有自然發音、沒有字根；其他字兩個都沒有）
    await p.evaluate(() => { const s = ToeicDebug.state(); s.settings.phonetic = 'phonics'; });
    // 沒有字根拆解的字：翻面後仍是 KK＋小字
    const noR = await p.evaluate(() => { const A = window.TOEIC_AIDS; const w = window.WORDS.find(w => w.lv === 400 && A[w.id] && !A[w.id].r && ToeicDebug.state().recs[w.id] === undefined); const s = ToeicDebug.state(); s.recs[w.id] = { st: 'new', step: 0, iv: 0, ef: 2.5, due: 0, reps: 0, lapses: 0, last: 0, pri: 0.5 }; s.settings.phonetic = 'roots'; return w.w; });
    await p.click('.tab[data-level="600"]'); await p.click('.tab[data-level="400"]'); await p.waitForTimeout(150);
    if ((await cardWord()).startsWith(noR)) {
      await p.click('#revealBtn'); await p.waitForTimeout(120);
      need('no-roots word falls back to KK with note', await p.$eval('.aid-line', e => !e.classList.contains('is-rich') && /沒有可靠的字根拆法/.test(e.textContent)));
      if (name === 'phone') await shot('5-noroots');
    } else need('no-roots word first', false);
    need('second card exists', !!second);
    // 單字庫維持 KK
    await p.click('[data-view="settings"]'); await p.selectOption('select[name="phonetic"]', 'phonics');
    await p.click('[data-view="browse"]'); await p.waitForTimeout(150);
    need('browse shows KK in phonics mode', await p.$eval('.wl-main .phon', e => /\[/.test(e.textContent)));
    // 看中文想英文：字根在背面
    await p.click('[data-view="settings"]'); await p.selectOption('select[name="direction"]', 'zh'); await p.selectOption('select[name="phonetic"]', 'roots');
    await p.click('[data-view="study"]'); await p.waitForTimeout(200);
    need('zh direction: no aid on front', await p.$$eval('#cardFront .aid-line', e => e.length) === 0);
    await p.click('#revealBtn'); await p.waitForTimeout(150);
    const backAid = await p.$eval('#cardBack .aid-line', e => e.getAttribute('data-aid')).catch(() => null);
    need('zh direction: aid on back', backAid === 'roots');
    if (name === 'phone') await shot('4-zh-back');
    await ctx.close();
  }
  // 沒有資料的字：退回 KK 加小字
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('nodata: ' + e.message));
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.click('.tab[data-level="600"]'); await p.waitForTimeout(100);
    await p.click('[data-view="settings"]'); await p.selectOption('select[name="phonetic"]', 'phonics'); await p.click('[data-view="study"]'); await p.waitForTimeout(300);
    const t = await p.$eval('.aid-line', e => ({ aid: e.getAttribute('data-aid'), txt: e.textContent, rich: e.classList.contains('is-rich') }));
    const hasData = await p.evaluate(() => { const w = document.querySelector('#cardFront .word').textContent.trim(); const W = window.WORDS.find(x => x.w === w); return !!(window.TOEIC_AIDS && window.TOEIC_AIDS[W.id]); });
    if (!hasData && !(t.aid === 'phonics' && !t.rich && /沒有自然發音拆解/.test(t.txt) && /\[/.test(t.txt))) errs.push('nodata: fallback wrong ' + JSON.stringify(t));
    if (hasData && !t.rich) errs.push('nodata: has data but not rich');
    await ctx.close();
  }
  await b.close();
  console.log('errs', errs);
})();
