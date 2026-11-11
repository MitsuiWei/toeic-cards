const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/claude/work/site/index.html'); await p.waitForTimeout(300);
  for (let i = 0; i < 20; i++) { await p.keyboard.press('Space'); await p.keyboard.press('3'); }
  await p.waitForTimeout(50);
  console.log('empty shown:', !(await p.isHidden('#studyEmpty')), '|', (await p.textContent('#studyEmpty')).replace(/\s+/g, ' '));
  await p.keyboard.press('Space'); await p.waitForTimeout(50);
  console.log('Space right away (guard) → still resting:', !(await p.isHidden('#studyEmpty')));
  await p.waitForTimeout(700);
  await p.keyboard.press('Space'); await p.waitForTimeout(80);
  console.log('Space after 0.7s → card shown:', !(await p.isHidden('#card')), '| revealed?', !(await p.isHidden('#cardBack')));
  // finish this ahead card, go back to resting, then Enter
  await p.keyboard.press('Space'); await p.keyboard.press('1'); await p.waitForTimeout(50);
  // 1 = again → 1 min → within auto learn-ahead window, so more cards keep coming; rate the rest good
  for (let i = 0; i < 25 && !(await p.isHidden('#card')); i++) { await p.keyboard.press('Space'); await p.keyboard.press('3'); await p.waitForTimeout(20); }
  console.log('state now → empty:', !(await p.isHidden('#studyEmpty')), '|', (await p.textContent('#studyEmpty')).replace(/\s+/g, ' ').slice(0, 40));
  await p.screenshot({ path: '/home/claude/work/shots/a0-rest.png', clip: { x: 150, y: 230, width: 880, height: 220 } });
  console.log('errs', errs);
  await b.close();
})();
