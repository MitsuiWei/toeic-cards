const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-10T20:00:00+08:00') });
  await p.goto('file:///home/claude/work/site/index.html'); await p.waitForTimeout(200);
  // 新字上限改成 3，學 3 張 → 都進 10 分鐘步驟
  await p.click('[data-view="settings"]'); await p.fill('input[name="newPerDay"]', '3'); await p.keyboard.press('Tab'); await p.click('[data-view="study"]');
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Space'); await p.keyboard.press('3'); }
  await p.waitForTimeout(50);
  console.log('rest:', (await p.textContent('#studyEmpty')).replace(/\s+/g, ' ').slice(0, 50));
  await p.clock.fastForward(1000);
  await p.keyboard.press('Space'); await p.waitForTimeout(50);
  let seen = 0;
  // 之後不用再按「不等了」：連續把 3 張都複習完（良好 → 畢業）
  for (let i = 0; i < 6 && !(await p.isHidden('#card')); i++) { seen++; await p.keyboard.press('Space'); await p.keyboard.press('3'); await p.waitForTimeout(30); }
  console.log('cards shown in a row after one press:', seen, '| end state:', (await p.textContent('#studyEmpty')).replace(/\s+/g, ' ').slice(0, 30));
  console.log('counts:', (await p.textContent('#counts')).replace(/\s+/g, ' '));
  console.log('errs', errs);
  await b.close();
})();
