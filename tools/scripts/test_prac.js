const { chromium, devices } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const fakeSpeech = () => {
  window.__spoken = [];
  const fake = { speaking: false, pending: false, cancel() {}, getVoices() { return []; },
    speak(u) { window.__spoken.push(u.text); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 5); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addInitScript(fakeSpeech);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(SITE); await p.waitForTimeout(300);
  await p.click('[data-view="practice"]'); await p.waitForTimeout(150);
  console.log('home modes:', await p.$$eval('.prac-mode-stat', e => e.map(x => x.textContent)));
  await p.screenshot({ path: '/home/claude/work/shots/p0-home.png' });

  // ---- P5: scope=all so all 5 sample questions show
  await p.click('[data-scope="all"]'); await p.waitForTimeout(80);
  await p.click('[data-start="p5"]'); await p.waitForTimeout(200);
  console.log('p5 top:', (await p.textContent('.prac-top')).replace(/\s+/g, ' '));
  await p.screenshot({ path: '/home/claude/work/shots/p1-p5-q.png' });
  // answer first wrong on purpose (pick an index that is not correct), rest correct via data
  const n = await p.evaluate(() => 5);
  for (let i = 0; i < n; i++) {
    const info = await p.evaluate(() => { const q = document.querySelector('.prac-q').textContent; const it = window.QUIZ_P5.find(x => q.startsWith(x.q.split('-------')[0])); return { a: it.a, wid: it.wid }; });
    const choose = i === 0 ? (info.a + 1) % 4 : info.a;
    await p.keyboard.press(String(choose + 1)); await p.waitForTimeout(80);
    if (i === 0) { await p.screenshot({ path: '/home/claude/work/shots/p2-p5-wrong.png' }); console.log('fb:', (await p.textContent('.fb')).replace(/\s+/g, ' ').slice(0, 120)); }
    await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  }
  console.log('done:', (await p.textContent('.prac-done')).replace(/\s+/g, ' ').slice(0, 90));
  await p.screenshot({ path: '/home/claude/work/shots/p3-p5-done.png' });
  console.log('practice state:', await p.evaluate(() => JSON.stringify(ToeicDebug.state().practice.p5).slice(0, 120)), '| pday:', await p.evaluate(() => JSON.stringify(ToeicDebug.state().pday)).then(s => s.replace(/"t":\d+/, '"t":…')));
  await p.click('[data-act="quit"]'); await p.waitForTimeout(80);

  // ---- Listening
  const s0 = (await p.evaluate(() => window.__spoken.length));
  await p.click('[data-start="listen"]'); await p.waitForTimeout(600);
  console.log('listen spoken:', (await p.evaluate(() => window.__spoken)).slice(s0));
  await p.screenshot({ path: '/home/claude/work/shots/p4-listen-q.png' });
  for (let i = 0; i < 3; i++) {
    const a = await p.evaluate(() => { const it = window.QUIZ_LISTEN; return null; });
    await p.click('.opts-abc .opt >> nth=' + (i === 0 ? 0 : 1)); await p.waitForTimeout(120);
    if (i === 0) await p.screenshot({ path: '/home/claude/work/shots/p5-listen-a.png' });
    await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  }
  console.log('listen done:', (await p.textContent('.prac-done')).replace(/\s+/g, ' ').slice(0, 60));
  await p.click('[data-act="quit"]'); await p.waitForTimeout(80);

  // ---- Reading
  await p.click('[data-start="read"]'); await p.waitForTimeout(200);
  const title = await p.textContent('.passage-head b');
  console.log('read passage:', title);
  await p.screenshot({ path: '/home/claude/work/shots/p6-read-q.png', fullPage: true });
  for (let qi = 0; qi < 3; qi++) { await p.click('.rq >> nth=' + qi + ' >> .opt >> nth=1'); await p.waitForTimeout(80); }
  await p.screenshot({ path: '/home/claude/work/shots/p7-read-a.png', fullPage: true });
  console.log('read after:', (await p.textContent('.read-after')).replace(/\s+/g, ' ').slice(0, 80));
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  console.log('next passage:', await p.textContent('.passage-head b'));
  await p.click('.tab-600'); await p.waitForTimeout(150);
  console.log('after level switch → home shown:', !!(await p.$('.prac-modes')), await p.$$eval('.prac-mode-stat', e => e.map(x => x.textContent)));
  await p.click('.tab-400');
  // stats
  await p.click('[data-view="stats"]'); await p.waitForTimeout(150);
  console.log('stats practice:', (await p.textContent('#pracStats')).replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: '/home/claude/work/shots/p8-stats.png', fullPage: true });
  // card state: wrong P5 answer on a 'new' word does nothing; simulate a review word
  console.log('ERRORS:', errs);
  await ctx.close();

  // phone widths: every view incl. practice sessions
  for (const w of [320, 390, 820]) {
    const c = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: true });
    await c.addInitScript(fakeSpeech);
    const q = await c.newPage(); q.on('pageerror', e => errs.push(w + ': ' + e.message));
    await q.goto(SITE); await q.waitForTimeout(250);
    const res = [];
    await q.click('[data-view="practice"]'); await q.waitForTimeout(120); res.push('home:' + await q.evaluate(() => document.documentElement.scrollWidth));
    await q.click('[data-scope="all"]');
    await q.click('[data-start="p5"]'); await q.waitForTimeout(150); await q.click('.opt >> nth=0'); await q.waitForTimeout(100); res.push('p5:' + await q.evaluate(() => document.documentElement.scrollWidth));
    if (w !== 820) await q.screenshot({ path: '/home/claude/work/shots/p9-' + w + '-p5.png', fullPage: true });
    await q.click('[data-act="quit"]');
    await q.click('[data-start="read"]'); await q.waitForTimeout(150); res.push('read:' + await q.evaluate(() => document.documentElement.scrollWidth));
    if (w === 390) await q.screenshot({ path: '/home/claude/work/shots/p9-390-read.png', fullPage: true });
    await q.click('[data-act="quit"]');
    await q.click('[data-start="listen"]'); await q.waitForTimeout(300); res.push('listen:' + await q.evaluate(() => document.documentElement.scrollWidth));
    await q.click('.opts-abc .opt >> nth=1'); await q.waitForTimeout(120); res.push('listenA:' + await q.evaluate(() => document.documentElement.scrollWidth));
    if (w === 390) await q.screenshot({ path: '/home/claude/work/shots/p9-390-listen.png', fullPage: true });
    console.log(w, res.join(' '));
    await c.close();
  }
  console.log('ERRORS:', errs);
  await b.close();
})();
