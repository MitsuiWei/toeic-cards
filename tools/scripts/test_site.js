const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const site = 'file://' + path.resolve(process.argv[2], 'index.html');
  const out = process.argv[3];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(site);
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + '/01-study-front.png' });

  const front = await page.textContent('#cardFront');
  console.log('FRONT:', front.trim().slice(0, 120));
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/02-study-back.png' });
  console.log('BACK:', (await page.textContent('#cardBack')).trim().slice(0, 100));
  console.log('IVS:', await page.$$eval('.rate-iv', els => els.map(e => e.textContent)));

  // rate 10 cards good via keyboard
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('3');
    await page.waitForTimeout(80);
    await page.keyboard.press('Space');
    await page.waitForTimeout(80);
  }
  console.log('COUNTS after 10 good:', await page.textContent('#counts'));
  await page.keyboard.press('1'); // again
  await page.waitForTimeout(100);
  await page.keyboard.press('z'); // undo
  await page.waitForTimeout(100);
  console.log('after undo front:', (await page.textContent('#cardFront')).trim().slice(0, 40));

  // tab counts
  console.log('TAB COUNTS:', await page.$$eval('.tab-count', els => els.map(e => e.textContent)));

  // screen mode
  await page.click('#screenBtn');
  await page.waitForTimeout(150);
  await page.screenshot({ path: out + '/03-screen.png' });
  await page.keyboard.press('2'); await page.keyboard.press('2'); await page.keyboard.press('1');
  await page.waitForTimeout(100);
  console.log('SCREEN progress:', await page.textContent('.screen-progress'));
  await page.click('#screenExit');
  await page.waitForTimeout(200);

  // browse
  await page.click('[data-view="browse"]');
  await page.waitForTimeout(200);
  await page.fill('#searchBox', 'appoint');
  await page.waitForTimeout(150);
  await page.click('.wl-head');
  await page.waitForTimeout(150);
  await page.screenshot({ path: out + '/04-browse.png' });
  console.log('BROWSE summary:', await page.textContent('#browseSummary'));
  await page.fill('#searchBox', '');
  await page.selectOption('#stateFilter', 'known');
  await page.waitForTimeout(150);
  console.log('KNOWN filter:', await page.textContent('#browseSummary'));

  // stats
  await page.click('[data-view="stats"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/05-stats.png', fullPage: true });
  console.log('STATS today:', (await page.textContent('#statToday')).replace(/\s+/g, ' '));

  // settings
  await page.click('[data-view="settings"]');
  await page.waitForTimeout(200);
  await page.selectOption('select[name="direction"]', 'zh');
  await page.selectOption('select[name="frontExample"]', 'cloze');
  await page.screenshot({ path: out + '/06-settings.png', fullPage: true });
  await page.click('[data-view="study"]');
  await page.waitForTimeout(200);
  console.log('ZH FRONT:', (await page.textContent('#cardFront')).trim().slice(0, 60));
  await page.selectOption('select[name="direction"]', 'en').catch(() => {});
  await page.click('[data-view="settings"]');
  await page.selectOption('select[name="direction"]', 'en');
  await page.click('[data-view="study"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/07-cloze.png' });
  console.log('CLOZE FRONT html has cloze:', (await page.innerHTML('#cardFront')).includes('class="cloze"'));

  // all tab
  await page.click('.tab-all');
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/08-all.png' });

  // persistence
  await page.reload();
  await page.waitForTimeout(500);
  console.log('PERSIST counts:', (await page.textContent('#counts')).replace(/\s+/g, ' '));

  // mobile
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  mp.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await mp.goto(site);
  await mp.waitForTimeout(600);
  await mp.screenshot({ path: out + '/09-mobile-front.png' });
  await mp.click('#revealBtn');
  await mp.waitForTimeout(200);
  await mp.screenshot({ path: out + '/10-mobile-back.png' });
  const scrollW = await mp.evaluate(() => document.documentElement.scrollWidth);
  console.log('MOBILE scrollWidth:', scrollW);

  console.log('ERRORS:', errors);
  await browser.close();
})();
