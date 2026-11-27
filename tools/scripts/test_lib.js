// 測單字庫的連續播放：英＋中／只唸英文／只唸中文、遮中文／遮英文（想一下再揭曉）、暫停與接著播、上一個／下一個、
// 從某一列開始、自動捲到正在唸的字、唸到還沒列出來的字會多列、離開單字庫會停、點別的發音會讓路。
// 用法：node test_lib.js
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const SHOTS = '/home/claude/work/shots/';
const fakeSpeech = () => {
  window.__spoken = [];
  let tok = 0;
  const V = (name, lang) => ({ name, lang, voiceURI: name, localService: true, default: false });
  const voices = [V('Samantha', 'en-US'), V('Meijia', 'zh-TW'), V('Tingting', 'zh-CN'), V('Sinji', 'zh-HK')];
  window.SpeechSynthesisUtterance = function (t) { const et = new EventTarget(); et.text = t; et.rate = 1; et.volume = 1; et.lang = ''; et.voice = null;
    ['start', 'end', 'error', 'boundary'].forEach(n => et.addEventListener(n, e => { const h = et['on' + n]; if (h) h.call(et, e); })); return et; };
  const fake = { speaking: false, pending: false, getVoices() { return voices; },
    cancel() { tok++; this.speaking = false; },
    speak(u) {
      const my = ++tok; window.__spoken.push({ t: u.text, lang: u.lang, v: u.voice && u.voice.name, vol: u.volume }); this.speaking = true;
      setTimeout(() => { if (my === tok) u.dispatchEvent(new Event('start')); }, 5);
      setTimeout(() => { if (my === tok) { this.speaking = false; u.dispatchEvent(new Event('end')); } }, 160);
    } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, w, h] of [['phone', 390, 844], ['small', 320, 640], ['desk', 1280, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: name === 'desk' ? 1 : 2, hasTouch: name !== 'desk' });
    await ctx.addInitScript(fakeSpeech);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    const need = (what, cond) => { if (!cond) errs.push(name + ': ' + what); };
    const overflow = async n => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) errs.push(name + ' ' + n + ': overflow ' + o); };
    const spoken = () => p.evaluate(() => window.__spoken.filter(x => x.vol !== 0).map(x => x.lang.slice(0, 2) + ':' + x.t));
    const clear = () => p.evaluate(() => { window.__spoken = []; });
    const cur = () => p.evaluate(() => { const r = document.querySelector('#wordList .wl-item.is-cur'); return r ? { id: r.getAttribute('data-id'), w: r.querySelector('.wl-word').textContent.trim(), cls: r.className, stage: r.getAttribute('data-stage') } : null; });
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.evaluate(() => { ToeicDebug.state().settings.rate = '1.15'; });
    await p.click('.tab[data-level="400"]'); await p.click('[data-view="browse"]'); await p.waitForTimeout(150);
    const words = await p.evaluate(() => Array.from(document.querySelectorAll('#wordList .wl-word')).slice(0, 5).map(x => x.textContent.trim()));
    need('工具列', await p.locator('#lpBar').isVisible() && (await p.locator('#lpAuto').innerText()).includes('連續播放'));
    need('控制列一開始收著', !(await p.evaluate(() => document.getElementById('lpNow').classList.contains('is-on'))));
    await overflow('browse');

    // 1. 英＋中：先唸英文再唸中文，換下一個字
    await p.click('#lpAuto'); await p.waitForTimeout(60);
    let c = await cur();
    need('第一個字是正在唸的字', c && c.w === words[0]);
    need('正在發音的樣子', c && /is-playing/.test(c.cls) && c.stage === 'en');
    need('控制列出現', await p.evaluate(() => document.getElementById('lpNow').classList.contains('is-on')));
    need('按鈕變成暫停', (await p.locator('#lpAuto').innerText()).includes('暫停'));
    need('位置 1 / N', /^1 \/ \d+$/.test(await p.locator('#lpPos').innerText()));
    need('控制列顯示單字', (await p.locator('#lpWord').innerText()) === words[0]);
    await p.waitForTimeout(430);
    c = await cur(); need('唸到中文', c && c.stage === 'zh');
    if (name === 'phone') await p.screenshot({ path: SHOTS + 'lib-phone-1-playing.png' });
    if (name === 'desk') await p.screenshot({ path: SHOTS + 'lib-desk-1-playing.png' });
    await p.waitForTimeout(1500);
    let s = await spoken();
    need('順序：英 中 英 中 ' + JSON.stringify(s.slice(0, 4)), s[0] === 'en:' + words[0] && s[1].startsWith('zh:') && s[2] === 'en:' + words[1] && s[3].startsWith('zh:'));
    need('中文用台灣的語音', await p.evaluate(() => window.__spoken.some(x => x.lang === 'zh-TW' && x.v === 'Meijia')));
    need('英文用英文語音、照設定的語速', await p.evaluate(() => window.__spoken.some(x => x.lang === 'en-US' && x.v === 'Samantha')));
    // 暫停：不再往下唸，正在唸的字留著；再按從同一個字接著
    await p.click('#lpPlay'); await p.waitForTimeout(80);
    const at = await cur(); const n0 = (await spoken()).length;
    await p.waitForTimeout(900);
    need('暫停後不再唸', (await spoken()).length === n0);
    need('暫停後按鈕回到播放', (await p.locator('#lpAuto').innerText()).includes('連續播放') && (await p.locator('#lpPlay').getAttribute('aria-label')) === '連續播放');
    need('暫停後還標著同一個字', (await cur()).id === at.id);
    await clear(); await p.click('#lpPlay'); await p.waitForTimeout(250);
    s = await spoken(); need('接著播是同一個字', s[0] === 'en:' + at.w);
    // 下一個／上一個
    await p.click('#lpNext'); await p.waitForTimeout(150);
    const nx = await cur(); need('下一個', nx.id !== at.id);
    await p.click('#lpPrev'); await p.waitForTimeout(150);
    need('上一個', (await cur()).id === at.id);
    await p.click('#lpPlay'); await p.waitForTimeout(80);

    // 2. 遮中文：有遮罩；連續播放先唸英文、等（閃）、揭曉、唸中文
    await p.click('#lpShow [data-v="hidezh"]'); await p.waitForTimeout(100);
    need('中文遮住了', await p.evaluate(() => document.querySelectorAll('#wordList .lp-zh.cover').length > 5 && !document.querySelector('#wordList .lp-en.cover')));
    await p.locator('#wordList .wl-item').nth(3).locator('.lp-zh').click(); await p.waitForTimeout(60);
    need('點一下就顯示', await p.evaluate(() => !document.querySelectorAll('#wordList .wl-item')[3].querySelector('.cover')));
    need('點遮罩不會展開那一列', await p.evaluate(() => !document.querySelector('#wordList .wl-body')));
    await clear();
    await p.locator('#wordList .wl-item').nth(0).locator('.lp-play').click(); await p.waitForTimeout(100);   // 單獨唸第一個字（不是連續播放）
    await p.waitForTimeout(700);
    need('單獨唸一個字：不揭曉', await p.evaluate(() => !!document.querySelectorAll('#wordList .wl-item')[0].querySelector('.lp-zh.cover')));
    await clear(); await p.click('#lpAuto'); await p.waitForTimeout(330);
    c = await cur();
    need('等的時候在閃 ' + (c && c.cls), c && /is-waiting/.test(c.cls) && c.w === words[0]);
    need('等的時候還遮著', await p.evaluate(() => !!document.querySelector('#wordList .wl-item.is-cur .lp-zh.cover')));
    need('等的時候只唸了英文', (await spoken()).length === 1);
    if (name === 'phone') await p.screenshot({ path: SHOTS + 'lib-phone-2-hidezh.png' });
    await p.waitForTimeout(2100);
    need('揭曉了', await p.evaluate(() => !document.querySelectorAll('#wordList .wl-item')[0].querySelector('.cover')));
    s = await spoken(); need('揭曉後唸中文 ' + JSON.stringify(s.slice(0, 2)), s[1] && s[1].startsWith('zh:'));
    await p.click('#lpPlay'); await p.waitForTimeout(80);

    // 3. 遮英文＋只唸英文：先等、揭曉、再唸英文；控制列的字先顯示 ？？？
    await p.click('#lpShow [data-v="hideen"]'); await p.click('#lpSay [data-v="en"]'); await p.waitForTimeout(100);
    need('英文遮住了（音標也是）', await p.evaluate(() => document.querySelectorAll('#wordList .lp-en.cover').length > 5 && !document.querySelector('#wordList .lp-zh.cover')));
    await clear(); await p.click('#lpAuto'); await p.waitForTimeout(250);
    need('還沒揭曉時控制列顯示 ？？？', (await p.locator('#lpWord').innerText()) === '？？？');
    need('先等，還沒唸', (await spoken()).length === 0);
    if (name === 'small') await p.screenshot({ path: SHOTS + 'lib-small-3-hideen.png' });
    await p.waitForTimeout(2200);
    s = await spoken(); need('揭曉後只唸英文 ' + JSON.stringify(s), s.length >= 1 && s.every(x => x.startsWith('en:')));
    await p.click('#lpPlay'); await p.waitForTimeout(80);

    // 4. 全部顯示＋只唸中文
    await p.click('#lpShow [data-v="all"]'); await p.click('#lpSay [data-v="zh"]'); await p.waitForTimeout(80);
    await clear(); await p.click('#lpAuto'); await p.waitForTimeout(1300);
    s = await spoken(); need('只唸中文 ' + JSON.stringify(s.slice(0, 3)), s.length >= 2 && s.every(x => x.startsWith('zh:')));
    // 點別的單字發音：連續播放讓路
    await p.locator('#wordList .wl-item').nth(6).locator('.wl-word').click(); await p.waitForTimeout(120);
    need('點單字發音後停止連續播放', (await p.locator('#lpAuto').innerText()).includes('連續播放'));
    const n1 = (await spoken()).length; await p.waitForTimeout(900);
    need('讓路後不再自己往下唸', (await spoken()).length === n1);

    // 5. 唸到還沒列出來的字：自動多列，並捲到看得到的地方
    await p.click('#lpSay [data-v="en"]'); await p.waitForTimeout(60);
    await p.evaluate(() => window.scrollTo(0, 0));
    const before = await p.evaluate(() => document.querySelectorAll('#wordList .wl-item').length);
    await p.locator('#wordList .wl-item').nth(before - 1).locator('.lp-play').click({ force: true }); await p.waitForTimeout(80);
    await p.click('#lpPlay'); await p.waitForTimeout(1500);
    const after = await p.evaluate(() => document.querySelectorAll('#wordList .wl-item').length);
    need('多列了 ' + before + '→' + after, after > before);
    c = await cur();
    need('正在唸的字在畫面裡', await p.evaluate(() => { const r = document.querySelector('#wordList .wl-item.is-cur').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    // 關掉自動跟隨、捲走：「定位」會亮，按了捲回來
    await p.click('#lpPlay'); await p.waitForTimeout(80);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    need('捲走後「定位」會亮', await p.evaluate(() => document.getElementById('lpLoc').classList.contains('is-away')));
    await p.click('#lpLoc'); await p.waitForTimeout(2500);
    need('按定位捲回來', await p.evaluate(() => { const r = document.querySelector('#wordList .wl-item.is-cur').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    await overflow('playing');

    // 6. 搜尋把正在唸的字篩掉：停止、控制列收起來
    await p.fill('#searchBox', 'zzzzqq'); await p.waitForTimeout(150);
    need('篩掉後控制列收起來', !(await p.evaluate(() => document.getElementById('lpNow').classList.contains('is-on'))));
    await p.fill('#searchBox', ''); await p.waitForTimeout(150);
    // 7. 離開單字庫：停止、收起來；選項記在這台裝置
    await p.click('#lpSay [data-v="both"]'); await p.click('#lpAuto'); await p.waitForTimeout(200);
    await p.click('[data-view="stats"]'); await p.waitForTimeout(200);
    need('離開後控制列收起來', !(await p.evaluate(() => document.getElementById('lpNow').classList.contains('is-on'))));
    const n2 = (await spoken()).length; await p.waitForTimeout(900);
    need('離開後不再唸', (await spoken()).length === n2);
    need('選項有存', await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('toeic-lib-v1') || '{}'); return x.show === 'all' && x.say === 'both' && x.follow === true; }));
    // 8. 語速選單跟設定是同一個
    await p.click('[data-view="browse"]'); await p.selectOption('#lpRate', '0.8'); await p.waitForTimeout(60);
    need('語速寫回設定', await p.evaluate(() => ToeicDebug.state().settings.rate === '0.8'));
    // 鍵盤（桌機）
    if (name === 'desk') {
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await p.keyboard.press('Space'); await p.waitForTimeout(150);
      need('空白鍵開始', (await p.locator('#lpAuto').innerText()).includes('暫停'));
      const a = await cur(); await p.keyboard.press('k'); await p.waitForTimeout(150);
      need('K 下一個', (await cur()).id !== a.id);
      await p.keyboard.press('Space'); await p.waitForTimeout(150);
      need('空白鍵暫停', (await p.locator('#lpAuto').innerText()).includes('連續播放'));
    }
    await ctx.close();
  }
  await b.close();
  console.log('errs', JSON.stringify(errs, null, 1));
})();
