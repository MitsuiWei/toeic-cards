// 測單字卡例句的點字查意思：其他的字可以點（跳出小卡、唸那個字）、這張卡自己的字不能查（點了只唸）、
// 喇叭唸整句、翻面會收起小卡、可以把查到的字存起來、挖空模式也能點。
// 用法：node test_extap.js
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const SHOTS = '/home/claude/work/shots/';
const fakeSpeech = () => {
  window.__spoken = []; let tok = 0;
  const fake = { speaking: false, pending: false, getVoices() { return []; }, cancel() { tok++; this.speaking = false; },
    speak(u) { const my = ++tok; window.__spoken.push(u.text); this.speaking = true;
      setTimeout(() => { if (my === tok) u.dispatchEvent(new Event('start')); }, 5);
      setTimeout(() => { if (my === tok) { this.speaking = false; u.dispatchEvent(new Event('end')); } }, 200); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [name, w, h] of [['phone', 390, 844], ['small', 320, 640], ['desk', 1280, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: name === 'desk' ? 1 : 2, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    const need = (what, cond) => { if (!cond) errs.push(name + ': ' + what); };
    const overflow = async n => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o); };
    const clear = () => p.evaluate(() => { window.__spoken = []; });
    const spoken = () => p.evaluate(() => window.__spoken.slice());
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.evaluate(() => { const s = ToeicDebug.state(); s.settings.speakOnShow = 'no'; s.settings.autoSpeak = 'none'; });
    await p.click('.tab[data-level="400"]'); await p.waitForTimeout(200);
    const info = await p.evaluate(() => { const ex = document.querySelector('#card .example'); return ex ? { tw: ex.querySelectorAll('.tw').length, mark: ex.querySelector('mark') ? ex.querySelector('mark').textContent : '', markTw: !!ex.querySelector('mark .tw'),
      say: !!ex.querySelector('.ex-say'), ex: ex.getAttribute('data-ex'), word: document.querySelector('#card .word').textContent.trim(), tag: ex.tagName } : null; });
    need('例句有可點的字 ' + JSON.stringify(info), info && info.tw >= 3 && info.say && info.tag === 'DIV' && info.ex);
    need('這張卡的字不是可查的字', info && info.mark && !info.markTw);
    await overflow('card');
    // 點例句裡的第一個可查的字：跳出小卡、唸那個字
    await clear();
    const first = p.locator('#card .example .tw').first(); const firstText = (await first.innerText()).trim();
    await first.click(); await p.waitForTimeout(700);
    need('跳出小卡', await p.evaluate(() => { const x = document.getElementById('wordPop'); return x && !x.hidden && x.textContent.length > 3; }));
    need('點的字有標示', await p.evaluate(() => !!document.querySelector('#card .example .tw.is-picked')));
    let s = await spoken(); need('唸了點的那個字 ' + JSON.stringify(s), s.length === 1 && s[0].toLowerCase() === firstText.toLowerCase());
    if (name === 'phone') await p.screenshot({ path: SHOTS + 'extap-phone-1.png' });
    if (name === 'desk') await p.screenshot({ path: SHOTS + 'extap-desk-1.png' });
    await overflow('pop');
    // 點這張卡自己的字：只唸，不跳小卡（先關掉）
    await p.click('#wordPop [data-wp="close"]'); await p.waitForTimeout(100);
    await clear(); await p.click('#card .example mark'); await p.waitForTimeout(350);
    s = await spoken(); need('點卡片的字只唸那個字 ' + JSON.stringify(s), s.length === 1 && s[0] === info.word);
    need('點卡片的字不跳小卡', await p.evaluate(() => document.getElementById('wordPop').hidden));
    // 喇叭：唸整句，例句有正在唸的樣子
    await clear(); await p.click('#card .example .ex-say'); await p.waitForTimeout(120);
    s = await spoken(); need('喇叭唸整句', s.length === 1 && s[0] === info.ex);
    need('例句有正在唸的樣子', await p.evaluate(() => document.querySelector('#card .example').classList.contains('is-speaking')));
    await p.waitForTimeout(300);
    // 找一個字表以外、小字典有的字存起來（例句當它的例句）
    const pick = await p.evaluate(() => { const list = {}; ToeicDebug.state(); const tws = Array.from(document.querySelectorAll('#card .example .tw')); return tws.map(x => x.textContent); });
    let saved = false;
    for (let i = 0; i < pick.length && !saved; i++) {
      await p.locator('#card .example .tw').nth(i).click(); await p.waitForTimeout(350);
      const btn = p.locator('#wordPop [data-wp="save"]');
      if (await btn.count()) { await btn.click(); await p.waitForTimeout(200); saved = true;
        need('存起來後小卡顯示已存', /已存/.test(await p.locator('#wordPop').innerText())); }
    }
    need('有字可以存', saved);
    // 翻面：小卡收起來，例句還是可以點
    await p.click('#revealBtn'); await p.waitForTimeout(200);
    need('翻面後小卡收起來', await p.evaluate(() => document.getElementById('wordPop').hidden));
    need('翻面後例句還在、可以點', await p.evaluate(() => document.querySelectorAll('#card .example .tw').length >= 3));
    if (name === 'phone') { await p.locator('#card .example .tw').nth(1).click(); await p.waitForTimeout(400); await p.screenshot({ path: SHOTS + 'extap-phone-2.png' }); await p.click('#wordPop [data-wp="close"]'); }
    // 評分換下一張：正常
    await p.click('.rate[data-rating="3"]'); await p.waitForTimeout(250);
    need('下一張卡例句也可以點', await p.evaluate(() => { const ex = document.querySelector('#card .example'); return !ex || ex.querySelectorAll('.tw').length >= 2; }));
    // 挖空模式：空格在，其他字可以點
    await p.evaluate(() => { ToeicDebug.state().settings.frontExample = 'cloze'; });
    await p.click('[data-view="browse"]'); await p.click('[data-view="study"]'); await p.waitForTimeout(200);
    need('挖空模式', await p.evaluate(() => { const ex = document.querySelector('#card .example'); return !ex || (!!ex.querySelector('.cloze') && !ex.querySelector('mark') && ex.querySelectorAll('.tw').length >= 2); }));
    // 鍵盤 S 唸例句（桌機）
    if (name === 'desk') { await clear(); await p.keyboard.press('s'); await p.waitForTimeout(150); s = await spoken(); need('S 唸例句', s.length === 1 && s[0].split(' ').length > 3); }
    await ctx.close();
  }
  await b.close();
  console.log('errs', JSON.stringify(errs, null, 1));
})();
