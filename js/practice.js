/* 多益單字卡 — 「練習」分頁
 * 三種題型：單字填空（Part 5 風格）、短文閱讀（Part 6、7 風格）、聽力應答（Part 2 風格）
 * 題庫在 data/quiz_*.js，第一次進到該題型才載入。
 * 依賴 app.js 在啟動時呼叫 Practice.init(api) 傳進來的介面。
 */
(function () {
  'use strict';

  var T = null, root = null;
  var sess = null;                  // 進行中的一回練習
  var page = null;                  // null 練習首頁；'wrong' 錯題分析；'wrong-loading' 錯題分析載入題庫中
  var wf = 'all', wLimit = 20;      // 錯題列表的題型篩選、顯示幾題
  var loading = {};
  var FILES = { p5: 'data/quiz_p5.js', read: 'data/quiz_read.js', listen: 'data/quiz_listen.js' };
  var GLOBALS = { p5: 'QUIZ_P5', read: 'QUIZ_READ', listen: 'QUIZ_LISTEN' };
  var NAMES = { p5: '單字填空', read: '短文閱讀', listen: '聽力應答' };
  var DESC = {
    p5: 'Part 5 風格。一句話挖一個空，四選一，有單字題、詞性題和文法題。每回 10 題，答完有翻譯和解析。',
    read: 'Part 6、7 風格。讀一篇短文答 3 題，用的是這一級單字表裡的字。',
    listen: 'Part 2 風格。聽一個問句和三個回答，選最適合的。每回 10 題，可以重播。'
  };
  var ROUND = { p5: 10, listen: 10, read: 1 };
  var TYPES = ['p5', 'read', 'listen'];
  var L = ['A', 'B', 'C', 'D'];
  var KIND = { email: '電子郵件', notice: '公告', memo: '內部通知', advertisement: '廣告', message: '訊息',
               article: '文章', letter: '信件', announcement: '公告', review: '評論', form: '表單' };
  var BLANK = '-------';

  function init(api) {
    T = api;
    root = document.getElementById('pracRoot');
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    pop = document.createElement('div');
    pop.id = 'wordPop'; pop.className = 'word-pop'; pop.hidden = true;
    pop.setAttribute('role', 'status');
    document.body.appendChild(pop);
    pop.addEventListener('click', onPopClick);
    document.addEventListener('click', function (e) {          // 點小卡以外的地方就收起來
      if (popState && !e.target.closest('.word-pop') && !e.target.closest('.tw')) closePop();
    });
  }
  function esc(s) { return T.esc(s); }
  function data(type) { return window[GLOBALS[type]] || null; }
  function load(type, cb) {
    if (data(type)) { cb(); return; }
    if (loading[type]) { loading[type].push(cb); return; }
    loading[type] = [cb];
    var s = document.createElement('script');
    s.src = FILES[type];
    s.onload = function () { var q = loading[type] || []; loading[type] = null; q.forEach(function (f) { f(); }); };
    s.onerror = function () {
      loading[type] = null; s.remove(); T.toast('題庫載入失敗，請確認網路後再試一次');
      sess = null; if (page === 'wrong-loading') page = null; render();
    };
    document.head.appendChild(s);
  }

  /* ---------- 點一個字：顯示意思，確認後存起來 ----------
     題目、短文、聽力原文裡的每個英文字都包成 <span class="tw">。點了先顯示意思；按小卡上的「存起來」之後：
       字表裡還沒學的字 → 排到那一級新字的最前面
       字表以外的字     → 存成「自選」單字（例句就是點它的那一句）
     中文解釋來自 data/gloss.js（第一次點才載入）。 */
  var WORD_RE = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
  var pop = null, popState = null, listMap = null, glossCbs = null;
  var NOT_WORD = /\b[AaPp]\.[Mm]\.|\d(?:st|nd|rd|th)\b/g;        // A.M.／P.M. 和 25th 的 th 不是可以查的字
  function tw(text) {
    var out = '', last = 0, m, skip = [], k;
    NOT_WORD.lastIndex = 0;
    while ((k = NOT_WORD.exec(text))) skip.push([k.index, k.index + k[0].length]);
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text))) {
      if (skip.some(function (r) { return m.index >= r[0] && m.index < r[1]; })) continue;
      out += esc(text.slice(last, m.index)) + '<span class="tw">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  function exAttr(ex, zh) { return ' data-ex="' + esc(ex) + '"' + (zh ? ' data-zh="' + esc(zh) + '"' : ''); }
  var ABBR = /\b(?:Mr|Mrs|Ms|Dr|St|No|Inc|Co|Ltd|vs|etc|a\.m|p\.m|A\.M|P\.M|e\.g|i\.e)\.$/;
  function splitSentences(line) {
    var out = [], start = 0, re = /[.!?]+["')\]]*\s+/g, m;
    while ((m = re.exec(line))) {
      var end = m.index + m[0].length;
      if (ABBR.test(line.slice(start, m.index + 1))) continue;      // 縮寫後面的句點不是句尾
      if (!/^[A-Z0-9"'(\[]/.test(line.slice(end))) continue;
      out.push(line.slice(start, end)); start = end;
    }
    if (start < line.length) out.push(line.slice(start));
    return out;
  }
  /* 短文：一句一個 <span class="sent">，記下這一句（空格填上答案）當存字時的例句。
     chosen：三個空格各選了什麼（null = 還沒答，顯示成 (n)）；不給就全部填上答案。num：答案前面標 (n)。 */
  function passageBody(it, chosen, num) {
    return it.tx.split('\n').map(function (line) {
      return splitSentences(line).map(function (sen) {
        var filled = sen.replace(/\[(\d)\] -------/g, function (m, d) { var q = it.qs[Number(d) - 1]; return q.o[q.a]; });
        var html = sen.split(/(\[\d\] -------)/).map(function (part) {
          var m = /^\[(\d)\] -------$/.exec(part);
          if (!m) return tw(part);
          var i = Number(m[1]) - 1;
          if (chosen && chosen[i] === null) return '<span class="pblank">(' + m[1] + ')</span>';
          return '<mark>' + (num ? '(' + m[1] + ') ' : '') + tw(it.qs[i].o[it.qs[i].a]) + '</mark>';
        }).join('');
        return '<span class="sent"' + exAttr(filled.trim()) + '>' + html + '</span>';
      }).join('');
    }).join('\n');
  }
  function listWord(key) {
    if (!listMap) { listMap = {}; T.words().forEach(function (w) { if (!w.custom) listMap[w.w.toLowerCase()] = w; }); }
    return listMap[key] || null;
  }
  function loadGloss(cb) {
    if (window.GLOSS) { if (cb) cb(); return; }
    if (glossCbs) { if (cb) glossCbs.push(cb); return; }
    glossCbs = cb ? [cb] : [];
    var s = document.createElement('script');
    s.src = 'data/gloss.js';
    s.onload = function () { var q = glossCbs || []; glossCbs = null; q.forEach(function (f) { f(); }); };
    s.onerror = function () { glossCbs = null; s.remove(); T.toast('字典載入失敗，請確認網路後再點一次'); };
    document.head.appendChild(s);
  }
  /* 拼法剛好和字表的字一樣、但在題目裡幾乎都是另一個字的變化形：以常見的為準，字表那個在小卡裡提一句
     （minutes 多半是「分鐘」不是「會議紀錄」；found 多半是 find 的過去式不是「創立」） */
  var ALT = { minutes: 'minute', found: 'find' };
  function entry(l, f) {
    var w = listWord(l);
    if (w) return { kind: 'list', w: w, form: f };
    var e = window.GLOSS.w[l];
    if (!e) return null;
    return { kind: 'gloss', form: f, w: { w: (window.GLOSS.c || {})[l] || l, kk: e[0], ip: e[1],
      d: e.slice(2).map(function (x) { var i = x.indexOf('|'); return [x.slice(0, i), x.slice(i + 1)]; }) } };
  }
  function lookup(raw) {
    var f = raw.toLowerCase().replace(/’/g, "'").replace(/'s$/, '');
    var G = window.GLOSS, r;
    if (ALT[f] && (r = entry(ALT[f], f))) { r.alt = listWord(f); return r; }
    r = entry(f, f) || entry(G.f[f] || f, f);
    return r || { kind: G.n[f] ? 'name' : 'none', form: f };
  }
  /* 「Ms. Green」「Karen Wu」這種接在稱謂或名字後面的大寫字是人名，就算它剛好也是一般單字 */
  var TITLE = /^(Mr|Mrs|Ms|Miss|Dr|Prof|Professor)$/;
  function inName(el) {
    var raw = el.textContent, prev = el.previousElementSibling, gap = el.previousSibling;
    if (!/^[A-Z]/.test(raw) || !prev || !prev.classList.contains('tw') || !gap || gap.nodeType !== 3) return false;
    if (!/^\.? $/.test(gap.textContent)) return false;
    var pt = prev.textContent;
    return TITLE.test(pt) || (/^[A-Z]/.test(pt) && !!window.GLOSS.n[pt.toLowerCase()]);
  }
  function hlOf(ex, raw) {                     // 這個字在例句裡的位置（單字卡用來標顏色）
    if (!ex) return [0, 0];
    var m = new RegExp('(^|[^A-Za-z])(' + raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z])').exec(ex);
    if (!m) return [0, 0];
    var a = m.index + m[1].length;
    return [a, a + m[2].length];
  }
  function pickWord(el) {
    loadGloss(function () {
      var raw = el.textContent, r = inName(el) ? { kind: 'name', form: raw.toLowerCase() } : lookup(raw), c = el.closest('[data-ex]');
      var ex = c ? c.getAttribute('data-ex') : '', zh = c ? (c.getAttribute('data-zh') || '') : '';
      // 點字只是查意思；要按小卡上的「存起來」才會存（mode 是 ask-*）
      var st = { r: r, raw: raw, ex: ex, zh: zh };
      if (r.kind === 'list') {
        var rc = T.rec(r.w.id);
        st.id = r.w.id;
        st.mode = rc.st !== 'new' ? 'list-' + rc.st : rc.pri ? 'pri-old' : 'ask-pri';
      } else if (r.kind === 'gloss') {
        st.id = T.customId(r.w.w);
        st.mode = T.byId[st.id] ? 'custom-old' : 'ask-custom';
      } else st.mode = r.kind;
      var old = root.querySelector('.tw.is-picked'); if (old) old.classList.remove('is-picked');
      el.classList.add('is-picked');
      popState = st;
      renderPop();
      if (T.canSpeak() && r.kind !== 'name' && !(sess && sess.playing)) T.speak(raw.replace(/['’]s$/, ''));
    });
  }
  var ST_NAMES = { learning: '學習中', relearning: '重學中', review: '複習中' };
  function renderPop() {
    var st = popState;
    if (!st) { pop.hidden = true; return; }
    var r = st.r, h = '<button type="button" class="wp-x" data-wp="close" aria-label="關閉">×</button>';
    if (r.kind === 'name' || r.kind === 'none') {
      h += '<div class="wp-head"><b class="wp-plain" lang="en">' + esc(st.raw) + '</b></div><p class="wp-msg">' +
        (r.kind === 'name' ? '專有名詞（人名、公司名或地名），不用背。' : '這個字沒有收錄中文解釋。') + '</p>';
    } else {
      var w = r.w, msg, btn = '', save = false;
      h += '<div class="wp-head"><button type="button" class="speakable wp-word" data-wp-say="' + esc(w.w) + '" lang="en"><b>' + esc(w.w) + '</b>' + T.SPK + '</button>' + T.phonHtml(w) + '</div>';
      if (r.form !== w.w.toLowerCase()) h += '<p class="wp-form"><span lang="en">' + esc(st.raw) + '</span> 是 <span lang="en">' + esc(w.w) + '</span> 的變化形</p>';
      h += '<div class="wp-defs">' + w.d.map(function (d) { return '<span><i>(' + esc(d[0]) + ')</i> ' + esc(d[1]) + '</span>'; }).join('') + '</div>';
      if (r.alt) h += '<p class="wp-form">也可能是另一個字 <span lang="en">' + esc(r.alt.w) + '</span>：' + esc(r.alt.d.map(function (d) { return '(' + d[0] + ') ' + d[1]; }).join('　')) + '</p>';
      var lv = r.kind === 'list' ? T.lvLabel(w.lv) : '';
      if (st.mode === 'ask-custom') { msg = '要存起來背嗎？會放進「自選」'; btn = '存起來'; save = true; }
      else if (st.mode === 'ask-pri') { msg = '這是「' + lv + '」還沒學的字，要存起來優先背嗎？'; btn = '存起來'; save = true; }
      else if (st.mode === 'pri-new') { msg = '<b class="wp-ok">已存起來</b>，下次背「' + lv + '」的新字會先出這個字'; btn = '取消'; }
      else if (st.mode === 'pri-old') { msg = '之前存過了，會先出現在「' + lv + '」的新字裡'; btn = '取消'; }
      else if (st.mode === 'custom-new') { msg = '<b class="wp-ok">已存到「自選」</b>，之後會排進單字卡'; btn = '取消'; }
      else if (st.mode === 'custom-old') { msg = '之前存過了，在「自選」裡'; btn = '移除'; }
      else if (st.mode === 'list-known') msg = '這個字你已經標成「已會」';
      else if (st.mode === 'list-suspended') msg = '這個字在「' + lv + '」裡，被你停用了';
      else msg = '這個字你已經在背了（' + lv + '・' + (ST_NAMES[st.mode.slice(5)] || '') + '）';
      h += '<div class="wp-status"><span>' + msg + '</span>' +
        (btn ? '<button type="button" class="tool-btn' + (save ? ' wp-save' : '') + '" data-wp="' + (save ? 'save' : 'undo') + '">' + btn + '</button>' : '') + '</div>';
    }
    pop.innerHTML = h;
    pop.hidden = false;
  }
  function closePop() {
    popState = null; pop.hidden = true;
    var old = root.querySelector('.tw.is-picked'); if (old) old.classList.remove('is-picked');
  }
  function onPopClick(e) {
    e.stopPropagation();                       // 小卡裡的點擊不要被當成「點外面」而關掉
    var say = e.target.closest('[data-wp-say]');
    if (say) { T.speak(say.getAttribute('data-wp-say'), say); return; }
    var b = e.target.closest('[data-wp]');
    if (!b || !popState) return;
    var act = b.getAttribute('data-wp'), st = popState;
    if (act === 'close') { closePop(); return; }
    if (act === 'save') {                      // 確認要存
      if (st.mode === 'ask-pri') { T.prioritize(st.id, true); st.mode = 'pri-new'; }
      else if (st.mode === 'ask-custom') {
        var w = st.r.w;
        T.addCustom({ w: w.w, kk: w.kk, ip: w.ip, d: w.d, ex: st.ex, zh: st.zh, hl: hlOf(st.ex, st.raw) });
        st.mode = 'custom-new';
      }
    } else if (act === 'undo') {               // 取消／移除之後回到「要存嗎」
      if (st.mode === 'pri-new' || st.mode === 'pri-old') { T.prioritize(st.id, false); st.mode = 'ask-pri'; }
      else if (st.mode === 'custom-new' || st.mode === 'custom-old') { T.removeCustom(st.id); st.mode = 'ask-custom'; }
    }
    renderPop();
  }

  /* ---------- 成績 ---------- */
  function pr(type) { return T.state().practice[type]; }
  function lvOf(type, id) {
    if (type === 'p5' && String(id).charAt(0) === 'p') { var w = T.byId[Number(String(id).slice(1))]; return w ? w.lv : 0; }
    return Number(String(id).slice(1, 4));
  }
  function inLevel(lv) { var f = T.levelFilter(); return f === 'all' || lv === f; }
  function perQ(type) { return type === 'read' ? 3 : 1; }
  /* 目前級別的累計：total 題庫數、done 做過的題（篇）數、n 作答題數、c 答對題數 */
  function summary(type, level) {
    var meta = (window.QUIZ_META || {})[type] || {};
    var f = level === undefined ? T.levelFilter() : level;
    var total = 0;
    Object.keys(meta).forEach(function (k) { if (f === 'all' || Number(k) === f) total += meta[k]; });
    var done = 0, n = 0, c = 0, p = pr(type);
    Object.keys(p).forEach(function (id) {
      var r = p[id]; if (!r || !r[0]) return;
      var lv = lvOf(type, id);
      if (!(f === 'all' || lv === f)) return;
      done++; n += r[0] * perQ(type); c += r[1];
    });
    return { total: total, done: done, n: n, c: c };
  }
  function pct(c, n) { return n ? Math.round(c / n * 100) + '%' : '–'; }
  /* 每題的紀錄：[作答次數, 累計答對題數, 最後作答時間, 最後一次答對題數, 最後一次選的選項]
     最後一欄是選項編號組成的字串：單字填空、聽力一個數字（"2"），閱讀三題三個數字（"203"）。錯題分析用。 */
  function record(type, id, correct, qCount, chosen) {
    var p = pr(type), r = p[id] || [0, 0, 0, 0];
    p[id] = [r[0] + 1, r[1] + correct, Date.now(), correct, String(chosen)];
    var s = T.state(), k = T.todayKey();
    var d = s.pday[k] = s.pday[k] || {};
    var a = d[type] || [0, 0];
    d[type] = [a[0] + qCount, a[1] + correct];
    d.t = Date.now();
    T.notePractice(type, id);
    T.save();
  }
  function learned(wid) { var st = T.rec(wid).st; return st !== 'new' && st !== 'suspended'; }
  /* 錯題 = 最近一次作答沒有全對的題（閱讀是整篇 3 題沒全對） */
  function isWrong(type, r) { return !!r && r[0] > 0 && r[3] < perQ(type); }
  /* 目前級別還沒訂正的錯題：q 題數、u 單位數（閱讀是篇數）。只看紀錄，不用載入題庫 */
  function wrongCount(type) {
    var p = pr(type), q = 0, u = 0;
    Object.keys(p).forEach(function (id) {
      var r = p[id];
      if (isWrong(type, r) && inLevel(lvOf(type, id))) { q += perQ(type) - r[3]; u++; }
    });
    return { q: q, u: u };
  }

  /* 答錯單字填空：把那個字排回單字卡 */
  function sendBack(wid) {
    var r = T.rec(wid), now = Date.now();
    if (r.st === 'review') { T.setRec(wid, T.SRS.apply(r, 1, now)); return '已排回單字卡，10 分鐘後複習'; }
    if (r.st === 'known') { T.setRec(wid, Object.assign(T.SRS.newRecord(), { last: now })); return '原本標成「已會」，已改回新字'; }
    return '';
  }

  /* ---------- 出題 ---------- */
  /* 單字填空裡的文法題：沒有對應的單字（沒有 wid），t = gv 動詞／gp 介系詞／gc 連接詞／gn 代名詞／go 關係詞與其他 */
  var GRAM_PER_ROUND = 2;
  var P5_TAG = { v: '單字題', f: '詞性題', gv: '文法題・動詞', gp: '文法題・介系詞', gc: '文法題・連接詞', gn: '文法題・代名詞', go: '文法題・關係詞與其他' };
  function isGram(it) { return it.wid === undefined; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pick(type, wrongOnly) {
    var p = pr(type), scope = T.state().settings.practiceScope;
    if (wrongOnly) {                                         // 重做錯題：只出最近一次答錯的，久沒做的先
      var ws = data(type).filter(function (it) { return inLevel(it.lv) && isWrong(type, p[it.id]); });
      ws.sort(function (a, b) { return p[a.id][2] - p[b.id][2]; });
      ws = ws.slice(0, ROUND[type]);
      return { items: type === 'read' ? ws : shuffle(ws), padded: 0 };
    }
    var fresh = [], wrong = [], right = [], outside = [], gram = [];
    data(type).forEach(function (it) {
      if (!inLevel(it.lv)) return;
      var r = p[it.id], seen = r && r[0] > 0;
      if (type === 'p5' && isGram(it)) { gram.push(it); return; }          // 文法題另外挑（和學過哪些字無關）
      if (type === 'p5' && scope === 'learned' && !learned(it.wid)) { outside.push(it); return; }
      if (!seen) fresh.push(it);
      else if (r[3] < perQ(type)) wrong.push(it);
      else right.push(it);
    });
    function byT(a, b) { return p[a.id][2] - p[b.id][2]; }
    shuffle(fresh); wrong.sort(byT); right.sort(byT);
    var n = ROUND[type], out = [];
    if (type === 'read') {
      out = fresh.concat(wrong, right).slice(0, n);
    } else {
      // 單字填空每回帶 GRAM_PER_ROUND 題文法題：之前錯的先（最多 1 題），再來沒做過的，最後是答對過、最久沒做的
      var g = [];
      if (gram.length) {
        var gf = [], gw = [], gr = [];
        gram.forEach(function (it) { var r = p[it.id]; if (!(r && r[0] > 0)) gf.push(it); else if (r[3] < 1) gw.push(it); else gr.push(it); });
        shuffle(gf); gw.sort(byT); gr.sort(byT);
        g = gw.slice(0, 1).concat(gf, gw.slice(1), gr).slice(0, GRAM_PER_ROUND);
      }
      var m = n - g.length;
      out = wrong.slice(0, 3);                               // 每回先帶 3 題之前錯的
      out = out.concat(fresh.slice(0, m - out.length));
      if (out.length < m) out = out.concat(wrong.slice(3, 3 + m - out.length));
      if (out.length < m) out = out.concat(right.slice(0, m - out.length));
      out = shuffle(out.concat(g));
    }
    var padded = 0;
    if (out.length < n && outside.length) {                  // 學過的字不夠，用還沒學的補
      var freshOut = shuffle(outside.filter(function (it) { return !(p[it.id] && p[it.id][0]); }));
      var rest = outside.filter(function (it) { return p[it.id] && p[it.id][0]; });
      var add = freshOut.concat(rest).slice(0, n - out.length);
      padded = add.length; out = out.concat(add);
    }
    return { items: out, padded: padded };
  }

  function start(type, wrongOnly) {
    if (type === 'listen' && !T.canSpeak()) { T.toast('這個瀏覽器不支援語音，沒辦法做聽力題'); return; }
    wrongOnly = !!wrongOnly;
    sess = { type: type, loading: true, wrongOnly: wrongOnly };
    render();
    load(type, function () {
      if (!sess || sess.type !== type) return;
      var pk = pick(type, wrongOnly);
      if (!pk.items.length) {
        sess = null; T.toast(wrongOnly ? NAMES[type] + '的錯題都訂正完了' : '這一級還沒有這種題目'); render(); return;
      }
      sess = { type: type, wrongOnly: wrongOnly, items: pk.items, padded: pk.padded, idx: 0, results: [], chosen: null, readChosen: [null, null, null], played: false };
      render();
      root.scrollIntoView({ block: 'start' });
      if (type === 'listen') playListen();
    });
  }
  function reset(hard) {
    if (sess) T.stopSpeech();
    sess = null;
    if (hard && pt) { T.stopSpeech(); pt = null; }
  }

  /* ---------- 畫面 ---------- */
  function render() {
    if (!root || !T) return;
    if (pt) { root.innerHTML = placeHtml(); return; }
    if (!sess) {
      if (page === 'wrong-loading') { root.innerHTML = '<div class="empty">載入題庫中…</div>'; return; }
      root.innerHTML = page === 'wrong' ? wrongHtml() : homeHtml();
      return;
    }
    if (sess.loading) { root.innerHTML = '<div class="empty">載入題庫中…</div>'; return; }
    if (sess.done) { root.innerHTML = doneHtml(); return; }
    var it = sess.items[sess.idx];
    root.innerHTML = topHtml() + (sess.type === 'p5' ? p5Html(it) : sess.type === 'listen' ? listenHtml(it) : readHtml(it));
  }

  function homeHtml() {
    if (T.levelFilter() === 'my') {
      return placeCardHtml() + '<div class="empty"><strong>「自選」沒有專屬的題庫</strong>這裡放的是你在練習題裡點一下存下來的字。要做練習題，請切到 400、600、800、990 或「全部」。</div>';
    }
    var h = placeCardHtml() + '<p class="prac-lead">目前練習範圍：<b>' + esc(T.levelName()) + '</b>（切換級別就換題庫）。做過的題目和成績會記下來，答錯的之後會再出。' +
      '<br><b>看到不認識的英文字，直接點它</b>：會顯示音標和中文；想背的話再按小卡上的「存起來」，就會排進單字卡。</p><div class="prac-modes">';
    TYPES.forEach(function (tp) {
      var s = summary(tp), unit = tp === 'read' ? '篇' : '題';
      h += '<button class="prac-mode" data-start="' + tp + '">' +
        '<span class="prac-mode-name">' + NAMES[tp] + '</span>' +
        '<span class="prac-mode-desc">' + DESC[tp] + '</span>' +
        '<span class="prac-mode-stat">' + (s.total ? '共 ' + s.total + ' ' + unit + '・做過 ' + s.done + ' ' + unit + '・答對率 ' + pct(s.c, s.n) : '題庫準備中') + '</span>' +
        '</button>';
    });
    h += '</div>';
    var wq = 0, ans = 0;
    TYPES.forEach(function (tp) { wq += wrongCount(tp).q; ans += summary(tp).n; });
    h += '<button class="prac-mode prac-wrong" data-act="wrong">' +
      '<span class="prac-mode-name">錯題分析</span>' +
      '<span class="prac-mode-desc">看自己哪一類題型最常錯、每一題錯在哪裡，還可以把錯題重做一次。</span>' +
      '<span class="prac-mode-stat">' + (ans ? (wq ? '還沒訂正的錯題 ' + wq + ' 題' : '目前沒有錯題') : '做過練習之後這裡才會有資料') + '</span>' +
      '</button>';
    var sc = T.state().settings.practiceScope;
    h += '<div class="prac-scope"><span>單字填空出題範圍</span>' +
      '<button class="chip' + (sc === 'learned' ? ' is-on' : '') + '" data-scope="learned">只出我學過的字</button>' +
      '<button class="chip' + (sc === 'all' ? ' is-on' : '') + '" data-scope="all">這一級全部</button></div>' +
      '<p class="note">「學過的字」是指單字卡裡已經背過或標成已會的字；不夠 10 題時會用還沒學的字補滿。文法題不受這個範圍限制，每一回固定有 2 題。題目是仿多益題型的原創練習題，不是真題；落點分數是用這些題目粗估的，僅供參考。</p>';
    return h;
  }
  function topHtml() {
    var n = sess.items.length, label, pct;
    if (sess.type === 'read') {
      /* 閱讀一次一篇：標出是哪一種題型，進度條顯示這一篇 3 題答了幾題 */
      var cur = sess.items[sess.idx], done = sess.readChosen.filter(function (c) { return c !== null; }).length;
      label = cur.p === 6 ? 'Part 6・段落填空' : 'Part 7・閱讀理解';
      pct = Math.round(done / cur.qs.length * 100);
    } else {
      label = '第 ' + (sess.idx + 1) + ' / ' + n + ' 題';
      pct = Math.round(sess.idx / n * 100);
    }
    if (sess.wrongOnly) label = '重做錯題・' + label;
    return '<div class="prac-top"><b>' + NAMES[sess.type] + '</b><span>' + label + '</span>' +
      '<button class="link-btn" data-act="quit">結束練習</button></div>' +
      '<div class="prac-bar"><i style="width:' + pct + '%"></i></div>' +
      (sess.padded && sess.idx === 0 ? '<p class="note">這一級你學過的字還不夠出滿一回，其中 ' + sess.padded + ' 題用的是還沒學的字。</p>' : '');
  }
  /* ---------- 各選項解析 ----------
     題庫裡 k = 解題關鍵，n = 每個選項一筆（順序和選項 o 一樣）：
       單字填空 n[i] = [詞性, 中文, 常考用法, 為什麼對／錯]
       短文閱讀 n[i] = [中文, 用法（可空）, 為什麼對／錯]
       聽力應答 n[i] = [陷阱類型（正解是空字串）, 為什麼對／錯]
     設定「作答後的各選項解析」選「先收起來」時，要按「看解析」才展開（記在這一回的 sess.xp 裡）。
     還沒有解析的舊題目退回顯示原本的一段說明 ex。 */
  function xpOn(key) { return T.state().settings.explain !== 'fold' || !!(sess && sess.xp && sess.xp[key]); }
  function noteHtml(kind, n, isAns) {
    if (!n) return '';
    var h = '', y = n[n.length - 1];
    if (kind === 'p5') {
      h = '<span class="ox-m">' + (/^[a-z]+\.$/.test(n[0]) ? '(' + esc(n[0]) + ') ' : esc(n[0]) + '　') + esc(n[1]) + '</span>' +
        (n[2] ? '<span class="ox-u">' + esc(n[2]) + '</span>' : '');
    } else if (kind === 'read') {
      h = '<span class="ox-m">' + esc(n[0]) + '</span>' + (n[1] ? '<span class="ox-u">' + esc(n[1]) + '</span>' : '');
    }
    var label = isAns ? (kind === 'p5' ? '常考' : '正解') : (kind === 'listen' ? n[0] : '這題');
    return '<span class="ox">' + h + '<span class="ox-y' + (isAns ? ' is-ans' : '') + '"><b>' + esc(label) + '</b>' + esc(y) + '</span></span>';
  }
  /* 回饋框裡的「解題關鍵」；收起來時改成一顆「看解析」按鈕；沒有新解析的題目顯示舊的說明 */
  function keyHtml(x, key, force) {
    if (!x.n) return x.ex ? '<p class="fb-ex">' + esc(x.ex) + '</p>' : '';
    if (!force && !xpOn(key)) return '<button type="button" class="tool-btn fb-xp" data-act="xp" data-xp="' + key + '">看解析</button>';
    return '<p class="fb-key"><b>解題關鍵</b>' + esc(x.k) + '</p>';
  }
  function optsHtml(opts, ans, chosen, qi, hideText, notes, kind) {
    var answered = chosen !== null && chosen !== undefined;
    return '<div class="opts' + (hideText ? ' opts-abc' : '') + (answered && notes ? ' has-x' : '') + '">' + opts.map(function (o, i) {
      if (answered) {                                        // 作答後：不能再選，但裡面的字可以點；下面接這個選項的解析
        return '<div class="opt' + (i === ans ? ' is-correct' : i === chosen ? ' is-wrong' : ' is-dim') + '"' + (/\s/.test(o) ? exAttr(o) : '') + '>' +
          '<span class="opt-l">' + L[i] + '</span><span class="opt-b"><span class="opt-t" lang="en">' + tw(o) +
          (notes && i === chosen && i !== ans ? '<em class="opt-mine">你選的</em>' : '') + '</span>' +
          (notes ? noteHtml(kind, notes[i], i === ans) : '') + '</span></div>';
      }
      return '<button class="opt" data-opt="' + i + '"' + (qi !== undefined ? ' data-q="' + qi + '"' : '') + '>' +
        '<span class="opt-l">' + L[i] + '</span>' + (hideText ? '' : '<span class="opt-t">' + esc(o) + '</span>') + '</button>';
    }).join('') + '</div>';
  }
  function nextBtn(label) { return '<button class="reveal prac-next" data-act="next">' + label + ' <kbd>Enter</kbd></button>'; }
  function wordInfo(wid) {
    var w = T.byId[wid]; if (!w) return '';
    return '<button class="speakable fb-word" data-say="' + esc(w.w) + '"><b>' + esc(w.w) + '</b>' + T.SPK + '</button> ' + T.phonHtml(w) +
      ' <span class="fb-def">' + esc(w.d.map(function (d) { return '(' + d[0] + ') ' + d[1]; }).join('　')) + '</span>';
  }

  /* 作答後的「英文句子＋中文翻譯」：點英文或中文都會唸英文，唸到哪個字那個字就亮起來（app.js 的 karaHtml／karaStart） */
  function sentHtml(it) {
    var pre = it.q.split(BLANK)[0], ans = it.o[it.a], full = it.q.replace(BLANK, ans);
    return '<button type="button" class="speakable fb-sent" data-say="' + esc(full) + '" aria-label="聽這一句">' +
      '<span class="fb-en" lang="en">' + T.karaHtml(full, pre.length, pre.length + ans.length) + T.SPK + '</span>' +
      '<span class="fb-zh">' + esc(it.zh) + '</span></button>';
  }

  /* 單字填空 */
  function p5Html(it) {
    var answered = sess.chosen !== null;
    var parts = it.q.split(BLANK);
    var q = tw(parts[0]) + (answered ? '<mark>' + tw(it.o[it.a]) + '</mark>' : '<span class="blank"></span>') + tw(parts[1] || '');
    var h = '<div class="prac-tag">' + (P5_TAG[it.t] || '單字題') + '</div>' +
      '<div class="prac-q" lang="en"' + exAttr(it.q.replace(BLANK, it.o[it.a]), it.zh) + '>' + q + '</div>' +
      optsHtml(it.o, it.a, sess.chosen, undefined, false, answered && xpOn('q') ? it.n : null, 'p5');
    if (answered) {
      var ok = sess.chosen === it.a;
      h += '<div class="fb ' + (ok ? 'is-ok' : 'is-no') + '">' +
        '<p class="fb-head">' + (ok ? '答對了' : '答錯了，答案是 ' + esc(it.o[it.a])) + '</p>' +
        sentHtml(it) + keyHtml(it, 'q') +
        (isGram(it) ? '' : '<p class="fb-wordline">' + wordInfo(it.wid) + '</p>') +
        (sess.note ? '<p class="fb-note">' + esc(sess.note) + '</p>' : '') + '</div>' +
        nextBtn(sess.idx + 1 < sess.items.length ? '下一題' : '看這一回成績');
    }
    return h;
  }

  /* 聽力應答 */
  function listenItems(it) {
    var seq = [{ text: it.q, pause: 700 }];
    it.o.forEach(function (o, i) { seq.push({ text: L[i], pause: 250 }); seq.push({ text: o, pause: 600 }); });
    return seq;
  }
  function playListen() {
    if (!sess || sess.type !== 'listen' || sess.done) return;
    var it = sess.items[sess.idx];
    sess.playing = true; sess.played = true;
    setPlayBtn();
    T.speakSeq(listenItems(it), function () { if (sess) { sess.playing = false; setPlayBtn(); } });
  }
  function setPlayBtn() {
    var b = root.querySelector('.listen-play'); if (!b) return;
    b.classList.toggle('is-playing', !!sess.playing);
    b.querySelector('span').textContent = sess.playing ? '播放中…' : (sess.played ? '再聽一次' : '播放題目');
  }
  /* 聽力原文：問句和三個回答。點字 = 查意思並存；點喇叭 = 再聽一次 */
  function scriptHtml(it, chosen, notes) {
    return '<div class="script"><p class="script-q" lang="en"' + exAttr(it.q, it.zq) + '>' + tw(it.q) +
      ' <button type="button" class="speakable say-btn" data-say="' + esc(it.q) + '" aria-label="再聽一次問句">' + T.SPK + '</button></p>' +
      '<p class="script-zh">' + esc(it.zq) + '</p></div>' +
      '<div class="opts' + (notes ? ' has-x' : '') + '">' + it.o.map(function (o, i) {
        var cls = 'opt opt-script' + (i === it.a ? ' is-correct' : i === chosen ? ' is-wrong' : ' is-dim');
        return '<div class="' + cls + '"' + exAttr(o, it.zo[i]) + '><span class="opt-l">' + L[i] + '</span><span class="opt-b"><span class="opt-t"><span lang="en">' + tw(o) + '</span>' +
          (notes && i === chosen && i !== it.a ? '<em class="opt-mine">你選的</em>' : '') + '<small>' + esc(it.zo[i]) + '</small></span>' +
          (notes ? noteHtml('listen', notes[i], i === it.a) : '') + '</span>' +
          '<button type="button" class="speakable say-btn" data-say="' + esc(o) + '" aria-label="再聽一次這個回答">' + T.SPK + '</button></div>';
      }).join('') + '</div>';
  }
  function listenHtml(it) {
    var answered = sess.chosen !== null;
    var h = '<div class="listen-box"><button class="listen-play' + (sess.playing ? ' is-playing' : '') + '" data-act="play">' + T.SPK +
      '<span>' + (sess.playing ? '播放中…' : (sess.played ? '再聽一次' : '播放題目')) + '</span> <kbd>R</kbd></button>' +
      '<p class="note">會先唸問句，再唸 A、B、C 三個回答。選最適合的回答。作答後會顯示原文，原文裡的字可以點。</p></div>';
    if (!answered) return h + optsHtml(it.o, it.a, null, undefined, true);
    var ok = sess.chosen === it.a;
    h += scriptHtml(it, sess.chosen, xpOn('q') ? it.n : null);
    h += '<div class="fb ' + (ok ? 'is-ok' : 'is-no') + '"><p class="fb-head">' + (ok ? '答對了' : '答錯了，答案是 ' + L[it.a]) + '</p>' + keyHtml(it, 'q') + '</div>' +
      nextBtn(sess.idx + 1 < sess.items.length ? '下一題' : '看這一回成績');
    return h;
  }

  /* 短文閱讀 */
  function passageHtml(it) {
    var t = passageBody(it, sess.readChosen);
    return '<div class="passage"><div class="passage-head"><span class="kind">' + (KIND[it.k] || '短文') + '</span><b>' + esc(it.ti) + '</b></div>' +
      '<div class="passage-text" lang="en">' + t + '</div></div>';
  }
  function readHtml(it) {
    var allDone = sess.readChosen.every(function (c) { return c !== null; });
    var h = passageHtml(it);
    it.qs.forEach(function (q, i) {
      var ch = sess.readChosen[i];
      h += '<div class="rq"><p class="rq-q" lang="en"' + (it.p === 6 ? '' : exAttr(q.q)) + '>' + (it.p === 6 ? '空格 (' + (i + 1) + ')' : (i + 1) + '. ' + tw(q.q)) + '</p>' +
        optsHtml(q.o, q.a, ch, i, false, ch !== null && xpOn('q' + i) ? q.n : null, 'read');
      if (ch !== null) h += '<div class="fb ' + (ch === q.a ? 'is-ok' : 'is-no') + '"><p class="fb-head">' + (ch === q.a ? '答對了' : '答錯了，答案是 ' + esc(q.o[q.a])) + '</p>' + keyHtml(q, 'q' + i) + '</div>';
      h += '</div>';
    });
    if (allDone) {
      var score = sess.readScore;
      var chips = (it.w || []).map(function (wid) {
        var w = T.byId[wid]; if (!w) return '';
        return '<button class="speakable wchip" data-say="' + esc(w.w) + '"><b>' + esc(w.w) + '</b> ' + esc(w.d[0][1]) + '</button>';
      }).join('');
      h += '<div class="read-after"><p class="fb-head">這一篇答對 ' + score + ' / 3</p>' +
        '<details class="read-zh"><summary>看全文中文翻譯</summary><div class="passage-text">' + esc(it.zh) + '</div></details>' +
        (chips ? '<p class="read-words-h">這一篇用到的單字表單字（點一下發音）</p><div class="wchips">' + chips + '</div>' : '') +
        (T.canSpeak() ? '<button class="tool-btn" data-act="readaloud">唸全文給我聽</button>' : '') + '</div>' +
        nextBtn(sess.wrongOnly ? '下一篇錯題' : '下一篇') +
        '<button class="link-btn prac-home" data-act="quit">' + (page === 'wrong' ? '回錯題分析' : '回練習首頁') + '</button>';
    }
    return h;
  }

  function doneHtml() {
    var n = sess.results.length, c = sess.results.filter(function (r) { return r.ok; }).length;
    var miss = sess.results.filter(function (r) { return !r.ok; });
    var h = '<div class="prac-done"><strong>這一回答對 ' + c + ' / ' + n + '</strong>';
    var left = wrongCount(sess.type).u;
    if (!miss.length) h += '<p>全部答對。' + (sess.wrongOnly && !left ? '這一類的錯題都訂正完了。' : '') + '</p>';
    else {
      h += '<p>答錯的 ' + miss.length + ' 題' + (sess.wrongOnly ? '還留在錯題裡：' : '，之後的練習會再出一次，也可以到「錯題分析」看：') + '</p><ul class="miss">';
      miss.forEach(function (r) {
        var it = r.it;
        if (sess.type === 'p5') h += '<li><b>' + esc(it.o[it.a]) + '</b><span lang="en">' + esc(it.q.replace(BLANK, '____')) + '</span></li>';
        else h += '<li><b lang="en">' + esc(it.q) + '</b><span lang="en">' + esc(it.o[it.a]) + '</span></li>';
      });
      h += '</ul>';
    }
    h += '<div class="btn-row">' +
      (sess.wrongOnly ? (left ? '<button class="reveal" data-act="again">再做一回錯題 <kbd>Enter</kbd></button>' : '')
                      : '<button class="reveal" data-act="again">再來一回 <kbd>Enter</kbd></button>') +
      '<button class="tool-btn" data-act="quit">' + (page === 'wrong' ? '回錯題分析' : '回練習首頁') + '</button>' +
      (page !== 'wrong' && miss.length ? '<button class="tool-btn" data-act="wrong">看錯題分析</button>' : '') +
      '</div></div>';
    return h;
  }

  /* ---------- 錯題分析 ---------- */
  /* 分類：[代號, 題型, 類別名稱, 做題提示] */
  var CATS = [
    ['pv', 'p5', '單字題（選意思對的字）', '多半是字義還不熟。答錯的字已經自動排回單字卡，照卡片複習就會補起來。'],
    ['pf', 'p5', '詞性題（選對的詞性）', '先不要看意思，看空格前後判斷詞性：冠詞、形容詞後面是名詞；be 動詞後面多半是形容詞；修飾動詞的是副詞；助動詞（can、will）後面是原形動詞。'],
    ['pgv', 'p5', '文法題：動詞（時態、被動、to V／V-ing）', '先找時間的線索（since、last week、by next month）決定時態，再看主詞是「做動作」還是「被做」決定主動或被動；空格後面沒有受詞多半是被動。'],
    ['pgp', 'p5', '文法題：介系詞', '介系詞多半是固定搭配，要跟著前面的動詞、形容詞一起記（depend on、responsible for）。時間：at 幾點、on 日期、in 月份或年；by 是「在…之前完成」，until 是「持續到…」。'],
    ['pgc', 'p5', '文法題：連接詞／介系詞／副詞', '看空格後面：接完整句子（主詞＋動詞）用連接詞（although、because）；接名詞用介系詞（despite、because of）；前後有逗號或分號隔開的是副詞（however、therefore）。'],
    ['pgn', 'p5', '文法題：代名詞', '看空格在句子裡的位置：動詞前面是主格（he）、動詞或介系詞後面是受格（him）、名詞前面是所有格（his）；主詞和受詞是同一個人用反身代名詞（himself）。'],
    ['pgo', 'p5', '文法題：關係詞、比較級、數量詞', '關係詞看前面的名詞：人用 who、事物用 which、後面接名詞表示「…的」用 whose。有 than 用比較級，有 the 和範圍（in the company）用最高級。'],
    ['r6', 'read', 'Part 6 段落填空', '空格前後兩句都要讀。連接詞題先判斷前後句的關係是轉折（However）、因果（Therefore）還是補充（In addition）。'],
    ['r7main', 'read', '主旨題（目的、主題）', '主旨通常在主旨欄（Subject）或開頭一兩句，先讀那裡再看選項。'],
    ['r7detail', 'read', '細節題（誰、何時、多少）', '用題目裡的關鍵字（人名、日期、數字）回文章找到那一句，答案就在附近。'],
    ['r7infer', 'read', '推論題（most likely、suggested）', '答案不會照抄原文，但文章裡一定有一句能支持它；文章沒講的事不能選。'],
    ['r7not', 'read', 'NOT 題（哪一個沒提到）', '把四個選項逐一回文章核對，三個找得到，找不到的那個就是答案。'],
    ['r7vocab', 'read', '字義題（closest in meaning）', '把選項代回原句，放進去之後句子意思不變的才是答案；不要只選這個字最常見的意思。'],
    ['r7x', 'read', 'Part 7（舊紀錄，沒有分題型）', ''],
    ['lwh', 'listen', 'WH 問句（Who、Where、When…）', '最重要的是聽清楚第一個字。WH 問句不會用 Yes／No 回答，聽到 Yes／No 開頭可以直接刪掉。'],
    ['lyesno', 'listen', 'Yes／No 問句', '答案不一定有 Yes 或 No，重點是內容有沒有回應問題；只是重複題目裡的字的回答通常是陷阱。'],
    ['lrequest', 'listen', '請求與建議（Could you…?）', '合理的回答是答應（Sure、No problem）、婉拒加理由，或反問細節。'],
    ['lchoice', 'listen', '二選一（A or B?）', '二選一問句不會用 Yes／No 回答；答案是其中一個、都可以（Either is fine），或兩個都不要。'],
    ['lstatement', 'listen', '陳述句', '沒有固定答法，選「接得下去」的回應：表示同意、提出解決方法，或追問。'],
    ['ltag', 'listen', '附加問句（…, isn\'t it?）', '不用管句尾的 isn\'t it，當成一般的 Yes／No 問句回答就好。'],
    ['lnegative', 'listen', '否定問句（Didn\'t you…?）', '照肯定問句回答：事實是「有」就答 Yes，「沒有」就答 No，和中文的習慣相反。']
  ];
  function qKind(q) {
    if (/\bNOT\b/.test(q)) return 'not';
    if (/closest in meaning/i.test(q)) return 'vocab';
    if (/purpose|mainly about|main topic|mainly discuss|mainly intended|overall opinion|is being (advertised|announced|reviewed|discussed)|are the writers discussing|Why (was|is|did|does|has) [\w\-' .]+ (written|sent|writing|write|send|posted|issued)/i.test(q)) return 'main';
    if (/suggest|impl(y|ied|ies)|infer|most likely|probably|can be (said|concluded)|true about|indicated? about/i.test(q)) return 'infer';
    return 'detail';
  }
  /* 以「每一題最近一次作答」統計目前級別的成績；list 是最近一次答錯的題 */
  function collect() {
    var cats = {}, list = [], tot = { n: 0, c: 0 };
    function add(key, c, n) { var x = cats[key] = cats[key] || { n: 0, c: 0 }; x.n += n; x.c += c; }
    TYPES.forEach(function (type) {
      var p = pr(type);
      (data(type) || []).forEach(function (it) {
        var r = p[it.id];
        if (!r || !r[0] || !inLevel(it.lv)) return;
        var ch = typeof r[4] === 'string' && /^\d+$/.test(r[4]) ? r[4] : '';
        if (type === 'read') {
          tot.n += 3; tot.c += r[3];
          if (ch.length === 3) {
            it.qs.forEach(function (q, i) {
              var mine = Number(ch.charAt(i)), ok = mine === q.a;
              add(it.p === 6 ? 'r6' : 'r7' + qKind(q.q), ok ? 1 : 0, 1);
              if (!ok) list.push({ type: type, it: it, qi: i, ch: mine, r: r });
            });
          } else {                                            // 更新前的紀錄只有分數，不知道錯哪一題
            add(it.p === 6 ? 'r6' : 'r7x', r[3], 3);
            if (r[3] < 3) list.push({ type: type, it: it, qi: -1, ch: -1, r: r });
          }
        } else {
          tot.n++; tot.c += r[3];
          add((type === 'p5' ? 'p' : 'l') + it.t, r[3], 1);
          if (!r[3]) list.push({ type: type, it: it, ch: ch ? Number(ch) : -1, r: r });
        }
      });
    });
    list.sort(function (a, b) { return b.r[2] - a.r[2]; });
    return { cats: cats, list: list, tot: tot };
  }
  function openWrong() {
    reset();
    wf = 'all'; wLimit = 20;
    var need = TYPES.filter(function (t) { return !data(t); });
    if (!need.length) { page = 'wrong'; render(); return; }
    page = 'wrong-loading'; render();
    var left = need.length;
    need.forEach(function (t) { load(t, function () { if (--left === 0 && page === 'wrong-loading') { page = 'wrong'; render(); } }); });
  }
  function wrongItemHtml(e) {
    var it = e.it, r = e.r, sum, body;
    if (e.type === 'p5') {
      sum = '<span class="wq-tag">單字填空</span><span class="wq-q" lang="en">' + esc(it.q.replace(BLANK, '____')) + '</span>';
      var pp = it.q.split(BLANK);
      body = '<p class="wq-sent" lang="en"' + exAttr(it.q.replace(BLANK, it.o[it.a]), it.zh) + '>' + tw(pp[0]) + '<mark>' + tw(it.o[it.a]) + '</mark>' + tw(pp[1] || '') + '</p>' +
        optsHtml(it.o, it.a, e.ch, undefined, false, it.n, 'p5') +
        sentHtml(it) + keyHtml(it, 'q', true) + (isGram(it) ? '' : '<p class="fb-wordline">' + wordInfo(it.wid) + '</p>');
    } else if (e.type === 'listen') {
      sum = '<span class="wq-tag">聽力應答</span><span class="wq-q" lang="en">' + esc(it.q) + '</span>';
      body = scriptHtml(it, e.ch, it.n) + keyHtml(it, 'q', true);
    } else {
      var psg = '<details class="read-zh"><summary>看這篇短文</summary><div class="passage-text" lang="en">' + passageBody(it, null, true) + '</div></details>';
      if (e.qi < 0) {
        sum = '<span class="wq-tag">閱讀 Part ' + it.p + '</span><span class="wq-q"><span lang="en">' + esc(it.ti) + '</span>　上次答對 ' + r[3] + ' / 3</span>';
        body = psg + '<p class="fb-ex">這一篇是功能更新前做的，當時沒有記下錯的是哪一題。重做一次之後，這裡就會列出錯的那一題。</p>';
      } else {
        var q = it.qs[e.qi];
        sum = '<span class="wq-tag">閱讀 Part ' + it.p + '</span><span class="wq-q" lang="en">' + (it.p === 6 ? esc(it.ti) + '：空格 (' + (e.qi + 1) + ')' : esc(q.q)) + '</span>';
        body = psg + (it.p === 7 ? '<p class="wq-sent" lang="en"' + exAttr(q.q) + '>' + tw(q.q) + '</p>' : '') + optsHtml(q.o, q.a, e.ch, undefined, false, q.n, 'read') + keyHtml(q, 'q', true);
      }
    }
    var times = e.type === 'read' ? '做過 ' + r[0] + ' 次' : '做 ' + r[0] + ' 次・錯 ' + (r[0] - r[1]) + ' 次';
    return '<details class="wq"><summary>' + sum + '<span class="wq-n">' + times + '</span></summary><div class="wq-body">' + body + '</div></details>';
  }
  function wrongHtml() {
    var d = collect(), wc = {}, tw = 0;
    TYPES.forEach(function (tp) { wc[tp] = { q: 0, u: wrongCount(tp).u }; });
    d.list.forEach(function (e) { wc[e.type].q += e.type === 'read' && e.qi < 0 ? 3 - e.r[3] : 1; });
    TYPES.forEach(function (tp) { tw += wc[tp].q; });
    if (wf !== 'all' && !wc[wf].q) wf = 'all';
    var h = '<div class="prac-top"><b>錯題分析</b><span>' + esc(T.levelName()) + '</span><button class="link-btn" data-act="wrong-home">回練習首頁</button></div>';
    if (!d.tot.n) {
      return h + '<div class="empty"><strong>還沒有資料</strong>這一級還沒做過練習題。先做幾回練習，這裡就會列出你的錯題，並統計哪一類題型最常錯。' +
        '<br><button class="tool-btn" data-act="wrong-home">去做練習</button></div>';
    }
    h += '<div class="stat-row wa-stats"><div class="stat"><b>' + d.tot.n + '</b><span>做過題數</span></div>' +
      '<div class="stat"><b>' + pct(d.tot.c, d.tot.n) + '</b><span>答對率</span></div>' +
      '<div class="stat"><b>' + tw + '</b><span>待訂正錯題</span></div></div>';

    /* 弱點：每類至少 5 題才比較 */
    var rows = CATS.filter(function (c) { return d.cats[c[0]]; });
    var weak = null;
    rows.forEach(function (c) {
      var x = d.cats[c[0]];
      if (x.n >= 5 && c[3] && (!weak || x.c / x.n < d.cats[weak[0]].c / d.cats[weak[0]].n)) weak = c;
    });
    if (weak && d.cats[weak[0]].c / d.cats[weak[0]].n >= 0.8) weak = null;
    var enough = rows.some(function (c) { return d.cats[c[0]].n >= 5; });
    h += '<h2 class="stat-h">哪一類最常錯</h2>';
    if (weak) {
      var wx = d.cats[weak[0]];
      h += '<div class="wa-weak"><p class="wa-weak-h">目前最弱：' + NAMES[weak[1]] + '的「' + esc(weak[2]) + '」，答對 ' + wx.c + ' / ' + wx.n + '（' + pct(wx.c, wx.n) + '）</p><p>' + esc(weak[3]) + '</p></div>';
    } else {
      h += '<p class="note">' + (enough ? '做滿 5 題的類別答對率都在 80% 以上，目前沒有明顯的弱點。' : '每一類至少要做 5 題，才看得出哪一類比較弱；先多做幾回。') + '</p>';
    }
    h += '<div class="wa-cats">';
    var lastGroup = '';
    rows.forEach(function (c) {
      var x = d.cats[c[0]], p = x.c / x.n;
      if (c[1] !== lastGroup) { h += '<p class="wa-group">' + NAMES[c[1]] + '</p>'; lastGroup = c[1]; }
      h += '<div class="wa-row' + (weak === c ? ' is-weak' : '') + (x.n < 5 ? ' is-few' : '') + '"><span class="wa-name">' + esc(c[2]) + '</span>' +
        '<div class="lb-bar"><i class="' + (p >= 0.8 ? 'seg-review' : p >= 0.6 ? 'seg-mid' : 'seg-learning') + '" style="width:' + Math.max(p * 100, 2) + '%"></i></div>' +
        '<span class="lb-num">' + x.c + ' / ' + x.n + '・' + pct(x.c, x.n) + '</span></div>';
    });
    h += '</div><p class="note">答對率以每一題「最近一次作答」計算，重做答對就不算錯。長條綠色是 80% 以上、橘色 60–79%、紅色不到 60%；做不到 5 題的類別顏色較淡，僅供參考。</p>';

    h += '<h2 class="stat-h">錯題（' + tw + ' 題）</h2>';
    if (!d.list.length) return h + '<p class="note">目前沒有還沒訂正的錯題。</p>';
    h += '<div class="prac-scope wa-redo"><span>重做錯題</span>' + TYPES.map(function (tp) {
      return wc[tp].u ? '<button class="tool-btn" data-redo="' + tp + '">' + NAMES[tp] + ' ' + wc[tp].u + (tp === 'read' ? ' 篇' : ' 題') + '</button>' : '';
    }).join('') + '</div>';
    h += '<div class="prac-scope"><button class="chip' + (wf === 'all' ? ' is-on' : '') + '" data-wf="all">全部 ' + tw + '</button>' + TYPES.map(function (tp) {
      return wc[tp].q ? '<button class="chip' + (wf === tp ? ' is-on' : '') + '" data-wf="' + tp + '">' + NAMES[tp] + ' ' + wc[tp].q + '</button>' : '';
    }).join('') + '</div>';
    var shown = d.list.filter(function (e) { return wf === 'all' || e.type === wf; });
    h += '<div class="wq-list">' + shown.slice(0, wLimit).map(wrongItemHtml).join('') + '</div>';
    if (shown.length > wLimit) h += '<div class="wl-more"><button class="tool-btn" data-act="wrong-more">顯示更多（還有 ' + (shown.length - wLimit) + ' 題）</button></div>';
    h += '<p class="note">點一題可以看你選了什麼（紅色）、正確答案（綠色）和解析。新的排在前面。</p>';
    return h;
  }

  /* ---------- 作答 ---------- */
  function answer(i, qi) {
    if (!sess || sess.done || sess.loading) return;
    var it = sess.items[sess.idx];
    if (sess.type === 'read') {
      if (qi === undefined || sess.readChosen[qi] !== null) return;
      sess.readChosen[qi] = i;
      if (sess.readChosen.every(function (c) { return c !== null; })) {
        var score = 0;
        it.qs.forEach(function (q, k) { if (sess.readChosen[k] === q.a) score++; });
        sess.readScore = score;
        record('read', it.id, score, 3, sess.readChosen.join(''));
        T.renderTabs();
      }
      render();
      return;
    }
    if (sess.chosen !== null || i >= it.o.length) return;
    sess.chosen = i;
    var ok = i === it.a;
    sess.note = '';
    if (sess.type === 'p5' && !ok && !isGram(it)) sess.note = sendBack(it.wid);
    if (sess.type === 'listen') { T.stopSpeech(); sess.playing = false; }
    sess.results.push({ it: it, ok: ok });
    record(sess.type, it.id, ok ? 1 : 0, 1, i);
    if (sess.note) T.renderTabs();
    render();
  }
  function next() {
    if (!sess || sess.done || sess.loading) return;
    if (sess.type === 'read') {
      if (!sess.readChosen.every(function (c) { return c !== null; })) return;
      T.stopSpeech();
      start('read', sess.wrongOnly);                 // 閱讀一回一篇，直接換下一篇
      return;
    }
    if (sess.chosen === null) return;
    T.stopSpeech();
    if (sess.idx + 1 >= sess.items.length) { sess.done = true; render(); return; }
    sess.idx++; sess.chosen = null; sess.note = ''; sess.played = false; sess.playing = false; sess.xp = {};
    render();
    root.scrollIntoView({ block: 'start' });
    if (sess.type === 'listen') playListen();
  }

  function onClick(e) {
    var t = e.target;
    if (placeClick(t)) return;
    var word = t.closest('.tw');
    if (word) { pickWord(word); return; }
    var st = t.closest('[data-start]');
    if (st) { start(st.getAttribute('data-start')); return; }
    var sc = t.closest('[data-scope]');
    if (sc) {
      var s = T.state(); s.settings.practiceScope = sc.getAttribute('data-scope'); s.settingsUpdated = Date.now();
      T.save(); render(); return;
    }
    var say = t.closest('[data-say]');
    if (say) { T.speak(say.getAttribute('data-say'), say); return; }
    var opt = t.closest('[data-opt]');
    if (opt && !opt.disabled) {
      var q = opt.getAttribute('data-q');
      answer(Number(opt.getAttribute('data-opt')), q === null ? undefined : Number(q));
      return;
    }
    var redo = t.closest('[data-redo]');
    if (redo) { start(redo.getAttribute('data-redo'), true); return; }
    var f = t.closest('[data-wf]');
    if (f) { wf = f.getAttribute('data-wf'); wLimit = 20; render(); return; }
    var act = t.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');
    if (a === 'quit') { reset(); render(); }
    else if (a === 'next') next();
    else if (a === 'again') start(sess.type, sess.wrongOnly);
    else if (a === 'play') playListen();
    else if (a === 'xp') { if (sess) { sess.xp = sess.xp || {}; sess.xp[act.getAttribute('data-xp')] = true; render(); } }
    else if (a === 'wrong') openWrong();
    else if (a === 'wrong-home') { page = null; render(); }
    else if (a === 'wrong-more') { wLimit += 30; render(); }
    else if (a === 'readaloud') {
      var it = sess.items[sess.idx];
      var text = it.tx.replace(/\[(\d)\] -------/g, function (m, d) { var q = it.qs[Number(d) - 1]; return q.o[q.a]; });
      T.speak(text.replace(/\n+/g, '. '), act);
    }
  }
  function onKey(e) {
    if (popState && e.key === 'Escape') { closePop(); return; }
    if (T && T.isActive() && pt && placeKey(e)) return;
    if (!T || !T.isActive() || !sess || sess.loading) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (sess.done) {
      if ((k === 'Enter' || k === ' ') && root.querySelector('[data-act="again"]')) { e.preventDefault(); start(sess.type, sess.wrongOnly); }
      return;
    }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); next(); return; }
    if (sess.type === 'listen' && (k === 'r' || k === 'R')) { playListen(); return; }
    if (sess.type === 'read') return;                 // 閱讀有三題，用點的
    var i = '1234'.indexOf(k);
    if (i < 0) i = 'abcd'.indexOf(k.toLowerCase());
    if (i >= 0 && k.length === 1) { e.preventDefault(); answer(i); }
  }


  /* ---------- 多益落點測驗＋平常練習估分 ----------
     估分的模型在 js/score.js（ToeicScore）。
     測驗：聽力 15 題 → 單字填空 16 題 → 短文 3 篇（9 題），共 40 題。每一題都挑「以目前的估計來說資訊量最大」的級別
     （答對就往難的級別出、答錯就往簡單的出），同一級裡優先出沒做過的題。作答時不顯示對錯，做完一起看。
     每一題照樣記進練習紀錄（錯題分析看得到）；單字填空答錯一樣把那個字排回單字卡。
     pt = null 沒在測；{ phase: 'intro' } 說明頁；{ phase: 'run', … } 作答中；{ phase: 'done', res } 看結果 */
  var S = window.ToeicScore;
  var pt = null;
  var PT_PARTS = [{ type: 'listen', n: 15 }, { type: 'p5', n: 16 }, { type: 'read', n: 3 }];
  var GUESS = { p5: 0.25, read: 0.25, listen: 1 / 3 };
  var LV_NAME = { 400: '衝 400 分', 600: '衝 600 分', 800: '衝 800 分', 990: '衝 990 分' };
  function places() {
    var s = T.state(), cut = s.placeCleared || 0;
    return Object.keys(s.place || {}).map(function (k) { return s.place[k]; })
      .filter(function (x) { return x && (x.t || 0) > cut; })
      .sort(function (a, b) { return b.t - a.t; });
  }
  function md(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function bandTxt(b) { return '約 ' + b[1] + ' 分（' + b[0] + '–' + b[2] + '）'; }

  /* 平常練習的估計：每一題取「第一次就答對」（全部作答都對才算；重做才答對的不算），兩科各取最近 60 題 */
  var EST_N = 60, EST_MIN = 10;
  function practiceEst() {
    var obs = { L: [], R: [] };
    TYPES.forEach(function (type) {
      var p = pr(type);
      Object.keys(p).forEach(function (id) {
        var r = p[id]; if (!r || !r[0]) return;
        var lv = lvOf(type, id); if (!S.B[lv]) return;
        if (type === 'read') {
          var k = r[0] === 1 ? r[3] : Math.floor(r[1] / r[0]);
          for (var j = 0; j < 3; j++) obs.R.push({ lv: lv, c: GUESS.read, ok: j < k, t: r[2] });
        } else {
          (type === 'listen' ? obs.L : obs.R).push({ lv: lv, c: GUESS[type], ok: r[1] >= r[0], t: r[2] });
        }
      });
    });
    var out = {};
    ['L', 'R'].forEach(function (k) {
      var o = obs[k].sort(function (a, b) { return b.t - a.t; }).slice(0, EST_N);
      out[k] = o.length >= EST_MIN ? S.estimate(o) : null;
      out['n' + k] = o.length;
    });
    return out;
  }
  function estLine() {
    var e = practiceEst();
    if (e.L && e.R) return { txt: bandTxt(S.total(e.L, e.R)), sub: '聽力 ' + bandTxt(S.band(e.L)) + '・閱讀 ' + bandTxt(S.band(e.R)), e: e };
    var need = [];
    if (!e.L) need.push('聽力再做 ' + (EST_MIN - e.nL) + ' 題');
    if (!e.R) need.push('閱讀（單字填空或短文）再做 ' + (EST_MIN - e.nR) + ' 題');
    return { txt: '', sub: (e.R ? '閱讀 ' + bandTxt(S.band(e.R)) + '。' : e.L ? '聽力 ' + bandTxt(S.band(e.L)) + '。' : '') + '要估總分：' + need.join('、'), e: e };
  }
  /* 統計頁上方的估計分數 */
  function estHtml() {
    var l = estLine(), last = places()[0];
    return '<div class="pt-est"><p class="pt-est-h">估計多益分數</p>' +
      (l.txt ? '<p class="pt-est-big">' + l.txt + '</p>' : '') + '<p class="pt-est-sub">' + esc(l.sub) + '</p>' +
      (last ? '<p class="pt-est-sub">上次落點測驗（' + md(last.t) + '）：' + (last.S ? bandTxt(last.S) : '閱讀 ' + bandTxt(last.R)) + '</p>' : '') +
      '<p class="note">依平常練習每一題第一次作答的結果估計（兩科各取最近 ' + EST_N + ' 題），題目越多越準。這是粗估，不是官方分數；聽力目前只有 Part 2 應答題。</p>' +
      '<button class="tool-btn" data-goto="place">' + (last ? '再做一次落點測驗' : '做落點測驗（約 15 分鐘）') + '</button></div>';
  }
  /* 練習首頁的卡片 */
  function placeCardHtml() {
    var last = places()[0], l = estLine();
    var stat = last ? '上次（' + md(last.t) + '）：' + (last.S ? bandTxt(last.S) : '閱讀 ' + bandTxt(last.R)) : '還沒測過';
    if (l.txt) stat += '　平常練習估計：' + l.txt;
    return '<button class="prac-mode prac-place" data-act="pt-intro">' +
      '<span class="prac-mode-name">多益落點測驗</span>' +
      '<span class="prac-mode-desc">約 40 題、15 分鐘。題目會依你答對答錯調整難度，做完估一個多益分數區間，並建議該練哪一級。</span>' +
      '<span class="prac-mode-stat">' + esc(stat) + '</span></button>';
  }

  function openPlace() { reset(); page = null; if (!pt || pt.phase !== 'run') pt = { phase: 'intro' }; render(); }
  function startPlace() {
    var noL = !T.canSpeak();
    var need = TYPES.filter(function (t) { return !data(t) && !(noL && t === 'listen'); });
    pt = { phase: 'loading' }; render();
    var left = need.length;
    function go() {
      if (!pt || pt.phase !== 'loading') return;
      pt = { phase: 'run', noL: noL, parts: PT_PARTS.filter(function (x) { return !(noL && x.type === 'listen'); }),
             pi: 0, k: 0, used: {}, obs: { L: [], R: [] }, ans: [], sent: 0, t0: Date.now() };
      pt.total = pt.parts.reduce(function (a, x) { return a + (x.type === 'read' ? x.n * 3 : x.n); }, 0);
      pt.doneQ = 0;
      nextPlace();
    }
    if (!left) go();
    else need.forEach(function (t) { load(t, function () { if (--left === 0) go(); }); });
  }
  /* 同一級裡：沒做過的先（隨機），再來是最久沒做的；這一級用完了就找最近的級別 */
  function pickPlace(type, lv) {
    var p = pr(type), order = S.LEVELS.slice().sort(function (a, b) { return Math.abs(a - lv) - Math.abs(b - lv); });
    for (var i = 0; i < order.length; i++) {
      var c = data(type).filter(function (it) { return it.lv === order[i] && !pt.used[it.id]; });
      if (!c.length) continue;
      var fresh = c.filter(function (it) { return !(p[it.id] && p[it.id][0]); });
      if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
      c.sort(function (a, b) { return p[a.id][2] - p[b.id][2]; });
      return c[0];
    }
    return null;
  }
  function nextPlace() {
    T.stopSpeech();
    while (pt.pi < pt.parts.length && pt.k >= pt.parts[pt.pi].n) { pt.pi++; pt.k = 0; }
    if (pt.pi >= pt.parts.length) { finishPlace(); render(); root.scrollIntoView({ block: 'start' }); return; }
    var type = pt.parts[pt.pi].type, sec = type === 'listen' ? 'L' : 'R';
    var lv = S.bestLevel(S.estimate(pt.obs[sec]), GUESS[type]);
    var it = pickPlace(type, lv);
    if (!it) { pt.k = pt.parts[pt.pi].n; nextPlace(); return; }
    pt.used[it.id] = true;
    pt.it = it; pt.type = type; pt.sel = null; pt.rsel = [null, null, null]; pt.playing = false; pt.played = false; pt.replays = 0;
    render();
    root.scrollIntoView({ block: 'start' });
    if (type === 'listen') playPlace();
  }
  function playPlace() {
    if (!pt || pt.type !== 'listen') return;
    var tok = pt.tok = (pt.tok || 0) + 1;              // 換題後，上一題的播放結束通知不要算到這一題
    pt.playing = true; renderPlay();
    T.speakSeq(listenItems(pt.it), function () { if (pt && pt.tok === tok && pt.playing) { pt.playing = false; pt.played = true; renderPlay(); } });
  }
  function renderPlay() {
    var b = root.querySelector('.pt-play'); if (!b) return;
    b.innerHTML = playLabel();
    var r = root.querySelector('[data-act="pt-replay"]'); if (r) r.hidden = !pt.played || pt.replays > 0;
  }
  function playLabel() { return T.SPK + '<span>' + (pt.playing ? '播放中…' : pt.played ? '播完了，請作答' : '準備播放') + '</span>'; }
  function commitPlace() {
    var it = pt.it, type = pt.type;
    if (type === 'read') {
      if (pt.rsel.some(function (c) { return c === null; })) return;
      var score = 0;
      it.qs.forEach(function (q, i) {
        var ok = pt.rsel[i] === q.a; if (ok) score++;
        pt.obs.R.push({ lv: it.lv, c: GUESS.read, ok: ok });
        pt.ans.push({ type: 'read', it: it, qi: i, ch: pt.rsel[i], ok: ok });
      });
      record('read', it.id, score, 3, pt.rsel.join(''));
      pt.doneQ += 3;
    } else {
      if (pt.sel === null) return;
      var ok = pt.sel === it.a;
      pt.obs[type === 'listen' ? 'L' : 'R'].push({ lv: it.lv, c: GUESS[type], ok: ok });
      pt.ans.push({ type: type, it: it, ch: pt.sel, ok: ok });
      if (type === 'p5' && !ok && !isGram(it) && sendBack(it.wid)) pt.sent++;
      record(type, it.id, ok ? 1 : 0, 1, pt.sel);
      pt.doneQ++;
    }
    pt.k++;
    nextPlace();
  }
  function finishPlace() {
    T.stopSpeech();
    var L = pt.obs.L.length ? S.estimate(pt.obs.L) : null, R = S.estimate(pt.obs.R);
    var m = {};
    pt.ans.forEach(function (a) { var x = m[a.type] = m[a.type] || [0, 0]; x[1]++; if (a.ok) x[0]++; });
    var tot = L ? S.total(L, R) : null;
    var res = { t: pt.t0, L: L ? S.band(L) : null, R: S.band(R), S: tot, m: m, lv: S.suggest(tot ? tot[1] : S.band(R)[1] * 2) };
    var s = T.state(), key = String(pt.t0);
    s.place = s.place || {}; s.place[key] = res;
    T.notePlace(key); T.save(); T.renderTabs();
    pt = { phase: 'done', res: res, ans: pt.ans, sent: pt.sent, est: { R: R } };
  }

  function placeHtml() {
    if (pt.phase === 'loading') return '<div class="empty">載入題庫中…</div>';
    if (pt.phase === 'intro') return placeIntroHtml();
    if (pt.phase === 'done') return placeDoneHtml();
    var part = pt.parts[pt.pi], names = { listen: '聽力', p5: '單字填空', read: '短文閱讀' };
    var label = names[part.type] + ' ' + (pt.k + 1) + ' / ' + part.n + (part.type === 'read' ? ' 篇' : '');
    var h = '<div class="prac-top"><b>落點測驗</b><span>' + label + '</span><button class="link-btn" data-act="pt-quit">結束測驗</button></div>' +
      '<div class="prac-bar"><i style="width:' + Math.round(pt.doneQ / pt.total * 100) + '%"></i></div>';
    var it = pt.it;
    if (pt.type === 'listen') {
      h += '<div class="listen-box"><div class="listen-play pt-play' + (pt.playing ? ' is-playing' : '') + '">' + playLabel() + '</div>' +
        '<p class="note">和正式考試一樣只播一次：先唸問句，再唸 A、B、C 三個回答。' +
        '<button class="link-btn pt-replay" data-act="pt-replay"' + (pt.played && !pt.replays ? '' : ' hidden') + '>沒聽到聲音？重播一次</button></p></div>' +
        ptOpts(it.o.length, null, null, true);
    } else if (pt.type === 'p5') {
      var parts = it.q.split(BLANK);
      h += '<div class="prac-q" lang="en">' + esc(parts[0]) + '<span class="blank"></span>' + esc(parts[1] || '') + '</div>' + ptOpts(it.o.length, it.o, null);
    } else {
      h += '<div class="passage"><div class="passage-head"><span class="kind">' + (KIND[it.k] || '短文') + '</span><b>' + esc(it.ti) + '</b></div>' +
        '<div class="passage-text" lang="en">' + esc(it.tx).replace(/\[(\d)\] -------/g, '<span class="pblank">($1)</span>') + '</div></div>';
      it.qs.forEach(function (q, i) {
        h += '<div class="rq"><p class="rq-q" lang="en">' + (it.p === 6 ? '空格 (' + (i + 1) + ')' : (i + 1) + '. ' + esc(q.q)) + '</p>' + ptOpts(q.o.length, q.o, i) + '</div>';
      });
    }
    var ready = pt.type === 'read' ? pt.rsel.every(function (c) { return c !== null; }) : pt.sel !== null;
    var lastQ = pt.pi === pt.parts.length - 1 && pt.k === part.n - 1;
    h += '<button class="reveal prac-next" data-act="pt-next"' + (ready ? '' : ' disabled') + '>' + (lastQ ? '交卷看結果' : '下一題') + ' <kbd>Enter</kbd></button>';
    return h;
  }
  function ptOpts(n, opts, qi, abc) {
    var h = '<div class="opts' + (abc ? ' opts-abc' : '') + '">';
    for (var i = 0; i < n; i++) {
      var on = qi === null || qi === undefined ? pt.sel === i : pt.rsel[qi] === i;
      h += '<button class="opt' + (on ? ' is-sel' : '') + '" data-popt="' + i + '"' + (qi !== null && qi !== undefined ? ' data-pq="' + qi + '"' : '') + ' aria-pressed="' + on + '">' +
        '<span class="opt-l">' + L[i] + '</span>' + (opts ? '<span class="opt-t" lang="en">' + esc(opts[i]) + '</span>' : '') + '</button>';
    }
    return h + '</div>';
  }
  function placeIntroHtml() {
    var hist = places().slice(0, 5), noL = !T.canSpeak();
    var h = '<div class="prac-top"><b>多益落點測驗</b><span></span><button class="link-btn" data-act="pt-home">回練習首頁</button></div>' +
      '<div class="pt-intro"><ul class="pt-steps">' +
      (noL ? '' : '<li><b>聽力 15 題</b>（Part 2 應答）：和正式考試一樣只播一次</li>') +
      '<li><b>單字填空 16 題</b>（Part 5）</li><li><b>短文 3 篇、9 題</b>（Part 6、7）</li></ul>' +
      '<p>題目從四個級別裡挑：答對就出難一點、答錯就出簡單一點，所以每個人做到的題目不一樣。作答時不會顯示對錯，做完再一起看結果和解析。全程大約 15 分鐘。</p>' +
      (noL ? '<p class="pt-warn">這個瀏覽器不支援語音，這次只測閱讀，只會估閱讀分數。</p>' : '<p>聽力會出聲音，請先戴上耳機或打開聲音。</p>') +
      '<p class="note">做過的題目會記進練習紀錄，答錯的會出現在錯題分析；單字填空答錯的字會排回單字卡。中途結束不會算分數。<br>這是用本站的原創題粗估，不是官方分數：題目沒有用真實考生的成績校正過，聽力也只有 Part 2，實際分數可能差更多。</p>' +
      '<button class="reveal" data-act="pt-start">開始測驗</button></div>';
    if (hist.length) {
      h += '<h2 class="stat-h">之前的結果</h2><div class="pt-hist">' + hist.map(function (x) {
        return '<div class="pt-hist-row"><span>' + md(x.t) + '</span><b>' + (x.S ? '約 ' + x.S[1] + ' 分' : '只測閱讀') + '</b><span>' +
          (x.L ? '聽力 ' + x.L[1] + '・' : '') + '閱讀 ' + x.R[1] + '</span></div>';
      }).join('') + '</div>';
    }
    return h;
  }
  /* 結果頁的弱點：把這次答的題按錯題分析的分類統計 */
  function placeCats(ans) {
    var cats = {};
    ans.forEach(function (a) {
      var key = a.type === 'read' ? (a.it.p === 6 ? 'r6' : 'r7' + qKind(a.it.qs[a.qi].q)) : (a.type === 'p5' ? 'p' : 'l') + a.it.t;
      var x = cats[key] = cats[key] || { n: 0, c: 0 }; x.n++; if (a.ok) x.c++;
    });
    return cats;
  }
  function placeDoneHtml() {
    var r = pt.res, h = '<div class="prac-top"><b>落點測驗結果</b><span>' + md(r.t) + '</span><button class="link-btn" data-act="pt-home">回練習首頁</button></div>';
    h += '<div class="pt-score">' + (r.S
      ? '<p class="pt-cap">估計多益總分</p><p class="pt-big">約 <b>' + r.S[1] + '</b> 分</p><p class="pt-range">大約落在 ' + r.S[0] + '–' + r.S[2] + ' 分之間</p>'
      : '<p class="pt-cap">這次只測閱讀</p><p class="pt-big">閱讀約 <b>' + r.R[1] + '</b> 分</p><p class="pt-range">大約落在 ' + r.R[0] + '–' + r.R[2] + ' 分之間（滿分 495）</p>') + '</div>';
    if (r.S) h += '<div class="stat-row pt-sub"><div class="stat"><b>約 ' + r.L[1] + '</b><span>聽力（' + r.L[0] + '–' + r.L[2] + '）</span></div>' +
      '<div class="stat"><b>約 ' + r.R[1] + '</b><span>閱讀（' + r.R[0] + '–' + r.R[2] + '）</span></div></div>';
    // 各題型答對率
    h += '<h2 class="stat-h">各題型答對率</h2><div class="prac-table">';
    ['listen', 'p5', 'read'].forEach(function (tp) {
      var x = r.m[tp]; if (!x) return;
      var p = x[0] / x[1];
      h += '<div class="prac-row"><span class="prac-row-name">' + NAMES[tp] + '</span>' +
        '<div class="lb-bar"><i class="' + (p >= 0.8 ? 'seg-review' : p >= 0.6 ? 'seg-mid' : 'seg-learning') + '" style="width:' + Math.max(p * 100, 2) + '%"></i></div>' +
        '<span class="lb-num">' + x[0] + ' / ' + x[1] + '・' + pct(x[0], x[1]) + '</span></div>';
    });
    h += '</div><p class="note">題目難度會隨你的表現調整，答對率大約五到七成是正常的，重點看分數。</p>';
    // 弱點
    var cats = placeCats(pt.ans), rows = CATS.filter(function (c) { return cats[c[0]]; });
    var weak = null;
    rows.forEach(function (c) {
      var x = cats[c[0]];
      if (x.n >= 3 && c[3] && x.c < x.n && (!weak || x.c / x.n < cats[weak[0]].c / cats[weak[0]].n)) weak = c;
    });
    h += '<h2 class="stat-h">弱點</h2>';
    if (weak) {
      var wx = cats[weak[0]];
      h += '<div class="wa-weak"><p class="wa-weak-h">這次最弱：' + NAMES[weak[1]] + '的「' + esc(weak[2]) + '」，答對 ' + wx.c + ' / ' + wx.n + '</p><p>' + esc(weak[3]) + '</p></div>';
    } else h += '<p class="note">這次每一類（至少 3 題的）都沒有明顯偏低。</p>';
    h += '<div class="wa-cats">';
    var lastGroup = '';
    rows.forEach(function (c) {
      var x = cats[c[0]], p = x.c / x.n;
      if (c[1] !== lastGroup) { h += '<p class="wa-group">' + NAMES[c[1]] + '</p>'; lastGroup = c[1]; }
      h += '<div class="wa-row' + (weak === c ? ' is-weak' : '') + (x.n < 3 ? ' is-few' : '') + '"><span class="wa-name">' + esc(c[2]) + '</span>' +
        '<div class="lb-bar"><i class="' + (p >= 0.8 ? 'seg-review' : p >= 0.6 ? 'seg-mid' : 'seg-learning') + '" style="width:' + Math.max(p * 100, 2) + '%"></i></div>' +
        '<span class="lb-num">' + x.c + ' / ' + x.n + '</span></div>';
    });
    h += '</div><p class="note">每一類只有幾題，看大方向就好；題數少於 3 題的顏色較淡。</p>';
    // 建議練哪一級
    var cur = T.level(), on = String(cur) === String(r.lv);
    h += '<h2 class="stat-h">建議練習</h2><div class="pt-suggest"><p>建議先練「<b>' + LV_NAME[r.lv] + '</b>」的單字和題目：' +
      (r.lv === 990 ? '你已經在高分區，用最難的一級補細節。' : '這一級比你目前的程度高一點，答對率大約五到七成，最能進步。') + '</p>' +
      (on ? '<p class="note">你現在就在這一級。</p>'
          : '<button class="tool-btn" data-act="pt-level" data-lv="' + r.lv + '">切到「' + LV_NAME[r.lv] + '」</button><p class="note">單字卡和練習都會換到這一級，之後也可以在上面的分頁切換。</p>') + '</div>';
    // 答錯的題
    var miss = pt.ans.filter(function (a) { return !a.ok; });
    h += '<h2 class="stat-h">這次答錯的題目（' + miss.length + ' 題）</h2>';
    if (!miss.length) h += '<p class="note">全部答對。</p>';
    else {
      h += '<div class="wq-list">' + miss.map(function (a) {
        return wrongItemHtml({ type: a.type, it: a.it, qi: a.type === 'read' ? a.qi : undefined, ch: a.ch, r: pr(a.type)[a.it.id] || [1, 0, 0, 0] });
      }).join('') + '</div><p class="note">點一題可以看你選的（紅色）、正確答案（綠色）和各選項解析，裡面的英文字可以點。' +
        (pt.sent ? '單字填空答錯的 ' + pt.sent + ' 個字已經排回單字卡。' : '') + '這些題目也會出現在錯題分析。</p>';
    }
    h += '<p class="note pt-caveat">這個分數是用本站的原創題、依題目級別假設的難度估出來的，不是官方分數；題目沒有用真實考生的成績校正過，聽力也只有 Part 2 應答題（正式考試還有照片、對話和獨白）。區間是統計上大約七成把握的範圍，實際分數可能差得更多，拿來看進步的方向比較準。</p>' +
      '<div class="btn-row"><button class="tool-btn" data-act="pt-home">回練習首頁</button><button class="tool-btn" data-act="wrong">看錯題分析</button></div>';
    return h;
  }
  function placeClick(t) {
    var act = t.closest('[data-act]'), a = act ? act.getAttribute('data-act') : '';
    if (a === 'pt-intro') { openPlace(); return true; }
    if (!pt) return false;
    if (a === 'pt-start') { startPlace(); return true; }
    if (a === 'pt-home') { T.stopSpeech(); pt = null; render(); return true; }
    if (a === 'pt-quit') {
      if (confirm('測驗還沒做完，確定要結束嗎？做過的題目會留在練習紀錄裡，但這次不會算分數。')) { T.stopSpeech(); pt = null; render(); }
      return true;
    }
    if (a === 'pt-next') { commitPlace(); return true; }
    if (a === 'pt-replay') { if (pt.played && !pt.replays) { pt.replays++; playPlace(); } return true; }
    if (a === 'pt-level') { var lv = act.getAttribute('data-lv'); T.switchLevel(lv); T.toast('已切到「' + LV_NAME[lv] + '」'); return true; }
    if (a === 'wrong' && pt.phase === 'done') { pt = null; openWrong(); return true; }
    var o = t.closest('[data-popt]');
    if (o && pt.phase === 'run') {
      var i = Number(o.getAttribute('data-popt')), q = o.getAttribute('data-pq');
      if (q === null) pt.sel = i; else pt.rsel[Number(q)] = i;
      render();
      return true;
    }
    if (pt.phase === 'done') return false;              // 結果頁裡的錯題（點字、發音、展開）交給一般的處理
    return !!t.closest('#pracRoot');
  }
  function placeKey(e) {
    if (pt.phase !== 'run') return false;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return false;
    var k = e.key;
    if (k === 'Enter') { e.preventDefault(); commitPlace(); return true; }
    if (pt.type === 'read') return false;
    var i = '1234'.indexOf(k);
    if (i < 0) i = 'abcd'.indexOf(k.toLowerCase());
    if (i >= 0 && k.length === 1 && i < pt.it.o.length) { e.preventDefault(); pt.sel = i; render(); return true; }
    return false;
  }

  /* 統計頁用 */
  function statsHtml() {
    var est = estHtml();
    if (T.levelFilter() === 'my') return est + '<p class="note">「自選」沒有專屬的題庫；切到其他級別或「全部」可以看練習成績。</p>';
    var s = T.state(), d = s.pday[T.todayKey()] || {};
    var tn = 0, tc = 0;
    TYPES.forEach(function (tp) { if (d[tp]) { tn += d[tp][0]; tc += d[tp][1]; } });
    var h = est + '<p class="prac-today">今天練習 <b>' + tn + '</b> 題' + (tn ? '，答對率 <b>' + pct(tc, tn) + '</b>' : '') + '</p><div class="prac-table">';
    TYPES.forEach(function (tp) {
      var sm = summary(tp), unit = tp === 'read' ? '篇' : '題';
      h += '<div class="prac-row"><span class="prac-row-name">' + NAMES[tp] + '</span>' +
        '<div class="lb-bar"><i class="seg-review" style="width:' + (sm.total ? sm.done / sm.total * 100 : 0) + '%"></i></div>' +
        '<span class="lb-num">' + sm.done + ' / ' + sm.total + ' ' + unit + '・' + pct(sm.c, sm.n) + '</span></div>';
    });
    var wq = 0;
    TYPES.forEach(function (tp) { wq += wrongCount(tp).q; });
    return h + '</div><p class="note">長條是「' + esc(T.levelName()) + '」題庫做過的比例，百分比是答對率。</p>' +
      '<button class="tool-btn" data-goto="wrong">錯題分析' + (wq ? '（還沒訂正 ' + wq + ' 題）' : '') + '</button>';
  }

  window.Practice = { init: init, render: render, reset: reset, statsHtml: statsHtml, openWrong: openWrong, openPlace: openPlace,
                      _pt: function () { return pt; } };   // 測試腳本用
})();
