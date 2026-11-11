const { chromium, devices } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const fakeSpeech = () => {
  window.__spoken = [];
  const fake = { speaking: false, pending: false, cancel() {}, getVoices() { return []; },
    speak(u) { window.__spoken.push(u.text); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 5); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
const spoken = p => p.evaluate(() => window.__spoken.slice());
const frontWord = async p => (await p.textContent('#cardFront .word')).trim();
(async () => {
  const b = await chromium.launch();
  const errs = [];
  let ctx = await b.newContext({ viewport: { width: 1100, height: 860 } });
  await ctx.addInitScript(fakeSpeech);
  // 模擬舊版使用者：localStorage 裡是舊設定（有 frontSpeak、沒有新鍵）
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('toeic-cards-v1')) localStorage.setItem('toeic-cards-v1', JSON.stringify({ v: 1, recs: {}, log: [], level: 400, view: 'study',
      settings: { newPerDay: 20, newOrder: 'list', direction: 'en', frontExample: 'show', autoSpeak: 'word', frontSpeak: 'no', rate: '0.85', voice: '' } }));
  });
  let p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(SITE); await p.waitForTimeout(400);
  const w1 = await frontWord(p);
  console.log('1. load:', w1, '| phon:', await p.textContent('#cardFront .phon'), '| spoken:', await spoken(p));
  await p.keyboard.press('Space'); await p.waitForTimeout(60);
  console.log('2. reveal → spoken:', await spoken(p));
  await p.keyboard.press('3'); await p.waitForTimeout(60);
  const w2 = await frontWord(p);
  console.log('3. rate → new card:', w2, '| spoken:', await spoken(p));
  await p.click('#revealBtn'); await p.waitForTimeout(60);
  await p.click('.rate-good'); await p.waitForTimeout(60);
  const w3 = await frontWord(p);
  console.log('4. click reveal+rate → card:', w3, '| spoken:', await spoken(p));
  await p.keyboard.press('z'); await p.waitForTimeout(60);
  console.log('5. undo → card:', await frontWord(p), '| last spoken:', (await spoken(p)).slice(-1));
  // skip-known button
  await p.click('#knownBtn'); await p.waitForTimeout(60);
  console.log('6. skip known → card:', await frontWord(p), '| last spoken:', (await spoken(p)).slice(-1));
  // level tab switch
  await p.click('.tab-600'); await p.waitForTimeout(60);
  console.log('7. tab 600 → card:', await frontWord(p), '| last spoken:', (await spoken(p)).slice(-1));
  // no gesture: wait 2s, then trigger a re-render via visibility → must not speak
  const n0 = (await spoken(p)).length;
  await p.waitForTimeout(1700);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(60);
  console.log('8. re-render w/o gesture → new speech:', (await spoken(p)).length - n0);
  // settings: turn off
  await p.click('[data-view="settings"]');
  console.log('   settings values:', await p.$eval('select[name="speakOnShow"]', e => e.value), await p.$eval('select[name="phonetic"]', e => e.value));
  await p.selectOption('select[name="speakOnShow"]', 'no');
  await p.click('[data-view="study"]'); await p.waitForTimeout(60);
  const n1 = (await spoken(p)).length;
  await p.keyboard.press('Space'); await p.waitForTimeout(40); await p.keyboard.press('3'); await p.waitForTimeout(60);
  const after = await spoken(p);
  console.log('9. speakOnShow=no → reveal speaks 1, new card speaks 0 → added:', after.length - n1);
  // direction zh: no speak on show even when on
  await p.click('[data-view="settings"]');
  await p.selectOption('select[name="speakOnShow"]', 'yes');
  await p.selectOption('select[name="direction"]', 'zh');
  await p.selectOption('select[name="autoSpeak"]', 'none');
  await p.click('[data-view="study"]'); await p.waitForTimeout(60);
  const n2 = (await spoken(p)).length;
  await p.keyboard.press('Space'); await p.waitForTimeout(40);
  console.log('10. zh back phon:', await p.textContent('#cardBack .phon'), '| front has phon:', !!(await p.$('#cardFront .phon')));
  await p.keyboard.press('3'); await p.waitForTimeout(60);
  console.log('    zh direction → added speech:', (await spoken(p)).length - n2);
  // phonetic modes
  await p.click('[data-view="settings"]');
  await p.selectOption('select[name="direction"]', 'en');
  await p.selectOption('select[name="phonetic"]', 'ipa');
  await p.click('[data-view="study"]'); await p.waitForTimeout(60);
  console.log('11. ipa:', await p.textContent('#cardFront .phon'));
  await p.click('[data-view="settings"]'); await p.selectOption('select[name="phonetic"]', 'none');
  await p.click('[data-view="study"]'); await p.waitForTimeout(60);
  console.log('    none → phon exists:', !!(await p.$('#cardFront .phon')));
  await p.click('[data-view="settings"]'); await p.selectOption('select[name="phonetic"]', 'kk');
  // browse row
  await p.click('[data-view="browse"]'); await p.fill('#searchBox', 'contract'); await p.waitForTimeout(100);
  console.log('12. browse rows:', await p.$$eval('.wl-main', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 70))));
  // anki export
  await p.click('[data-view="settings"]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ankiBtn')]);
  const txt = require('fs').readFileSync(await dl.path(), 'utf8').split('\n');
  console.log('13. tsv header:', txt[2], '| row:', txt[3].slice(0, 70), '| cols:', txt[3].split('\t').length);
  await ctx.close();

  // ---- screenshots: heteronym card on desktop / iPad / phone ----
  const recs = {}; for (let i = 250; i < 367; i++) recs[i] = { st: 'known', step: 0, iv: 0, ef: 2.5, due: 0, reps: 0, lapses: 0, last: 1 };
  const seed = JSON.stringify({ v: 1, recs, log: [], level: 600, view: 'study', settings: {} });
  for (const [name, opt] of [['desktop', { viewport: { width: 1100, height: 760 } }], ['ipad', devices['iPad (gen 7)']], ['iphone', devices['iPhone 14']]]) {
    const c = await b.newContext(opt);
    await c.addInitScript(s => localStorage.setItem('toeic-cards-v1', s), seed);
    const q = await c.newPage(); q.on('pageerror', e => errs.push(name + ': ' + e.message));
    await q.goto(SITE); await q.waitForTimeout(400);
    await q.click('#revealBtn'); await q.waitForTimeout(150);
    await q.screenshot({ path: '/home/claude/work/shots/90-' + name + '-heteronym.png' });
    console.log(name, 'docW', await q.evaluate(() => document.documentElement.scrollWidth), 'card:', (await q.textContent('#cardFront')).replace(/\s+/g, ' ').slice(0, 60));
    if (name === 'iphone') {
      await q.click('.tab-400'); await q.waitForTimeout(150);
      await q.screenshot({ path: '/home/claude/work/shots/91-iphone-front.png' });
      await q.click('[data-view="browse"]'); await q.waitForTimeout(150);
      await q.screenshot({ path: '/home/claude/work/shots/92-iphone-browse.png' });
      await q.click('[data-view="settings"]'); await q.waitForTimeout(150);
      await q.screenshot({ path: '/home/claude/work/shots/93-iphone-settings.png', fullPage: true });
    }
    await c.close();
  }
  console.log('ERRORS:', errs);
  await b.close();
})();
