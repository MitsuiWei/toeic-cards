// 測「點一下存單字」：字表內的字排到最前面、字表外的字進「自選」、取消、單字卡、單字庫移除、同步合併、各尺寸不溢出。
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
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, w, h, dsf] of [['phone', 390, 844, 2], ['small', 320, 640, 1], ['ipad', 820, 1180, 2], ['desk', 1280, 900, 1]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
    const shot = async (n, full) => { await p.screenshot({ path: SHOTS + 't-' + name + '-' + n + '.png', fullPage: !!full }); const o = await overflow(p); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o + 'px'); };
    const pop = async () => (await p.evaluate(() => { const e = document.getElementById('wordPop'); return e.hidden ? '(hidden)' : e.textContent.replace(/\s+/g, ' ').trim(); }));
    const tap = async (word, scope) => { const loc = p.locator((scope || '#pracRoot') + ' .tw', { hasText: new RegExp('^' + word + '$') }).first(); await loc.click(); await p.waitForTimeout(250); return pop(); };
    await p.goto(SITE); await p.waitForTimeout(300);
    console.log(name, 'tabs:', await p.$$eval('.tab', e => e.map(x => x.textContent.replace(/\s+/g, '')).join(' | ')), '| tab widths ok:', await p.$$eval('.tab', e => e.every(x => x.scrollWidth <= x.clientWidth + 1)));
    await shot('0-study');
    await p.click('.tab[data-level="my"]'); await p.waitForTimeout(100);
    console.log(name, 'my empty:', (await p.textContent('#studyEmpty')).slice(0, 40), '| pill:', await p.textContent('#deckPill'));
    await p.click('[data-view="practice"]'); await p.waitForTimeout(100);
    console.log(name, 'my practice:', (await p.textContent('#pracRoot')).slice(0, 30));
    await p.click('.tab[data-level="400"]'); await p.waitForTimeout(100);
    await p.click('[data-scope="all"]'); await p.waitForTimeout(60);

    // 找一題含有字表外單字的題目：直接指定題目
    await p.click('[data-start="p5"]'); await p.waitForTimeout(400);
    const qtext = await p.textContent('.prac-q');
    const words = await p.$$eval('.prac-q .tw', e => e.map(x => x.textContent));
    console.log(name, 'q:', qtext.trim(), '| tappable words:', words.length);
    // 逐字點，找出一個字表外的字和一個字表內的字
    let glossWord = null, listWord = null, nameWord = null;
    for (const wd of words) {
      const kind = await p.evaluate(w => new Promise(res => { const s = document.createElement('script'); if (window.GLOSS) return res(1); s.src = 'data/gloss.js'; s.onload = () => res(1); document.head.appendChild(s); }).then(() => {
        const f = w.toLowerCase(); const lw = window.WORDS.find(x => !x.custom && x.w.toLowerCase() === f); if (lw) return 'list';
        const l = window.GLOSS.f[f] || f; if (window.WORDS.find(x => !x.custom && x.w.toLowerCase() === l)) return 'list'; if (window.GLOSS.w[l]) return 'gloss'; return window.GLOSS.n[f] ? 'name' : 'none'; }), wd);
      if (kind === 'gloss' && !glossWord && wd.length > 3) glossWord = wd;
      if (kind === 'list' && !listWord) listWord = wd;
      if (kind === 'name' && !nameWord) nameWord = wd;
    }
    console.log(name, 'pick gloss:', glossWord, '| list:', listWord, '| name:', nameWord);
    if (glossWord) {
      console.log(name, 'tap gloss →', await tap(glossWord));
      await shot('1-pop-gloss');
      console.log(name, 'spoken:', (await p.evaluate(() => window.__spoken)).slice(-1), '| custom:', await p.evaluate(() => JSON.stringify(Object.values(ToeicDebug.state().custom)).slice(0, 260)));
      console.log(name, 'tab 自選 pill after save → words:', await p.evaluate(() => window.WORDS.length));
      console.log(name, 'tap again →', await tap(glossWord));
      await p.click('#wordPop [data-wp="undo"]'); await p.waitForTimeout(80);
      console.log(name, 'after remove →', await pop(), '| words:', await p.evaluate(() => window.WORDS.length), '| tombstone:', await p.evaluate(() => JSON.stringify(Object.values(ToeicDebug.state().custom).map(x => [x.del, !!x.w]))));
      console.log(name, 'tap 3rd (re-add) →', (await tap(glossWord)).slice(0, 60));
    }
    if (listWord) {
      console.log(name, 'tap list →', await tap(listWord));
      await shot('2-pop-list');
      const info = await p.evaluate(() => { const s = ToeicDebug.state(); const ids = Object.keys(s.recs).filter(k => s.recs[k].pri); return ids.map(k => [k, s.recs[k].st, !!s.recs[k].pri]); });
      console.log(name, 'pri recs:', JSON.stringify(info));
    }
    if (nameWord) console.log(name, 'tap name →', await tap(nameWord));
    await p.mouse.click(5, 5); await p.waitForTimeout(80);
    console.log(name, 'outside click closes:', await pop());
    // 作答後選項也能點
    await p.click('.opt >> nth=0'); await p.waitForTimeout(100);
    const optWord = await p.$eval('.opts .opt .tw', e => e.textContent);
    console.log(name, 'tap option word', optWord, '→', (await tap(optWord, '.opts')).slice(0, 70));
    await shot('3-after-answer', true);
    await p.keyboard.press('Escape'); await p.waitForTimeout(50);
    await p.click('[data-act="quit"]'); await p.waitForTimeout(80);

    // 聽力：作答後點原文
    await p.click('[data-start="listen"]'); await p.waitForTimeout(500);
    await p.click('.opts-abc .opt >> nth=0'); await p.waitForTimeout(150);
    const lw = await p.$$eval('.script-q .tw', e => e.map(x => x.textContent));
    const s0 = await p.evaluate(() => window.__spoken.length);
    console.log(name, 'listen tap', lw[lw.length - 1], '→', (await tap(lw[lw.length - 1], '.script')).slice(0, 80));
    await p.keyboard.press('Escape');
    await p.click('.opt-script .say-btn >> nth=0'); await p.waitForTimeout(60);
    console.log(name, 'replay btn spoken:', (await p.evaluate(() => window.__spoken)).slice(s0).map(x => x.slice(0, 30)));
    await shot('4-listen', true);
    await p.click('[data-act="quit"]'); await p.waitForTimeout(80);

    // 閱讀：點短文裡的字，例句應該是那一句
    await p.click('[data-start="read"]'); await p.waitForTimeout(300);
    const rw = await p.evaluate(() => { const els = [...document.querySelectorAll('.passage-text .tw')]; const G = window.GLOSS; const e = els.find(x => { const f = x.textContent.toLowerCase(); const l = G.f[f] || f; return f.length > 4 && G.w[l] && !window.WORDS.find(y => y.w.toLowerCase() === l); }); return e ? e.textContent : null; });
    if (rw) {
      console.log(name, 'read tap', rw, '→', (await tap(rw, '.passage-text')).slice(0, 80));
      await shot('5-read-pop');
      console.log(name, 'saved ex:', await p.evaluate(w => { const c = Object.values(ToeicDebug.state().custom).filter(x => !x.del).pop(); return JSON.stringify([c.w, c.ex, c.hl, c.ex.slice(c.hl[0], c.hl[1])]); }, rw));
    }
    await p.keyboard.press('Escape');
    await p.click('[data-act="quit"]'); await p.waitForTimeout(80);

    // 自選分頁：單字卡
    await p.click('.tab[data-level="my"]'); await p.waitForTimeout(100);
    await p.click('[data-view="study"]'); await p.waitForTimeout(200);
    console.log(name, 'my deck pill:', await p.textContent('#deckPill'), '| counts:', (await p.textContent('#counts')).replace(/\s+/g, ' ').trim(), '| card:', (await p.textContent('#cardFront')).replace(/\s+/g, ' ').slice(0, 110));
    await shot('6-my-card-front');
    await p.keyboard.press('Space'); await p.waitForTimeout(100);
    console.log(name, 'card back:', (await p.textContent('#cardBack')).replace(/\s+/g, ' ').slice(0, 110));
    await shot('7-my-card-back');
    await p.keyboard.press('3'); await p.waitForTimeout(100);
    console.log(name, 'after rating → rec:', await p.evaluate(() => { const s = ToeicDebug.state(); const k = Object.keys(s.recs).find(k => k.indexOf('c_') === 0 && s.recs[k].st !== 'new'); return k ? k + ':' + s.recs[k].st : '(none)'; }));
    // 字表內存的字：在 400 分新字的最前面
    if (listWord) {
      await p.click('.tab[data-level="all"]'); await p.waitForTimeout(100);
      const first = await p.evaluate(() => document.querySelector('#cardFront .word') ? document.querySelector('#cardFront .word').textContent.trim() : '(no card)');
      console.log(name, '全部 first card:', first);
    }
    // 單字庫
    await p.click('.tab[data-level="my"]'); await p.click('[data-view="browse"]'); await p.waitForTimeout(150);
    console.log(name, 'browse my:', await p.textContent('#browseSummary'), '|', await p.$$eval('#wordList .wl-item', e => e.map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 50))));
    await p.click('#wordList .wl-head >> nth=0'); await p.waitForTimeout(80);
    await shot('8-browse-my');
    const before = await p.evaluate(() => window.WORDS.length);
    await p.click('#wordList [data-act="remove"]'); await p.waitForTimeout(100);
    console.log(name, 'removed via browse:', before, '→', await p.evaluate(() => window.WORDS.length));
    // 統計
    await p.click('[data-view="stats"]'); await p.waitForTimeout(150);
    console.log(name, 'stats level rows:', await p.$$eval('#levelBars .lb', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
    await shot('9-stats', true);
    // 同步合併：遠端多一個自選字和它的進度
    const merged = await p.evaluate(() => { const t = Date.now() + 5000;
      const r = ToeicDebug.mergeRemote({ custom: { c_remote: { w: 'remote', kk: 'rɪˋmot', ip: 'rɪˈmoʊt', d: ['adj.|遠端的'], ex: 'She works at a remote office.', zh: '', hl: [15, 21], t: t, del: 0 } },
        recs: { c_remote: { st: 'review', step: 0, iv: 3, ef: 2.5, due: t, reps: 2, lapses: 0, last: t } } });
      const w = window.WORDS.find(x => x.id === 'c_remote'); return JSON.stringify([r.changed, !!w, w && w.d, ToeicDebug.state().recs.c_remote.st, r.customLocalWins.length]); });
    console.log(name, 'merge remote custom:', merged);
    await ctx.close();
  }
  console.log('errs', errs);
  await b.close();
})();
