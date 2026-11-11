const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-09T20:00:00+08:00') });
  await p.goto('file:///home/claude/work/site/index.html');
  await p.waitForTimeout(300);
  // 20 new cards: good → all go to 10-min step
  for (let i = 0; i < 20; i++) { await p.keyboard.press('Space'); await p.keyboard.press('3'); }
  await p.waitForTimeout(100);
  console.log('EMPTY1:', (await p.textContent('#studyEmpty')).replace(/\s+/g, ' '));
  await p.click('#aheadBtn'); await p.waitForTimeout(100);
  console.log('ahead card shown:', !(await p.isHidden('#card')));
  // click speaker buttons (no crash expected)
  await p.click('#card .word'); await p.click('#card .example');
  // jump 11 minutes, rate all good → graduate
  await p.clock.fastForward('11:00'); await p.click('.tab-400'); await p.waitForTimeout(100);
  console.log('COUNTS after 11min:', (await p.textContent('#counts')).replace(/\s+/g, ' '));
  for (let i = 0; i < 20; i++) { await p.keyboard.press('Space'); await p.keyboard.press('3'); }
  await p.waitForTimeout(100);
  console.log('EMPTY2:', (await p.textContent('#studyEmpty')).replace(/\s+/g, ' '));
  await p.click('#moreNewBtn'); await p.waitForTimeout(100);
  console.log('after more new:', (await p.textContent('#counts')).replace(/\s+/g, ' '));
  // next day
  await p.clock.fastForward('24:00:00'); await p.click('.tab-600'); await p.click('.tab-400'); await p.waitForTimeout(100);
  console.log('NEXT DAY counts:', (await p.textContent('#counts')).replace(/\s+/g, ' '), 'tabs:', await p.$$eval('.tab-count', e => e.map(x => x.textContent)));
  await p.keyboard.press('Space'); await p.waitForTimeout(50);
  console.log('review IVS:', await p.$$eval('.rate-iv', els => els.map(e => e.textContent)));
  await p.click('[data-view="stats"]'); await p.waitForTimeout(100);
  await p.screenshot({ path: '/home/claude/work/shots/11-stats2.png', fullPage: true });
  console.log('forecast:', (await p.textContent('#forecast')).replace(/\s+/g, ' '));
  // export anki
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-view="settings"]').then(() => p.click('#ankiBtn'))]);
  const fs = require('fs'); const path = await dl.path(); const txt = fs.readFileSync(path, 'utf8');
  console.log('TSV lines:', txt.split('\n').length, txt.split('\n')[3].slice(0, 120));
  console.log('ERRS:', errs);
  await b.close();
})();
