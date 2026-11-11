/* 多益單字卡 — 「練習」分頁
 * 三種題型：單字填空（Part 5 風格）、短文閱讀（Part 6、7 風格）、聽力應答（Part 2 風格）
 * 題庫在 data/quiz_*.js，第一次進到該題型才載入。
 * 依賴 app.js 在啟動時呼叫 Practice.init(api) 傳進來的介面。
 */
(function () {
  'use strict';

  var T = null, root = null;
  var sess = null;                  // 進行中的一回練習
  var loading = {};
  var FILES = { p5: 'data/quiz_p5.js', read: 'data/quiz_read.js', listen: 'data/quiz_listen.js' };
  var GLOBALS = { p5: 'QUIZ_P5', read: 'QUIZ_READ', listen: 'QUIZ_LISTEN' };
  var NAMES = { p5: '單字填空', read: '短文閱讀', listen: '聽力應答' };
  var DESC = {
    p5: 'Part 5 風格。一句話挖一個空，四選一。每回 10 題，答完有翻譯和解析。',
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
  }
  function esc(s) { return T.esc(s); }
  function data(type) { return window[GLOBALS[type]] || null; }
  function load(type, cb) {
    if (data(type)) { cb(); return; }
    if (loading[type]) return;
    loading[type] = true;
    var s = document.createElement('script');
    s.src = FILES[type];
    s.onload = function () { loading[type] = false; cb(); };
    s.onerror = function () { loading[type] = false; s.remove(); T.toast('題庫載入失敗，請確認網路後再試一次'); sess = null; render(); };
    document.head.appendChild(s);
  }

  /* ---------- 成績 ---------- */
  function pr(type) { return T.state().practice[type]; }
  function lvOf(type, id) {
    if (type === 'p5') { var w = T.byId[Number(String(id).slice(1))]; return w ? w.lv : 0; }
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
  function record(type, id, correct, qCount) {
    var p = pr(type), r = p[id] || [0, 0, 0, 0];
    p[id] = [r[0] + 1, r[1] + correct, Date.now(), correct];
    var s = T.state(), k = T.todayKey();
    var d = s.pday[k] = s.pday[k] || {};
    var a = d[type] || [0, 0];
    d[type] = [a[0] + qCount, a[1] + correct];
    d.t = Date.now();
    T.notePractice(type, id);
    T.save();
  }
  function learned(wid) { var st = T.rec(wid).st; return st !== 'new' && st !== 'suspended'; }

  /* 答錯單字填空：把那個字排回單字卡 */
  function sendBack(wid) {
    var r = T.rec(wid), now = Date.now();
    if (r.st === 'review') { T.setRec(wid, T.SRS.apply(r, 1, now)); return '已排回單字卡，10 分鐘後複習'; }
    if (r.st === 'known') { T.setRec(wid, Object.assign(T.SRS.newRecord(), { last: now })); return '原本標成「已會」，已改回新字'; }
    return '';
  }

  /* ---------- 出題 ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pick(type) {
    var p = pr(type), scope = T.state().settings.practiceScope;
    var fresh = [], wrong = [], right = [], outside = [];
    data(type).forEach(function (it) {
      if (!inLevel(it.lv)) return;
      var r = p[it.id], seen = r && r[0] > 0;
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
      out = wrong.slice(0, 3);                               // 每回先帶 3 題之前錯的
      out = out.concat(fresh.slice(0, n - out.length));
      if (out.length < n) out = out.concat(wrong.slice(3, 3 + n - out.length));
      if (out.length < n) out = out.concat(right.slice(0, n - out.length));
      shuffle(out);
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

  function start(type) {
    if (type === 'listen' && !T.canSpeak()) { T.toast('這個瀏覽器不支援語音，沒辦法做聽力題'); return; }
    sess = { type: type, loading: true };
    render();
    load(type, function () {
      if (!sess || sess.type !== type) return;
      var pk = pick(type);
      if (!pk.items.length) { sess = null; T.toast('這一級還沒有這種題目'); render(); return; }
      sess = { type: type, items: pk.items, padded: pk.padded, idx: 0, results: [], chosen: null, readChosen: [null, null, null], played: false };
      render();
      if (type === 'listen') playListen();
    });
  }
  function reset() { if (sess) T.stopSpeech(); sess = null; }

  /* ---------- 畫面 ---------- */
  function render() {
    if (!root || !T) return;
    if (!sess) { root.innerHTML = homeHtml(); return; }
    if (sess.loading) { root.innerHTML = '<div class="empty">載入題庫中…</div>'; return; }
    if (sess.done) { root.innerHTML = doneHtml(); return; }
    var it = sess.items[sess.idx];
    root.innerHTML = topHtml() + (sess.type === 'p5' ? p5Html(it) : sess.type === 'listen' ? listenHtml(it) : readHtml(it));
  }

  function homeHtml() {
    var h = '<p class="prac-lead">目前練習範圍：<b>' + esc(T.levelName()) + '</b>（切換級別就換題庫）。做過的題目和成績會記下來，答錯的之後會再出。</p><div class="prac-modes">';
    TYPES.forEach(function (tp) {
      var s = summary(tp), unit = tp === 'read' ? '篇' : '題';
      h += '<button class="prac-mode" data-start="' + tp + '">' +
        '<span class="prac-mode-name">' + NAMES[tp] + '</span>' +
        '<span class="prac-mode-desc">' + DESC[tp] + '</span>' +
        '<span class="prac-mode-stat">' + (s.total ? '共 ' + s.total + ' ' + unit + '・做過 ' + s.done + ' ' + unit + '・答對率 ' + pct(s.c, s.n) : '題庫準備中') + '</span>' +
        '</button>';
    });
    h += '</div>';
    var sc = T.state().settings.practiceScope;
    h += '<div class="prac-scope"><span>單字填空出題範圍</span>' +
      '<button class="chip' + (sc === 'learned' ? ' is-on' : '') + '" data-scope="learned">只出我學過的字</button>' +
      '<button class="chip' + (sc === 'all' ? ' is-on' : '') + '" data-scope="all">這一級全部</button></div>' +
      '<p class="note">「學過的字」是指單字卡裡已經背過或標成已會的字；不夠 10 題時會用還沒學的字補滿。題目是仿多益題型的原創練習題，不是真題，不能拿來估分數。</p>';
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
    return '<div class="prac-top"><b>' + NAMES[sess.type] + '</b><span>' + label + '</span>' +
      '<button class="link-btn" data-act="quit">結束練習</button></div>' +
      '<div class="prac-bar"><i style="width:' + pct + '%"></i></div>' +
      (sess.padded && sess.idx === 0 ? '<p class="note">這一級你學過的字還不夠出滿一回，其中 ' + sess.padded + ' 題用的是還沒學的字。</p>' : '');
  }
  function optsHtml(opts, ans, chosen, qi, hideText) {
    var answered = chosen !== null && chosen !== undefined;
    return '<div class="opts' + (hideText ? ' opts-abc' : '') + '">' + opts.map(function (o, i) {
      var cls = 'opt';
      if (answered) cls += i === ans ? ' is-correct' : i === chosen ? ' is-wrong' : ' is-dim';
      return '<button class="' + cls + '" data-opt="' + i + '"' + (qi !== undefined ? ' data-q="' + qi + '"' : '') + (answered ? ' disabled' : '') + '>' +
        '<span class="opt-l">' + L[i] + '</span>' + (hideText ? '' : '<span class="opt-t">' + esc(o) + '</span>') + '</button>';
    }).join('') + '</div>';
  }
  function nextBtn(label) { return '<button class="reveal prac-next" data-act="next">' + label + ' <kbd>Enter</kbd></button>'; }
  function wordInfo(wid) {
    var w = T.byId[wid]; if (!w) return '';
    return '<button class="speakable fb-word" data-say="' + esc(w.w) + '"><b>' + esc(w.w) + '</b>' + T.SPK + '</button> ' + T.phonHtml(w) +
      ' <span class="fb-def">' + esc(w.d.map(function (d) { return '(' + d[0] + ') ' + d[1]; }).join('　')) + '</span>';
  }

  /* 單字填空 */
  function p5Html(it) {
    var answered = sess.chosen !== null;
    var parts = it.q.split(BLANK);
    var q = esc(parts[0]) + (answered ? '<mark>' + esc(it.o[it.a]) + '</mark>' : '<span class="blank"></span>') + esc(parts[1] || '');
    var h = '<div class="prac-tag">' + (it.t === 'f' ? '詞性題' : '單字題') + '</div>' +
      '<div class="prac-q" lang="en">' + q + '</div>' + optsHtml(it.o, it.a, sess.chosen);
    if (answered) {
      var ok = sess.chosen === it.a;
      h += '<div class="fb ' + (ok ? 'is-ok' : 'is-no') + '">' +
        '<p class="fb-head">' + (ok ? '答對了' : '答錯了，答案是 ' + esc(it.o[it.a])) + '</p>' +
        '<button class="speakable fb-say" data-say="' + esc(it.q.replace(BLANK, it.o[it.a])) + '">聽這一句' + T.SPK + '</button>' +
        '<p class="fb-zh">' + esc(it.zh) + '</p><p class="fb-ex">' + esc(it.ex) + '</p>' +
        '<p class="fb-wordline">' + wordInfo(it.wid) + '</p>' +
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
  function listenHtml(it) {
    var answered = sess.chosen !== null;
    var h = '<div class="listen-box"><button class="listen-play' + (sess.playing ? ' is-playing' : '') + '" data-act="play">' + T.SPK +
      '<span>' + (sess.playing ? '播放中…' : (sess.played ? '再聽一次' : '播放題目')) + '</span> <kbd>R</kbd></button>' +
      '<p class="note">會先唸問句，再唸 A、B、C 三個回答。選最適合的回答。</p></div>';
    if (!answered) return h + optsHtml(it.o, it.a, null, undefined, true);
    var ok = sess.chosen === it.a;
    h += '<div class="script"><button class="speakable script-q" lang="en" data-say="' + esc(it.q) + '">' + esc(it.q) + T.SPK + '</button><p class="script-zh">' + esc(it.zq) + '</p></div>';
    h += '<div class="opts">' + it.o.map(function (o, i) {
      var cls = 'opt opt-script' + (i === it.a ? ' is-correct' : i === sess.chosen ? ' is-wrong' : ' is-dim');
      return '<div class="' + cls + '" data-say="' + esc(o) + '" title="點一下再聽一次"><span class="opt-l">' + L[i] + '</span><span class="opt-t"><span lang="en">' + esc(o) + '</span><small>' + esc(it.zo[i]) + '</small></span></div>';
    }).join('') + '</div>';
    h += '<div class="fb ' + (ok ? 'is-ok' : 'is-no') + '"><p class="fb-head">' + (ok ? '答對了' : '答錯了，答案是 ' + L[it.a]) + '</p><p class="fb-ex">' + esc(it.ex) + '</p></div>' +
      nextBtn(sess.idx + 1 < sess.items.length ? '下一題' : '看這一回成績');
    return h;
  }

  /* 短文閱讀 */
  function passageHtml(it) {
    var t = esc(it.tx);
    if (it.p === 6) {
      t = t.replace(/\[(\d)\] -------/g, function (m, d) {
        var i = Number(d) - 1, ch = sess.readChosen[i];
        if (ch === null) return '<span class="pblank">(' + d + ')</span>';
        return '<mark>' + esc(it.qs[i].o[it.qs[i].a]) + '</mark>';
      });
    }
    return '<div class="passage"><div class="passage-head"><span class="kind">' + (KIND[it.k] || '短文') + '</span><b>' + esc(it.ti) + '</b></div>' +
      '<div class="passage-text" lang="en">' + t + '</div></div>';
  }
  function readHtml(it) {
    var allDone = sess.readChosen.every(function (c) { return c !== null; });
    var h = passageHtml(it);
    it.qs.forEach(function (q, i) {
      var ch = sess.readChosen[i];
      h += '<div class="rq"><p class="rq-q" lang="en">' + (it.p === 6 ? '空格 (' + (i + 1) + ')' : (i + 1) + '. ' + esc(q.q)) + '</p>' + optsHtml(q.o, q.a, ch, i);
      if (ch !== null) h += '<div class="fb ' + (ch === q.a ? 'is-ok' : 'is-no') + '"><p class="fb-head">' + (ch === q.a ? '答對了' : '答錯了，答案是 ' + esc(q.o[q.a])) + '</p><p class="fb-ex">' + esc(q.ex) + '</p></div>';
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
        nextBtn('下一篇') + '<button class="link-btn prac-home" data-act="quit">回練習首頁</button>';
    }
    return h;
  }

  function doneHtml() {
    var n = sess.results.length, c = sess.results.filter(function (r) { return r.ok; }).length;
    var miss = sess.results.filter(function (r) { return !r.ok; });
    var h = '<div class="prac-done"><strong>這一回答對 ' + c + ' / ' + n + '</strong>';
    if (!miss.length) h += '<p>全部答對。</p>';
    else {
      h += '<p>答錯的 ' + miss.length + ' 題，之後的練習會再出一次：</p><ul class="miss">';
      miss.forEach(function (r) {
        var it = r.it;
        if (sess.type === 'p5') h += '<li><b>' + esc(it.o[it.a]) + '</b><span lang="en">' + esc(it.q.replace(BLANK, '____')) + '</span></li>';
        else h += '<li><b lang="en">' + esc(it.q) + '</b><span lang="en">' + esc(it.o[it.a]) + '</span></li>';
      });
      h += '</ul>';
    }
    h += '<div class="btn-row"><button class="reveal" data-act="again">再來一回 <kbd>Enter</kbd></button><button class="tool-btn" data-act="quit">回練習首頁</button></div></div>';
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
        record('read', it.id, score, 3);
        T.renderTabs();
      }
      render();
      return;
    }
    if (sess.chosen !== null || i >= it.o.length) return;
    sess.chosen = i;
    var ok = i === it.a;
    sess.note = '';
    if (sess.type === 'p5' && !ok) sess.note = sendBack(it.wid);
    if (sess.type === 'listen') { T.stopSpeech(); sess.playing = false; }
    sess.results.push({ it: it, ok: ok });
    record(sess.type, it.id, ok ? 1 : 0, 1);
    if (sess.note) T.renderTabs();
    render();
  }
  function next() {
    if (!sess || sess.done || sess.loading) return;
    if (sess.type === 'read') {
      if (!sess.readChosen.every(function (c) { return c !== null; })) return;
      T.stopSpeech();
      start('read');                                 // 閱讀一回一篇，直接換下一篇
      return;
    }
    if (sess.chosen === null) return;
    T.stopSpeech();
    if (sess.idx + 1 >= sess.items.length) { sess.done = true; render(); return; }
    sess.idx++; sess.chosen = null; sess.note = ''; sess.played = false; sess.playing = false;
    render();
    root.scrollIntoView({ block: 'start' });
    if (sess.type === 'listen') playListen();
  }

  function onClick(e) {
    var t = e.target;
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
    var act = t.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');
    if (a === 'quit') { reset(); render(); }
    else if (a === 'next') next();
    else if (a === 'again') start(sess.type);
    else if (a === 'play') playListen();
    else if (a === 'readaloud') {
      var it = sess.items[sess.idx];
      var text = it.tx.replace(/\[(\d)\] -------/g, function (m, d) { var q = it.qs[Number(d) - 1]; return q.o[q.a]; });
      T.speak(text.replace(/\n+/g, '. '), act);
    }
  }
  function onKey(e) {
    if (!T || !T.isActive() || !sess || sess.loading) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (sess.done) { if (k === 'Enter' || k === ' ') { e.preventDefault(); start(sess.type); } return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); next(); return; }
    if (sess.type === 'listen' && (k === 'r' || k === 'R')) { playListen(); return; }
    if (sess.type === 'read') return;                 // 閱讀有三題，用點的
    var i = '1234'.indexOf(k);
    if (i < 0) i = 'abcd'.indexOf(k.toLowerCase());
    if (i >= 0 && k.length === 1) { e.preventDefault(); answer(i); }
  }

  /* 統計頁用 */
  function statsHtml() {
    var s = T.state(), d = s.pday[T.todayKey()] || {};
    var tn = 0, tc = 0;
    TYPES.forEach(function (tp) { if (d[tp]) { tn += d[tp][0]; tc += d[tp][1]; } });
    var h = '<p class="prac-today">今天練習 <b>' + tn + '</b> 題' + (tn ? '，答對率 <b>' + pct(tc, tn) + '</b>' : '') + '</p><div class="prac-table">';
    TYPES.forEach(function (tp) {
      var sm = summary(tp), unit = tp === 'read' ? '篇' : '題';
      h += '<div class="prac-row"><span class="prac-row-name">' + NAMES[tp] + '</span>' +
        '<div class="lb-bar"><i class="seg-review" style="width:' + (sm.total ? sm.done / sm.total * 100 : 0) + '%"></i></div>' +
        '<span class="lb-num">' + sm.done + ' / ' + sm.total + ' ' + unit + '・' + pct(sm.c, sm.n) + '</span></div>';
    });
    return h + '</div><p class="note">長條是「' + esc(T.levelName()) + '」題庫做過的比例，百分比是答對率。</p>';
  }

  window.Practice = { init: init, render: render, reset: reset, statsHtml: statsHtml };
})();
