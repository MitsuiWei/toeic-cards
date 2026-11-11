const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const site = 'file:///home/claude/work/site/index.html';
  const errs = [];
  // desktop, front state (short frame) -> rail must match
  let p = await b.newPage({ viewport: { width: 1100, height: 820 } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(site); await p.waitForTimeout(200);
  const h = await p.evaluate(() => [document.querySelector('.rail').getBoundingClientRect().height, document.querySelector('.frame').getBoundingClientRect().height]);
  console.log('rail/frame heights:', h);
  await p.screenshot({ path: '/home/claude/work/shots/20-desktop-front.png' });
  await p.click('[data-view="stats"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: '/home/claude/work/shots/21-desktop-stats.png', fullPage: true });
  await p.close();
  // iPad portrait
  p = await b.newPage({ ...devices['iPad (gen 7)'] });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(site); await p.waitForTimeout(200);
  await p.click('#revealBtn'); await p.waitForTimeout(150);
  await p.screenshot({ path: '/home/claude/work/shots/22-ipad.png' });
  await p.close();
  // iPhone
  p = await b.newPage({ ...devices['iPhone 14'] });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(site); await p.waitForTimeout(200);
  await p.click('#revealBtn'); await p.waitForTimeout(150);
  await p.screenshot({ path: '/home/claude/work/shots/23-iphone.png' });
  await p.click('[data-view="browse"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: '/home/claude/work/shots/24-iphone-browse.png' });
  console.log('errs', errs);
  await b.close();
})();
