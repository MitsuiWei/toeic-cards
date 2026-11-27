// 測語音挑選與語速：自動挑最自然的語音（高級／增強／Natural 優先、趣味語音不選）、語音選單、試聽、語速預設 0.7、舊的 0.85 改成 0.7。
// 用法：node test_voice.js
const { chromium } = require('playwright');
const SITE = 'file:///home/claude/work/site/index.html';
const fake = (list) => {
  window.__utter = [];
  const voices = list.map(v => ({ name: v[0], lang: v[1], voiceURI: v[2] || v[0], localService: true, default: false }));
  const f = { speaking: false, pending: false, cancel() {}, getVoices() { return voices; },
    speak(u) { window.__utter.push({ text: u.text, rate: u.rate, voice: u.voice && u.voice.name }); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 3); } };
  Object.defineProperty(window, 'speechSynthesis', { value: f, configurable: true });
  // 假語音不是真的 SpeechSynthesisVoice，真的 Utterance 不收，所以連 Utterance 一起換掉
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.addEventListener = function () {}; };
};
const IOS = [['Albert', 'en-US', 'com.apple.speech.synthesis.voice.Albert'], ['Eddy', 'en-US', 'com.apple.eloquence.en-US.Eddy'], ['Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel'],
  ['Samantha', 'en-US', 'com.apple.voice.compact.en-US.Samantha'], ['Mei-Jia', 'zh-TW', 'com.apple.voice.compact.zh-TW.Meijia']];
const cases = [
  ['iOS 只有內建', IOS, 'Samantha'],
  ['iOS 裝了增強版', IOS.concat([['Samantha', 'en-US', 'com.apple.voice.enhanced.en-US.Samantha']]), 'Samantha', 'com.apple.voice.enhanced.en-US.Samantha'],
  ['iOS 裝了高級版', IOS.concat([['Evan (Enhanced)', 'en-US', 'com.apple.voice.enhanced.en-US.Evan'], ['Ava (Premium)', 'en-US', 'com.apple.voice.premium.en-US.Ava']]), 'Ava (Premium)'],
  ['Edge', [['Microsoft David - English (United States)', 'en-US'], ['Microsoft Aria Online (Natural) - English (United States)', 'en-US'], ['Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB']], 'Microsoft Aria Online (Natural) - English (United States)'],
  ['Chrome', [['Google UK English Female', 'en-GB'], ['Google US English', 'en-US'], ['Google 國語（臺灣）', 'zh-TW']], 'Google US English'],
];
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [name, list, want, wantUri] of cases) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(fake, list);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
    await p.goto(SITE); await p.waitForTimeout(300);
    await p.click('[data-view="settings"]'); await p.waitForTimeout(100);
    const opts = await p.$$eval('#voiceSelect option', o => o.map(x => x.textContent));
    if (!opts[0].includes('目前：' + want)) errs.push(name + ': auto option should name ' + want + ' → ' + opts[0]);
    if (opts.some(o => /Albert|Eddy|Mei-Jia|國語/.test(o))) errs.push(name + ': novelty or non-English voice listed → ' + opts.join(' | '));
    await p.click('#voiceTestBtn'); await p.waitForTimeout(100);
    const u = await p.evaluate(() => window.__utter[window.__utter.length - 1]);
    if (!u || u.voice !== want) errs.push(name + ': spoke with ' + (u && u.voice) + ', want ' + want);
    if (wantUri && !(await p.evaluate(() => { const s = document.querySelector('#voiceSelect'); return s.options[1].textContent.includes('較自然'); }))) errs.push(name + ': enhanced voice should be listed first as 較自然');
    if (!u || Math.abs(u.rate - 0.7) > 1e-6) errs.push(name + ': default rate should be 0.7, got ' + (u && u.rate));
    if (name === 'Chrome') {
      const rates = await p.$$eval('select[name="rate"] option', o => o.map(x => x.value));
      if (rates.join() !== '0.2,0.5,0.6,0.7,0.8,0.9,1,1.15') errs.push('rate options ' + rates);
      await p.selectOption('select[name="rate"]', '0.5'); await p.click('#voiceTestBtn'); await p.waitForTimeout(80);
      const r5 = await p.evaluate(() => (window.__utter[window.__utter.length - 1] || {}).rate); if (r5 !== 0.5) errs.push('rate 0.5 not applied: ' + r5);
      await p.selectOption('#voiceSelect', 'Google UK English Female'); await p.click('#voiceTestBtn'); await p.waitForTimeout(80);
      const v5 = await p.evaluate(() => (window.__utter[window.__utter.length - 1] || {}).voice); if (v5 !== 'Google UK English Female') errs.push('manual voice not applied: ' + v5);
    }
    await ctx.close();
  }
  // 舊設定 0.85 → 0.7（只改一次）；使用者自己選的 1 不動；遠端同步來的舊設定也一樣
  for (const [old, want] of [['0.85', '0.7'], ['1', '1']]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(fake, IOS);
    await ctx.addInitScript(r => { if (!localStorage.getItem('toeic-cards-v1')) localStorage.setItem('toeic-cards-v1', JSON.stringify({ recs: {}, settings: { rate: r }, log: [] })); }, old);
    const p = await ctx.newPage(); await p.goto(SITE); await p.waitForTimeout(300);
    const v = await p.evaluate(() => ToeicDebug.state().settings.rate);
    if (String(v) !== want) errs.push('migrate ' + old + ' → ' + v + ', want ' + want);
    const m = await p.evaluate(() => { ToeicDebug.mergeRemote({ settings: { rate: '0.85' }, settingsUpdated: Date.now() + 5000 }); return ToeicDebug.state().settings.rate; });
    if (String(m) !== '0.7') errs.push('remote 0.85 merged as ' + m);
    const m2 = await p.evaluate(() => { ToeicDebug.mergeRemote({ settings: { rate: '0.85', rateMig: 1 }, settingsUpdated: Date.now() + 9000 }); return ToeicDebug.state().settings.rate; });
    if (String(m2) !== '0.85') errs.push('user-chosen 0.85 (after migration) should stay, got ' + m2);
    await ctx.close();
  }
  await b.close(); console.log('errs', errs);
})();
