// 把 1000 張單字卡的例句裡每個可以點的字都實際點一次（走網站自己的程式），看有沒有出錯、有沒有查不到的字。
// 用法：node sweep_extap.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { Object.defineProperty(window, 'speechSynthesis', { value: { speaking: false, pending: false, getVoices() { return []; }, cancel() {}, speak() {} }, configurable: true }); });
  await p.goto('file:///home/claude/work/site/index.html'); await p.waitForTimeout(400);
  // 先點一個字讓小字典載入
  await p.click('.tab[data-level="400"]'); await p.waitForTimeout(200);
  await p.locator('#card .example .tw').first().click(); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const words = window.TOEIC_WORDS || window.WORDS; const pop = document.getElementById('wordPop');
    const box = document.createElement('div'); box.id = 'sweepBox'; document.body.appendChild(box);
    const out = { cards: 0, tokens: 0, none: {}, name: {}, noDefs: [], formNotes: 0, markTappable: [], thrown: [], samples: [] };
    for (const w of words) {
      if (!w.ex) continue; out.cards++;
      const a = w.hl[0], bb = w.hl[1];
      box.innerHTML = '<div class="example ex-tap" data-ex="x">' + Practice.tw(w.ex.slice(0, a)) + '<mark>' + w.ex.slice(a, bb) + '</mark>' + Practice.tw(w.ex.slice(bb)) + '</div>';
      if (box.querySelector('mark .tw')) out.markTappable.push(w.w);
      for (const el of box.querySelectorAll('.tw')) {
        out.tokens++;
        try { Practice.pickWord(el); } catch (e) { out.thrown.push(el.textContent + ': ' + e.message); continue; }
        const t = pop.textContent;
        if (/沒有收錄/.test(t)) out.none[el.textContent] = (out.none[el.textContent] || 0) + 1;
        else if (/專有名詞/.test(t)) out.name[el.textContent] = (out.name[el.textContent] || 0) + 1;
        else { if (!pop.querySelector('.wp-defs span')) out.noDefs.push(el.textContent); if (/的變化形/.test(t)) out.formNotes++; if (out.samples.length < 6 && Math.random() < 0.002) out.samples.push(t.replace(/\s+/g, ' ').slice(0, 80)); }
      }
    }
    Practice.closePop(); box.remove();
    return out;
  });
  console.log(JSON.stringify({ cards: r.cards, tokens: r.tokens, none: r.none, names: Object.keys(r.name).length, nameList: Object.keys(r.name).join(' '), noDefs: r.noDefs, formNotes: r.formNotes, markTappable: r.markTappable, thrown: r.thrown, samples: r.samples, pageErrors: errs }, null, 1));
  await b.close();
})();
