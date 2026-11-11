const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto('http://127.0.0.1:8765/index.html'); await p.waitForTimeout(1500);
  console.log('firebase loaded:', await p.evaluate(() => typeof firebase !== 'undefined' && !!firebase.apps.length));
  console.log('sync info:', await p.evaluate(() => Sync.info()));
  await p.click('[data-view="settings"]'); await p.waitForTimeout(200);
  console.log('syncBox:', (await p.textContent('#syncBox')).trim().slice(0, 80));
  await p.screenshot({ path: '/home/claude/work/shots/30-settings-sync.png', fullPage: true });
  // sign-in attempt (no network) must not crash
  await p.click('#signInBtn'); await p.waitForTimeout(2500);
  console.log('after signin attempt:', await p.evaluate(() => Sync.info()));
  // rate 3 cards locally, then simulate a remote merge
  await p.click('[data-view="study"]');
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Space'); await p.keyboard.press('3'); }
  await p.waitForTimeout(100);
  const r = await p.evaluate(() => {
    const st = ToeicDebug.state();
    const now = Date.now();
    const remote = {
      recs: {
        0: Object.assign({}, st.recs[0], { st: 'review', iv: 7, last: now + 1000 }),   // 雲端較新 → 採用
        1: Object.assign({}, st.recs[1], { last: (st.recs[1].last || 0) - 5000 }),     // 本機較新 → 本機贏
        500: { st: 'known', step: 0, iv: 0, ef: 2.5, due: 0, reps: 0, lapses: 0, last: now } // 本機沒有 → 採用
      },
      settings: Object.assign({}, st.settings, { newPerDay: 35 }), settingsUpdated: now + 1,
      daily: { day: st.daily.day, newCount: 9, extraNew: 0 },
      log: [[now - 99999, 777, 3, 'new'], st.log[0]]
    };
    const before = st.log.length;
    const res = ToeicDebug.mergeRemote(remote);
    return { res, rec0: st.recs[0].st + '/' + st.recs[0].iv, rec1: st.recs[1].st, rec500: st.recs[500].st, newPerDay: st.settings.newPerDay, newCount: st.daily.newCount, logAdded: st.log.length - before };
  });
  console.log('merge:', JSON.stringify(r));
  console.log('ERRS:', errs);
  await b.close();
})();
