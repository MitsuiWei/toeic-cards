// 測使用權限：未登入鎖住 → 登入 → 申請 → 等待 → 管理員同意後自動進入；拒絕／撤銷／刪除；管理員審核清單與紅點；
// 規則還沒更新時（舊規則）登入就放行；核准過的裝置離線也能用；file:// 不啟用；登入程式庫沒載入。
// 用法：node test_gate.js
const { chromium } = require('playwright');
const fakeFirebase = require('./fake_firebase.js');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/claude/work/site';
const FILE_SITE = 'file://' + ROOT + '/index.html';
// 用本機 http 伺服器開網站：和正式環境一樣是 http(s)（gate 會自動啟用），localStorage 在重新整理之間也穩定
// （file:// 每次重新整理可能換一個 renderer process，localStorage 偶爾會讀到舊資料，測試會不穩）
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
});
let SITE = '';
const SHOTS = '/home/claude/work/shots/';
const fakeSpeech = () => {
  const fake = { speaking: false, pending: false, cancel() {}, getVoices() { return []; }, speak(u) { setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 3); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
const ADMIN = { uid: 'uAdmin', email: 'admin@example.com', displayName: '管理員' };
const BOB = { uid: 'uBob', email: 'bob@example.com', displayName: 'Bob Chen' };
const EVE = { uid: 'uEve', email: 'eve@example.com', displayName: 'Eve Lin' };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  SITE = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await chromium.launch();
  const errs = [];
  const mk = async (name, w, h, opts) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 2 : 1, hasTouch: w < 800, serviceWorkers: 'block' });
    await ctx.addInitScript(fakeSpeech);
    if (opts !== null) await ctx.addInitScript(fakeFirebase, Object.assign({ forceGate: false }, opts || {}));
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('dialog', d => d.accept());
    const need = (what, cond) => { if (!cond) errs.push(name + ': ' + what); };
    const locked = () => p.evaluate(() => document.body.classList.contains('is-locked'));
    const gateText = () => p.evaluate(() => document.getElementById('gate').textContent);
    const shot = async n => { await p.screenshot({ path: SHOTS + 'gate-' + name + '-' + n + '.png' }); const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o); };
    const signIn = async u => { await p.evaluate(u => { window.__fb.nextUser = u; }, u); await p.click('[data-gate="signin"]'); await p.waitForTimeout(250); };
    const open = async (url) => { await p.goto(url || SITE); await p.waitForFunction(() => window.ToeicDebug && window.Sync); await p.waitForTimeout(350); };
    return { ctx, p, need, locked, gateText, shot, signIn, open };
  };

  for (const [name, w, h] of [['phone', 390, 844], ['small', 320, 640], ['desk', 1280, 900]]) {
    const { ctx, p, need, locked, gateText, shot, signIn, open } = await mk(name, w, h, { rules: 'new' });
    p.setDefaultTimeout(5000);
    try {
    await open();
    // 1. 未登入：鎖住
    need('locked when signed out', await locked());
    need('sign-in screen', /請先登入/.test(await gateText()) && await p.$$eval('[data-gate="signin"]', e => e.length) === 1);
    need('app hidden', await p.$eval('.page', e => getComputedStyle(e).display === 'none'));
    await shot('1-signin');
    // 鎖住時鍵盤不會翻卡
    await p.keyboard.press('Space'); await p.waitForTimeout(80);
    need('keyboard blocked while locked', await p.$eval('#cardBack', e => e.hidden !== false || getComputedStyle(e).display === 'none').catch(() => true));
    // 2. Bob 登入 → 還沒申請
    await signIn(BOB);
    need('none: request screen', /申請使用權限/.test(await gateText()) && /bob@example\.com/.test(await gateText()) && await locked());
    await shot('2-request');
    await p.click('[data-gate="request"]'); await p.waitForTimeout(250);
    need('pending screen', /等待管理員同意/.test(await gateText()) && await locked());
    need('request stored as pending', await p.evaluate(() => { const d = __fb.docs()['toeicAccess/uBob']; return d && d.status === 'pending' && d.email === 'bob@example.com'; }));
    need('no data sync before approval', await p.evaluate(() => !__fb.docs()['toeicCards/uBob']));
    await shot('3-pending');
    // 自己不能把自己改成 approved（規則擋）
    const selfApprove = await p.evaluate(() => firebase.firestore().collection('toeicAccess').doc('uBob').update({ status: 'approved' }).then(() => 'ok', e => e.code));
    need('cannot self-approve (' + selfApprove + ')', selfApprove === 'permission-denied');
    // 重新整理還是等待
    await open();
    need('still pending after reload', /等待管理員同意/.test(await gateText()) && await locked());
    // 3. 管理員（在別的裝置）同意 → 自動進入
    await p.evaluate(() => __fb.serverSet('toeicAccess/uBob', { status: 'approved' })); await p.waitForTimeout(400);
    need('auto-unlock on approval', !(await locked()));
    need('app visible', await p.$eval('.page', e => getComputedStyle(e).display !== 'none'));
    need('sync started after approval', await p.evaluate(() => !!__fb.docs()['toeicCards/uBob']));
    need('non-admin sees no admin box or tab', await p.$eval('#accessBox', e => e.innerHTML === '') && await p.$eval('#adminTab', e => e.hidden));
    need('non-admin cannot read other users', await p.evaluate(() => firebase.firestore().collection('toeicCards').doc('uAdmin').get().then(() => 'ok', e => e.code)) === 'permission-denied');
    // 核准過：重新整理直接進（不閃登入畫面）
    await open();
    need('approved user enters after reload', !(await locked()));
    // 離線：核准過的裝置照常使用
    await p.evaluate(() => { __fb.offline = true; }); await p.evaluate(() => Sync.recheck()); await p.waitForTimeout(250);
    need('approved user stays in while offline', !(await locked()));
    await p.evaluate(() => { __fb.offline = false; });
    // 撤銷 → 回到鎖住
    await p.evaluate(() => __fb.serverSet('toeicAccess/uBob', { status: 'denied' })); await p.waitForTimeout(300);
    need('revoked → locked + denied screen', await locked() && /申請沒有通過/.test(await gateText()));
    await shot('4-denied');
    await open();
    need('denied stays locked after reload', await locked() && /申請沒有通過/.test(await gateText()));
    // 換帳號：Eve 申請
    await p.click('[data-gate="signout"]'); await p.waitForTimeout(250);
    need('sign out → sign-in screen', /請先登入/.test(await gateText()));
    await signIn(EVE); await p.click('[data-gate="request"]'); await p.waitForTimeout(250);
    await p.click('[data-gate="signout"]'); await p.waitForTimeout(250);
    // 4. 管理員登入：直接進、看到清單和紅點
    await signIn(ADMIN); await p.waitForTimeout(300);
    need('admin enters without a request', !(await locked()));
    need('admin tab visible with badge', await p.$eval('#adminTab', e => !e.hidden && e.classList.contains('has-badge')));
    // Bob 的雲端資料（他之前核准時同步過）：補一些學習紀錄
    await p.evaluate(() => {
      const now = Date.now(), d = new Date(), pad = n => (n < 10 ? '0' : '') + n, day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      __fb.serverSet('toeicCards/uBob', { recs: { 1: { st: 'review' }, 2: { st: 'learning' }, 3: { st: 'known' }, 4: { st: 'new' } },
        practice: { p5: { p1: [2, 1, now, 1, '0'] }, read: { 'r400-01': [1, 2, now, 2, '012'] } }, pday: { [day]: { p5: [2, 1], read: [3, 2], t: now } },
        place: { 5: { t: now, L: [100, 150, 200], R: [100, 150, 200], S: [220, 300, 380], m: {}, lv: 400 } }, updated: { __ts: now } });
      __fb.serverSet('toeicCards/uBob/log/' + day.slice(0, 7), { e: [{ t: now, id: 1, r: 3, s: 'new' }, { t: now - 1000, id: 2, r: 3, s: 'new' }] });
    });
    await p.click('#adminTab'); await p.waitForTimeout(250);
    const rows = await p.$$eval('#adminRoot .acc-row', e => e.map(x => x.className + '|' + x.textContent));
    need('admin page has 2 rows, pending first: ' + rows.join(' / '), rows.length === 2 && /is-pending/.test(rows[0]) && /eve@example\.com/.test(rows[0]) && /is-denied/.test(rows[1]) && /bob@example\.com/.test(rows[1]));
    await shot('5-admin-pending');
    await p.click('.acc-row.is-pending [data-acc="approved"]'); await p.waitForTimeout(350);
    need('approve from admin page', await p.evaluate(() => __fb.docs()['toeicAccess/uEve'].status === 'approved'));
    need('badge cleared', await p.$eval('#adminTab', e => !e.classList.contains('has-badge')));
    need('approved user with no data', /還沒有學習紀錄/.test(await p.textContent('.acc-row.is-approved')));
    // Bob 改為同意 → 看得到學習狀況
    await p.click('.acc-row.is-denied [data-acc="approved"]'); await p.waitForTimeout(400);
    const bob = await p.$$eval('.acc-row.is-approved', e => (e.map(x => x.textContent).find(t => /bob@example/.test(t)) || ''));
    need('bob stats: 3 words / 5 questions / 60% / 1 day → ' + bob.slice(0, 200), /3學過的字/.test(bob) && /5練習題數/.test(bob) && /60%練習答對率/.test(bob) && /1 天近 7 天有使用/.test(bob));
    need('bob stats lines', /學習中 1・複習中 1・已會 1/.test(bob) && /單字填空 2 題・閱讀 3 題・聽力 0 題/.test(bob) && /複習單字卡 2 次、練習 5 題/.test(bob) && /約 300 分/.test(bob));
    await p.$eval('#adminRoot', e => e.scrollIntoView({ block: 'start' })); await shot('6-admin-users');
    await p.screenshot({ path: SHOTS + 'gate-' + name + '-6-admin-full.png', fullPage: true });
    need('admin cannot write other users', await p.evaluate(() => firebase.firestore().collection('toeicCards').doc('uBob').set({ x: 1 }, { merge: true }).then(() => 'ok', e => e.code)) === 'permission-denied');
    need('admin sync works', await p.evaluate(() => !!__fb.docs()['toeicCards/uAdmin']));
    // 撤銷 Eve、再刪除她的申請
    const eveRow = '.acc-row.is-approved:has-text("eve@example.com")';
    await p.click(eveRow + ' [data-acc="denied"]'); await p.waitForTimeout(300);
    need('revoke from admin page', await p.evaluate(() => __fb.docs()['toeicAccess/uEve'].status === 'denied'));
    await p.click('.acc-row.is-denied [data-acc="remove"]'); await p.waitForTimeout(300);
    need('remove denied request', await p.evaluate(() => !__fb.docs()['toeicAccess/uEve']));
    await p.click('[data-view="settings"]'); await p.waitForTimeout(150);
    need('settings points admin to the admin page', /你是管理員/.test(await p.textContent('#accessBox')));
    // 管理員登出 → 鎖住
    await p.click('#signOutBtn'); await p.waitForTimeout(300);
    need('admin sign-out locks', await locked() && /請先登入/.test(await gateText()));
    } catch (e) { errs.push(name + ' EXCEPTION ' + e.message.split('\n')[0] + ' | ' + await p.evaluate(() => JSON.stringify([Sync.gate().state, Sync.gate().admin, Sync.info().status, Sync.info().msg, document.body.className, document.getElementById('gate').textContent.slice(0, 60), __fb.log.slice(-6), localStorage.getItem('toeic-gate-v1')]))); }
    await ctx.close();
  }

  // 舊規則（還沒更新）：登入就放行，設定頁有說明；規則更新後下次確認就會鎖住沒核准的人
  {
    const { ctx, p, need, locked, gateText, signIn, open } = await mk('dormant', 390, 844, { rules: 'old' });
    await open();
    need('locked when signed out', await locked());
    await signIn(BOB); await p.waitForTimeout(300);
    need('old rules: signed-in user enters', !(await locked()));
    need('sync works under old rules', await p.evaluate(() => !!__fb.docs()['toeicCards/uBob']));
    await p.click('[data-view="settings"]'); await p.waitForTimeout(100);
    need('dormant note in settings', /審核還沒啟用/.test(await p.textContent('#accessBox')));
    await p.evaluate(() => { __fb.setRules('new'); }); await open();
    need('after rules deployed: not approved → locked', await locked() && /申請使用權限/.test(await gateText()));
    await ctx.close();
  }
  // 連不上伺服器、而且這台裝置沒核准過
  {
    const { ctx, p, need, locked, gateText, signIn, open } = await mk('offline', 390, 844, { rules: 'new' });
    await open();
    await p.evaluate(() => { __fb.offline = true; });
    await signIn(BOB); await p.waitForTimeout(300);
    need('offline + never approved → unavailable screen', await locked() && /無法確認使用權限/.test(await gateText()));
    await p.evaluate(() => { __fb.offline = false; }); await p.click('[data-gate="retry"]'); await p.waitForTimeout(300);
    need('retry → request screen', /申請使用權限/.test(await gateText()));
    await ctx.close();
  }
  // 登入程式庫沒載入（沒有 firebase）＋強制啟用 gate
  {
    const { ctx, p, need, locked, gateText, open } = await mk('nosdk', 390, 844, null);
    await open();
    need('no sdk → locked with message', await locked() && /連不上登入服務/.test(await gateText()));
    await ctx.close();
  }
  // file:// 一般開啟（沒有強制）：不啟用，直接可用
  {
    const { ctx, p, need, locked, open } = await mk('file', 390, 844, null);
    await open(FILE_SITE);
    need('file:// → gate off', !(await locked()) && await p.evaluate(() => !Sync.gate().on));
    await ctx.close();
  }
  await b.close(); server.close();
  console.log('errs', errs);
})();
