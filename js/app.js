/* 多益單字卡 — 主程式
 * 依賴：data/words.js (window.WORDS)、js/srs.js (window.SRS)
 * 所有進度存在 localStorage，不需要後端。
 */
(function () {
  'use strict';

  var STORE_KEY = 'toeic-cards-v1';
  var WORDS = window.WORDS;
  var SRS = window.SRS;
  var byId = {};
  WORDS.forEach(function (w) { byId[w.id] = w; });

  var DEFAULT_SETTINGS = {
    newPerDay: 20,
    newOrder: 'list',
    direction: 'en',
    frontExample: 'show',
    autoSpeak: 'word',
    speakOnShow: 'yes',
    phonetic: 'kk',
    rate: '0.85',
    voice: ''
  };

  var state = load();
  var undoStack = [];
  var current = null;        // {id, kind}
  var revealed = false;
  var forceAhead = false;
  var screen = null;         // 快速篩選：{list, idx, history}
  var browseLimit = 80;

  /* ---------- 儲存 ---------- */
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    s.v = 1;
    s.recs = s.recs || {};
    s.log = s.log || [];
    s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
    s.level = s.level || 400;
    s.view = s.view || 'study';
    s.daily = s.daily || { day: todayKey(), newCount: 0, extraNew: 0 };
    s.settingsUpdated = s.settingsUpdated || 0;
    return s;
  }
  // 還沒推到雲端的變更
  var pending = { ids: {}, settings: false, logFrom: state.log.length };
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('無法儲存進度：瀏覽器儲存空間不可用'); }
  }
  function save() {
    persist();
    if (!window.Sync) return;
    if (pending.logFrom > state.log.length) pending.logFrom = state.log.length;
    var ids = Object.keys(pending.ids);
    var entries = state.log.slice(pending.logFrom);
    if (ids.length || pending.settings || entries.length) {
      Sync.noteChange({ ids: ids, settings: pending.settings, daily: true, log: entries });
    }
    pending = { ids: {}, settings: false, logFrom: state.log.length };
  }
  function clearPending() { pending = { ids: {}, settings: false, logFrom: state.log.length }; }
  function todayKey(t) {
    var d = new Date(t || Date.now());
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function rollDay() {
    var k = todayKey();
    if (state.daily.day !== k) { state.daily = { day: k, newCount: 0, extraNew: 0 }; save(); }
  }
  function rec(id) { return state.recs[id] || SRS.newRecord(); }
  function setRec(id, r) { state.recs[id] = r; pending.ids[id] = true; }

  /* ---------- 小工具 ---------- */
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2200);
  }
  var SPK = '<svg class="spk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  function levelFilter() { return state.level === 'all' ? 'all' : Number(state.level); }
  function levelCards() {
    var f = levelFilter();
    return WORDS.filter(function (w) { return f === 'all' || w.lv === f; });
  }
  function posText(d) { return '(' + d[0] + ')'; }
  function defsText(w) { return w.d.map(function (d) { return posText(d) + ' ' + d[1]; }).join('　'); }
  /* 音標：KK 用 [ ]，IPA 用 / /；詞性不同唸法不同的字分開列 */
  function phonText(w, mode) {
    mode = mode || state.settings.phonetic;
    if (mode === 'none') return '';
    var v = mode === 'ipa' ? w.ip : w.kk;
    if (!v) return '';
    var a = mode === 'ipa' ? '/' : '[', b = mode === 'ipa' ? '/' : ']';
    if (typeof v === 'string') return a + v + b;
    return v.map(function (x) { return x[0] + ' ' + a + x[1] + b; }).join('　');
  }
  function phonHtml(w, cls) {
    var mode = state.settings.phonetic;
    if (mode === 'none') return '';
    var v = mode === 'ipa' ? w.ip : w.kk;
    if (!v) return '';
    var a = mode === 'ipa' ? '/' : '[', b = mode === 'ipa' ? '/' : ']';
    var inner = typeof v === 'string' ? esc(a + v + b)
      : v.map(function (x) { return '<i>' + esc(x[0]) + '</i>' + esc(a + x[1] + b); }).join('<span class="phon-sep"></span>');
    return '<span class="phon ' + (cls || '') + '" lang="en">' + inner + '</span>';
  }

  /* ---------- 發音 ---------- */
  var synth = window.speechSynthesis;
  var voices = [];
  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    var sel = $('#voiceSelect');
    if (!sel) return;
    var keep = state.settings.voice;
    sel.innerHTML = '<option value="">自動（偏好美式）</option>';
    voices.filter(function (v) { return /^en/i.test(v.lang); }).forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.name; o.textContent = v.name + '（' + v.lang + '）';
      sel.appendChild(o);
    });
    sel.value = keep;
    if (sel.value !== keep) sel.value = '';
  }
  function pickVoice() {
    if (!voices.length) voices = synth.getVoices() || [];
    if (state.settings.voice) {
      var v = voices.filter(function (x) { return x.name === state.settings.voice; })[0];
      if (v) return v;
    }
    var prefer = ['Google US English', 'Samantha', 'Aria', 'Jenny', 'Ava', 'Allison', 'Zira', 'Alex'];
    for (var i = 0; i < prefer.length; i++) {
      var hit = voices.filter(function (x) { return x.name.indexOf(prefer[i]) === 0 && /^en/i.test(x.lang); })[0];
      if (hit) return hit;
    }
    return voices.filter(function (x) { return /en[-_]US/i.test(x.lang); })[0] ||
           voices.filter(function (x) { return /^en/i.test(x.lang); })[0] || null;
  }
  var speakingEl = null;
  function clearSpeaking() {
    if (speakingEl) { speakingEl.classList.remove('is-speaking'); speakingEl = null; }
  }
  /* items: [{text, el}] 依序播放 */
  // 最近一次使用者操作的時間：自動發音只在操作之後觸發（瀏覽器不允許頁面自己出聲）
  var lastGesture = 0;
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () { lastGesture = Date.now(); }, true);
  });
  var cancelBusyAt = 0;
  function stopSpeech() {
    if (!synth) return;
    if (synth.speaking || synth.pending) cancelBusyAt = Date.now();
    synth.cancel();
    clearSpeaking();
  }
  function speakSeq(items) {
    if (!synth) { toast('這個瀏覽器不支援語音發音'); return; }
    stopSpeech();
    var i = 0;
    function next() {
      if (i >= items.length) return;
      var it = items[i++];
      var u = new SpeechSynthesisUtterance(it.text);
      u.lang = 'en-US';
      u.rate = parseFloat(state.settings.rate) || 1;
      var v = pickVoice();
      if (v) u.voice = v;
      u.onstart = function () { clearSpeaking(); if (it.el) { it.el.classList.add('is-speaking'); speakingEl = it.el; } };
      u.onend = function () { clearSpeaking(); next(); };
      u.onerror = function () { clearSpeaking(); };
      synth.speak(u);
    }
    // 剛打斷正在播的語音時，Chrome 立刻 speak 偶爾會被吃掉，稍等一下；
    // 其他情況同步播放（iPhone 要求發聲必須發生在點擊事件裡）
    if (Date.now() - cancelBusyAt < 150) setTimeout(next, 80); else next();
  }
  function speak(text, el) { speakSeq([{ text: text, el: el }]); }
  if (synth) {
    loadVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') synth.onvoiceschanged = loadVoices;
  }

  /* ---------- 佇列 ---------- */
  function newAllowance() {
    rollDay();
    return Math.max(0, Number(state.settings.newPerDay) + (state.daily.extraNew || 0) - state.daily.newCount);
  }
  function queueFor(filter) {
    var cards = WORDS.map(function (w) { return { id: w.id, level: w.lv }; });
    return SRS.buildQueue(cards, state.recs, filter, Date.now(), newAllowance(), state.settings.newOrder);
  }
  // 側標上的數字：真正到期要複習的張數（不含新字額度）
  function dueCount(filter) {
    var q = queueFor(filter);
    return q.learn.length + q.review.length;
  }

  /* ---------- 側標 / 標題 ---------- */
  function renderTabs() {
    $all('.tab').forEach(function (t) {
      var lv = t.getAttribute('data-level');
      t.classList.toggle('is-active', String(state.level) === lv);
      var n = dueCount(lv === 'all' ? 'all' : Number(lv));
      t.querySelector('.tab-count').textContent = n ? String(n) : '';
    });
    var pill = $('#deckPill');
    if (state.level === 'all') pill.innerHTML = '全部 <span class="pill-num">1000</span> 字';
    else pill.innerHTML = '衝 <span class="pill-num">' + state.level + '</span> 分必備單字';
  }
  function renderViews() {
    $all('.view-btn').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-view') === state.view); });
    $all('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + state.view); });
    if (state.view === 'study') renderStudy();
    if (state.view === 'browse') renderBrowse();
    if (state.view === 'stats') renderStats();
    if (state.view === 'settings') renderSettings();
  }
  function renderAll() { renderTabs(); renderViews(); }

  /* ---------- 學習 ---------- */
  function renderStudy() {
    if (screen) { renderScreen(); return; }
    $('#screen').hidden = true;
    var q = queueFor(levelFilter());
    $('#cNew').textContent = q.fresh.length;
    $('#cLearn').textContent = q.learn.length + q.pendingLearn.length;
    $('#cReview').textContent = q.review.length;
    $('#undoBtn').hidden = !undoStack.length;

    if (!current || !stillValid(current.id, q)) {
      var pick = SRS.pickNext(q, Date.now());
      if (!pick && forceAhead && q.pendingLearn.length) pick = { id: q.pendingLearn[0].id, kind: 'learn', ahead: true };
      current = pick;
      revealed = false;
    }
    var card = $('#card'), empty = $('#studyEmpty'), ratings = $('#ratings');
    $('#screenBtn').hidden = !q.freshTotal;
    if (!current) {
      card.hidden = true; ratings.hidden = true;
      empty.hidden = false;
      empty.innerHTML = emptyMessage(q);
      $('#knownBtn').hidden = true;
      shownId = null;
      return;
    }
    empty.hidden = true;
    card.hidden = false;
    renderCard(byId[current.id]);
    if (current.id !== shownId) { shownId = current.id; speakShown(); }
  }
  /* 新卡出現時自動唸單字（設定可關）。看中文想英文時不唸，不然等於先講答案 */
  var shownId = null;
  function speakShown() {
    var s = state.settings;
    if (s.speakOnShow !== 'yes' || s.direction !== 'en' || revealed || !current) return;
    if (document.hidden || Date.now() - lastGesture > 1500) return;
    speak(byId[current.id].w, wordEl());
  }
  function stillValid(id, q) {
    if (q.learn.indexOf(id) >= 0 || q.review.indexOf(id) >= 0 || q.fresh.indexOf(id) >= 0) return true;
    return q.pendingLearn.some(function (p) { return p.id === id; }) && (forceAhead || current.ahead);
  }
  function emptyMessage(q) {
    if (q.pendingLearn.length) {
      var wait = Math.max(1, Math.ceil((q.pendingLearn[0].due - Date.now()) / SRS.MIN));
      return '<strong>先休息一下</strong>還有 ' + q.pendingLearn.length + ' 張學習中的卡，' + wait + ' 分鐘後回來。' +
        '<br><button class="tool-btn" id="aheadBtn">不等了，現在複習</button>';
    }
    if (q.freshTotal > 0) {
      return '<strong>今天的新字額度用完了</strong>目前每天 ' + state.settings.newPerDay + ' 個新字。這一級還有 ' + q.freshTotal + ' 個沒學過的字。' +
        '<br><button class="tool-btn" id="moreNewBtn">再多學 10 個</button>';
    }
    var f = levelFilter();
    var cards = levelCards();
    var learned = cards.filter(function (w) { return rec(w.id).st !== 'new'; }).length;
    if (learned === cards.length) return '<strong>今天這一級都複習完了</strong>明天再來，到期的卡會自動出現。';
    return '<strong>這一級沒有要複習的卡</strong>' + (f === 'all' ? '' : '可以切到其他級別，或到「單字庫」看看。');
  }

  function renderCard(w) {
    var s = state.settings;
    var front = $('#cardFront'), back = $('#cardBack');
    var badge = state.level === 'all' ? '<span class="level-badge" data-level="' + w.lv + '">衝 ' + w.lv + ' 分</span>' : '';
    var wordBtn = '<div class="word-line"><button class="speakable word" data-say="word" aria-label="唸單字 ' + esc(w.w) + '">' + esc(w.w) + SPK + '</button>' +
      '<span class="pos">' + esc(posText(w.d[0])) + '</span></div>' + phonHtml(w, 'phon-line');
    var meanings = '<div class="meaning-list">' + w.d.map(function (d) {
      return '<div class="meaning"><span class="pos">' + esc(posText(d)) + '</span>' + esc(d[1]) + '</div>';
    }).join('') + '</div>';
    var exHtml = exampleHtml(w, s.frontExample === 'cloze' && s.direction === 'en' && !revealed);
    var exBtn = '<button class="speakable example" data-say="ex" aria-label="唸例句">' + exHtml + SPK + '</button>';
    var zh = '<div class="example-zh">' + esc(w.zh) + '</div>';

    if (s.direction === 'en') {
      front.innerHTML = badge + wordBtn + (s.frontExample !== 'hide' ? exBtn : '');
      back.innerHTML = meanings + (s.frontExample === 'hide' ? exBtn : '') + zh;
    } else {
      front.innerHTML = badge + meanings + (s.frontExample !== 'hide' ? zh : '');
      back.innerHTML = wordBtn + exBtn + (s.frontExample === 'hide' ? zh : '');
    }
    back.hidden = !revealed;
    $('#revealBtn').hidden = revealed;
    $('#ratings').hidden = !revealed;
    $('#knownBtn').hidden = !(current && current.kind === 'new');

    if (revealed) {
      var pv = SRS.previews(rec(w.id), Date.now());
      for (var r = 1; r <= 4; r++) $('#iv' + r).textContent = pv[r];
    }
  }
  function exampleHtml(w, cloze) {
    var a = w.hl[0], b = w.hl[1];
    var pre = esc(w.ex.slice(0, a)), mid = esc(w.ex.slice(a, b)), post = esc(w.ex.slice(b));
    if (cloze) return pre + '<span class="cloze" aria-label="空格"></span>' + post;
    return pre + '<mark>' + mid + '</mark>' + post;
  }
  function wordEl() { return $('#card .word'); }
  function exEl() { return $('#card .example'); }

  function reveal() {
    if (!current || revealed) return;
    revealed = true;
    renderCard(byId[current.id]);
    var w = byId[current.id], s = state.settings;
    if (s.autoSpeak === 'word') speak(w.w, wordEl());
    else if (s.autoSpeak === 'both') speakSeq([{ text: w.w, el: wordEl() }, { text: w.ex, el: exEl() }]);
  }
  function rate(rating) {
    if (!current || !revealed) return;
    var id = current.id;
    var before = rec(id);
    undoStack.push({ id: id, prev: JSON.parse(JSON.stringify(before)), daily: JSON.parse(JSON.stringify(state.daily)), logLen: state.log.length });
    if (undoStack.length > 50) undoStack.shift();
    var after = SRS.apply(before, rating, Date.now());
    setRec(id, after);
    if (before.st === 'new') state.daily.newCount += 1;
    state.log.push([Date.now(), id, rating, before.st]);
    if (state.log.length > 30000) state.log = state.log.slice(-25000);
    save();
    current = null; revealed = false; forceAhead = false; shownId = null;
    stopSpeech();
    renderAll();
  }
  function undo() {
    var u = undoStack.pop();
    if (!u) return;
    setRec(u.id, Object.assign({}, u.prev, { last: Date.now() }));  // 蓋過雲端那筆較新的評分
    state.daily = u.daily;
    state.log.length = u.logLen;
    save();
    current = { id: u.id, kind: u.prev.st === 'new' ? 'new' : u.prev.st === 'review' ? 'review' : 'learn', ahead: true };
    revealed = false; shownId = null;
    renderAll();
    toast('已復原：' + byId[u.id].w);
  }
  function markKnown(id, known) {
    var r = rec(id);
    if (known) { r = Object.assign({}, r, { st: 'known', due: 0, last: Date.now() }); }
    else { r = Object.assign(SRS.newRecord(), { last: Date.now() }); }
    setRec(id, r);
    save();
  }

  /* ---------- 快速篩選 ---------- */
  function startScreen() {
    var list = levelCards().filter(function (w) { return rec(w.id).st === 'new'; }).map(function (w) { return w.id; });
    if (!list.length) { toast('這一級沒有新字可以篩'); return; }
    screen = { list: list, idx: 0, history: [] };
    renderAll();
  }
  function renderScreen() {
    var sc = $('#screen');
    sc.hidden = false;
    $('#card').hidden = true; $('#ratings').hidden = true; $('#studyEmpty').hidden = true;
    $('#counts').hidden = true; $('#studyTools').hidden = true;
    if (screen.idx >= screen.list.length) { endScreen(true); return; }
    var w = byId[screen.list[screen.idx]];
    var btn = $('#screenWord');
    btn.innerHTML = esc(w.w) + SPK;
    $('#screenDone').textContent = screen.idx;
    $('#screenTotal').textContent = screen.list.length;
    $('#screenUndo').disabled = !screen.history.length;
  }
  function screenAnswer(known) {
    var id = screen.list[screen.idx];
    screen.history.push({ id: id, prev: JSON.parse(JSON.stringify(rec(id))) });
    if (known) markKnown(id, true);
    screen.idx += 1;
    renderTabs();
    renderScreen();
  }
  function screenUndo() {
    var h = screen.history.pop();
    if (!h) return;
    setRec(h.id, h.prev); save();
    screen.idx -= 1;
    renderTabs();
    renderScreen();
  }
  function endScreen(done) {
    var n = screen.history.filter(function (h) { return rec(h.id).st === 'known'; }).length;
    screen = null;
    $('#counts').hidden = false; $('#studyTools').hidden = false;
    current = null;
    renderAll();
    toast((done ? '篩完了，' : '') + '標了 ' + n + ' 個字為已會');
  }

  /* ---------- 單字庫 ---------- */
  var openItem = null;
  function stateLabel(r) {
    return { 'new': '新字', learning: '學習中', relearning: '重學中', review: '複習中', known: '已會', suspended: '停用' }[r.st] || r.st;
  }
  function renderBrowse() {
    var qText = ($('#searchBox').value || '').trim().toLowerCase();
    var sf = $('#stateFilter').value;
    var now = Date.now();
    var items = levelCards().filter(function (w) {
      var r = rec(w.id);
      if (sf === 'lapsed') { if ((r.lapses || 0) < 2) return false; }
      else if (sf === 'learning') { if (r.st !== 'learning' && r.st !== 'relearning') return false; }
      else if (sf !== 'all' && r.st !== sf) return false;
      if (!qText) return true;
      return w.w.toLowerCase().indexOf(qText) >= 0 || w.d.some(function (d) { return d[1].indexOf(qText) >= 0; }) || w.ex.toLowerCase().indexOf(qText) >= 0;
    });
    $('#browseSummary').textContent = '共 ' + items.length + ' 個字' + (qText ? '（搜尋「' + qText + '」）' : '');
    var ul = $('#wordList');
    var html = items.slice(0, browseLimit).map(function (w) {
      var r = rec(w.id);
      var open = openItem === w.id;
      var meta = '<span class="state state-' + r.st + '">' + stateLabel(r) + '</span>';
      if (r.st === 'review' || r.st === 'learning' || r.st === 'relearning') meta += '<span>' + SRS.fmtDue(r.due, now) + '</span>';
      if (state.level === 'all') meta = '<span class="level-badge" data-level="' + w.lv + '" style="margin:0">' + w.lv + '</span>' + meta;
      var body = '';
      if (open) {
        body = '<div class="wl-body">' +
          '<button class="speakable example" data-say-text="' + esc(w.ex) + '">' + exampleHtml(w, false) + SPK + '</button>' +
          '<div class="example-zh">' + esc(w.zh) + '</div>' +
          '<div class="browse-summary">複習 ' + (r.reps || 0) + ' 次・忘記 ' + (r.lapses || 0) + ' 次' + (r.st === 'review' ? '・間隔 ' + r.iv + ' 天' : '') + '</div>' +
          '<div class="wl-actions">' +
            (r.st === 'known' ? '<button class="tool-btn" data-act="unknown">取消已會，重新學</button>' : '<button class="tool-btn" data-act="known">標記為已會</button>') +
            (r.st === 'suspended' ? '<button class="tool-btn" data-act="resume">恢復</button>' : (r.st !== 'known' ? '<button class="tool-btn" data-act="suspend">停用</button>' : '')) +
            (r.st !== 'new' ? '<button class="tool-btn" data-act="reset">重置進度</button>' : '') +
          '</div></div>';
      }
      return '<li class="wl-item" data-id="' + w.id + '">' +
        '<div class="wl-head" role="button" tabindex="0" aria-expanded="' + open + '">' +
          '<span class="wl-main"><button class="speakable wl-word" data-say-text="' + esc(w.w) + '" aria-label="唸 ' + esc(w.w) + '">' + esc(w.w) + SPK + '</button>' + phonHtml(w) +
          '<span class="wl-def">' + esc(defsText(w)) + '</span></span>' +
          '<span class="wl-meta">' + meta + '</span>' +
        '</div>' + body + '</li>';
    }).join('');
    if (items.length > browseLimit) html += '<li class="wl-more"><button class="tool-btn" id="moreBtn">顯示更多（還有 ' + (items.length - browseLimit) + ' 個）</button></li>';
    if (!items.length) html = '<li class="empty" style="border:0">沒有符合的字</li>';
    ul.innerHTML = html;
  }

  /* ---------- 統計 ---------- */
  function renderStats() {
    var now = Date.now(), today = todayKey();
    var todayLog = state.log.filter(function (e) { return todayKey(e[0]) === today; });
    var correct = todayLog.filter(function (e) { return e[2] > 1; }).length;
    var newToday = todayLog.filter(function (e) { return e[3] === 'new'; }).length;
    var days = {};
    state.log.forEach(function (e) { var k = todayKey(e[0]); days[k] = (days[k] || 0) + 1; });
    var streak = 0, cursor = new Date();
    if (!days[today]) cursor.setDate(cursor.getDate() - 1);
    while (days[todayKey(cursor.getTime())]) { streak++; cursor.setDate(cursor.getDate() - 1); }
    var total = WORDS.length;
    var known = 0, reviewN = 0, learnN = 0;
    WORDS.forEach(function (w) { var r = rec(w.id); if (r.st === 'known') known++; else if (r.st === 'review') reviewN++; else if (r.st === 'learning' || r.st === 'relearning') learnN++; });
    $('#statToday').innerHTML =
      '<div class="stat"><b>' + todayLog.length + '</b><span>今天複習張數</span></div>' +
      '<div class="stat"><b>' + (todayLog.length ? Math.round(correct / todayLog.length * 100) + '%' : '–') + '</b><span>今天記得的比例</span></div>' +
      '<div class="stat"><b>' + newToday + '</b><span>今天新學</span></div>' +
      '<div class="stat"><b>' + streak + '</b><span>連續天數</span></div>';

    $('#levelBars').innerHTML = [400, 600, 800, 990].map(function (lv) {
      var cards = WORDS.filter(function (w) { return w.lv === lv; });
      var k = 0, rv = 0, ln = 0;
      cards.forEach(function (w) { var r = rec(w.id); if (r.st === 'known') k++; else if (r.st === 'review') rv++; else if (r.st === 'learning' || r.st === 'relearning') ln++; });
      var n = cards.length;
      return '<div class="lb"><span class="lb-name level-badge" data-level="' + lv + '" style="margin:0">' + lv + '</span>' +
        '<div class="lb-bar"><i class="seg-review" style="width:' + (rv / n * 100) + '%"></i><i class="seg-learning" style="width:' + (ln / n * 100) + '%"></i><i class="seg-known" style="width:' + (k / n * 100) + '%"></i></div>' +
        '<span class="lb-num">' + (rv + ln + k) + ' / ' + n + '</span></div>';
    }).join('') + '<div class="legend"><span><i style="background:var(--good)"></i>複習中 ' + reviewN + '</span><span><i style="background:var(--again)"></i>學習中 ' + learnN + '</span><span><i style="background:var(--ink);opacity:.55"></i>已會 ' + known + '</span><span>還沒學 ' + (total - reviewN - learnN - known) + '</span></div>';

    var fc = [0, 0, 0, 0, 0, 0, 0], start = SRS.startOfDay(now);
    WORDS.forEach(function (w) {
      var r = rec(w.id);
      if (r.st !== 'review') return;
      var d = Math.floor((Math.max(r.due, start) - start) / SRS.DAY);
      if (d >= 0 && d < 7) fc[d]++;
    });
    var mx = Math.max.apply(null, fc.concat([1]));
    var labels = ['今天', '明天'];
    $('#forecast').innerHTML = fc.map(function (n, i) {
      var d = new Date(start + i * SRS.DAY);
      var lab = labels[i] || (d.getMonth() + 1) + '/' + d.getDate();
      return '<div class="fc"><b>' + n + '</b><i style="height:' + Math.round(n / mx * 70) + 'px"></i><span>' + lab + '</span></div>';
    }).join('');

    var cells = '', end = new Date(start);
    var startDay = new Date(start - (12 * 7 - 1) * SRS.DAY);
    startDay.setDate(startDay.getDate() - startDay.getDay());
    for (var t = startDay.getTime(); t <= end.getTime(); t += SRS.DAY) {
      var k2 = todayKey(t), c = days[k2] || 0;
      var lvl = c === 0 ? 0 : c < 15 ? 1 : c < 40 ? 2 : c < 80 ? 3 : 4;
      cells += '<i data-l="' + lvl + '" title="' + k2 + '：' + c + ' 張"></i>';
    }
    $('#heat').innerHTML = cells;

    var lapsed = WORDS.filter(function (w) { return (rec(w.id).lapses || 0) > 0; })
      .sort(function (a, b) { return rec(b.id).lapses - rec(a.id).lapses; }).slice(0, 20);
    $('#lapsedList').innerHTML = lapsed.length ? lapsed.map(function (w) {
      return '<li><b>' + esc(w.w) + '</b> <span>' + esc(w.d[0][1]) + '・忘了 ' + rec(w.id).lapses + ' 次</span></li>';
    }).join('') : '<li><span>還沒有忘記過的字</span></li>';
  }

  /* ---------- 設定 ---------- */
  function renderSettings() {
    renderSync();
    var f = $('#settingsForm');
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      if (f.elements[k]) f.elements[k].value = state.settings[k];
    });
    loadVoices();
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- 事件 ---------- */
  $all('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      var lv = t.getAttribute('data-level');
      state.level = lv === 'all' ? 'all' : Number(lv);
      current = null; revealed = false; openItem = null; browseLimit = 80;
      if (screen) screen = null;
      $('#counts').hidden = false; $('#studyTools').hidden = false;
      save(); renderAll();
    });
  });
  $all('.view-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      state.view = b.getAttribute('data-view');
      save(); renderViews();
    });
  });

  $('#revealBtn').addEventListener('click', reveal);
  $('#ratings').addEventListener('click', function (e) {
    var b = e.target.closest('.rate'); if (b) rate(Number(b.getAttribute('data-rating')));
  });
  $('#undoBtn').addEventListener('click', undo);
  $('#screenBtn').addEventListener('click', startScreen);
  $('#knownBtn').addEventListener('click', function () {
    if (!current) return;
    markKnown(current.id, true);
    toast('已標記為已會：' + byId[current.id].w);
    current = null; revealed = false;
    renderAll();
  });
  $('#studyEmpty').addEventListener('click', function (e) {
    if (e.target.id === 'aheadBtn') { forceAhead = true; current = null; renderStudy(); }
    if (e.target.id === 'moreNewBtn') { rollDay(); state.daily.extraNew = (state.daily.extraNew || 0) + 10; save(); current = null; renderAll(); }
  });
  $('#card').addEventListener('click', function (e) {
    var b = e.target.closest('.speakable'); if (!b || !current) return;
    var w = byId[current.id];
    speak(b.getAttribute('data-say') === 'word' ? w.w : w.ex, b);
  });

  $('#screenWord').addEventListener('click', function () { if (screen) speak(byId[screen.list[screen.idx]].w, $('#screenWord')); });
  $('#screenYes').addEventListener('click', function () { screenAnswer(true); });
  $('#screenNo').addEventListener('click', function () { screenAnswer(false); });
  $('#screenUndo').addEventListener('click', screenUndo);
  $('#screenExit').addEventListener('click', function () { endScreen(false); });

  $('#searchBox').addEventListener('input', function () { browseLimit = 80; renderBrowse(); });
  $('#stateFilter').addEventListener('change', function () { browseLimit = 80; renderBrowse(); });
  $('#wordList').addEventListener('click', function (e) {
    var sp = e.target.closest('.speakable');
    if (sp) { e.stopPropagation(); speak(sp.getAttribute('data-say-text'), sp); return; }
    if (e.target.id === 'moreBtn') { browseLimit += 100; renderBrowse(); return; }
    var act = e.target.closest('[data-act]');
    var li = e.target.closest('.wl-item');
    if (!li) return;
    var id = Number(li.getAttribute('data-id'));
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'known') markKnown(id, true);
      if (a === 'unknown' || a === 'reset') { setRec(id, Object.assign(SRS.newRecord(), { last: Date.now() })); save(); }
      if (a === 'suspend') { setRec(id, Object.assign({}, rec(id), { st: 'suspended', last: Date.now() })); save(); }
      if (a === 'resume') { setRec(id, Object.assign(SRS.newRecord(), { last: Date.now() })); save(); }
      current = null;
      renderTabs(); renderBrowse();
      return;
    }
    if (e.target.closest('.wl-head')) { openItem = openItem === id ? null : id; renderBrowse(); }
  });
  $('#wordList').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('wl-head')) {
      e.preventDefault();
      var id = Number(e.target.closest('.wl-item').getAttribute('data-id'));
      openItem = openItem === id ? null : id; renderBrowse();
      var el = document.querySelector('.wl-item[data-id="' + id + '"] .wl-head'); if (el) el.focus();
    }
  });

  $('#settingsForm').addEventListener('change', function (e) {
    var el = e.target; if (!el.name) return;
    state.settings[el.name] = el.type === 'number' ? Math.max(0, Number(el.value) || 0) : el.value;
    state.settingsUpdated = Date.now();
    pending.settings = true;
    save();
    current = null; revealed = false;
    renderTabs();
  });
  $('#exportBtn').addEventListener('click', function () {
    download('toeic-cards-backup-' + todayKey() + '.json', JSON.stringify(state));
    toast('已匯出備份');
  });
  $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var s = JSON.parse(rd.result);
        if (!s || !s.recs) throw new Error('bad');
        if (!confirm('匯入會覆蓋目前這台裝置的進度，確定嗎？')) return;
        localStorage.setItem(STORE_KEY, JSON.stringify(s));
        state = load(); current = null; undoStack = [];
        var now = Date.now();
        Object.keys(state.recs).forEach(function (id) { state.recs[id].last = Math.max(state.recs[id].last || 0, now); pending.ids[id] = true; });
        state.settingsUpdated = now; pending.settings = true; pending.logFrom = 0;
        save(); renderAll(); toast('已匯入備份');
      } catch (err) { toast('這個檔案不是有效的備份'); }
    };
    rd.readAsText(f);
    this.value = '';
  });
  $('#ankiBtn').addEventListener('click', function () {
    var rows = WORDS.map(function (w) {
      var ex = exampleHtml(w, false).replace(/<mark>/g, '<b>').replace(/<\/mark>/g, '</b>');
      var ph = phonText(w, state.settings.phonetic === 'ipa' ? 'ipa' : 'kk');
      return [w.w, ph, defsText(w), ex, w.zh, 'TOEIC' + w.lv].join('\t');
    });
    download('toeic-1000-anki.tsv', '#separator:tab\n#html:true\n#tags column:6\n' + rows.join('\n'), 'text/tab-separated-values');
    toast('已匯出 Anki TSV（匯入時選「製表符」分隔）');
  });
  $('#resetBtn').addEventListener('click', function () {
    if (!confirm('確定要清除全部學習進度？設定會保留，單字不會消失。')) return;
    var now = Date.now();
    state.recs = {};
    WORDS.forEach(function (w) { setRec(w.id, Object.assign(SRS.newRecord(), { last: now })); });
    state.log = []; state.daily = { day: todayKey(), newCount: 0, extraNew: 0 };
    undoStack = []; current = null; save(); renderAll(); toast('進度已清除（雲端的紀錄檔會保留，進度會歸零）');
  });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (screen) {
      if (e.key === '1') { e.preventDefault(); screenAnswer(false); }
      if (e.key === '2') { e.preventDefault(); screenAnswer(true); }
      if (e.key === 'p' || e.key === 'P') speak(byId[screen.list[screen.idx]].w, $('#screenWord'));
      return;
    }
    if (state.view !== 'study' || !current) return;
    var w = byId[current.id];
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!revealed) reveal(); else rate(3); return; }
    if (/^[1-4]$/.test(e.key)) { e.preventDefault(); rate(Number(e.key)); return; }
    if (e.key === 'p' || e.key === 'P') speak(w.w, wordEl());
    if (e.key === 's' || e.key === 'S') speak(w.ex, exEl());
    if (e.key === 'z' || e.key === 'Z') undo();
  });

  // 回到分頁時重新計算（到期時間可能已過）
  document.addEventListener('visibilitychange', function () { if (!document.hidden) renderAll(); });
  setInterval(function () { if (state.view === 'study' && !current && !screen) renderStudy(); }, 30000);

  /* ---------- 雲端同步：合併與介面 ---------- */
  function mergeRemote(remote) {
    var changed = false, localWin = [], settingsLocalWins = false;
    if (remote.recs) {
      Object.keys(remote.recs).forEach(function (id) {
        var rr = remote.recs[id]; if (!rr || !byId[id]) return;
        var lr = state.recs[id];
        var rl = rr.last || 0, ll = lr ? (lr.last || 0) : -1;
        if (!lr && rr.st === 'new' && !rl) return;
        if (rl > ll) { state.recs[id] = rr; changed = true; if (current && current.id === Number(id)) { current = null; revealed = false; } }
        else if (ll > rl) localWin.push(id);
      });
      Object.keys(state.recs).forEach(function (id) { if (!remote.recs[id]) localWin.push(id); });
    }
    if (remote.settings) {
      var ru = remote.settingsUpdated || 0, lu = state.settingsUpdated || 0;
      if (ru > lu) { state.settings = Object.assign({}, DEFAULT_SETTINGS, remote.settings); state.settingsUpdated = ru; changed = true; }
      else if (lu > ru) settingsLocalWins = true;
    }
    if (remote.daily && remote.daily.day === todayKey()) {
      rollDay();
      if ((remote.daily.newCount || 0) > state.daily.newCount) { state.daily.newCount = remote.daily.newCount; changed = true; }
      if ((remote.daily.extraNew || 0) > (state.daily.extraNew || 0)) { state.daily.extraNew = remote.daily.extraNew; changed = true; }
    }
    if (remote.log && remote.log.length) {
      var seen = {}; state.log.forEach(function (e) { seen[e[0] + '-' + e[1]] = 1; });
      var add = 0;
      remote.log.forEach(function (e) { var k = e[0] + '-' + e[1]; if (!seen[k]) { seen[k] = 1; state.log.push(e); add++; } });
      if (add) { state.log.sort(function (a, b) { return a[0] - b[0]; }); changed = true; pending.logFrom = state.log.length; }
    }
    if (changed) persist();
    return { changed: changed, localWinIds: localWin, settingsLocalWins: settingsLocalWins };
  }
  function fmtTime(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function renderSync() {
    var box = $('#syncBox'), sub = $('.brand-sub');
    if (!window.Sync) return;
    var i = Sync.info();
    var html = '';
    if (i.status === 'off') {
      html = '<p class="note">雲端同步未啟用' + (i.msg ? '：' + i.msg : '') + '。進度只存在這台裝置。</p>';
      sub.textContent = '間隔複習・點一下就發音';
    } else if (!i.user) {
      html = '<p class="note">登入 Google 之後，iPad、手機、電腦的進度會互相同步；沒登入也能用，只是只存在這台裝置。</p>' +
        '<div class="btn-row"><button type="button" class="tool-btn" id="signInBtn">用 Google 帳號登入</button></div>' +
        (i.msg ? '<p class="note sync-err">' + esc(i.msg) + '</p>' : '');
      sub.textContent = '未登入・只存本機';
    } else {
      var st = i.status === 'syncing' ? '同步中…' : i.status === 'error' ? '出錯' : (i.lastSync ? '已同步 ' + fmtTime(i.lastSync) : '已連線');
      html = '<div class="sync-user">' + (i.user.photo ? '<img src="' + esc(i.user.photo) + '" alt="" referrerpolicy="no-referrer">' : '') +
        '<div><b>' + esc(i.user.name || '') + '</b><span>' + esc(i.user.email || '') + '</span></div>' +
        '<span class="sync-state sync-' + i.status + '">' + st + '</span></div>' +
        (i.msg ? '<p class="note sync-err">' + esc(i.msg) + '</p>' : '') +
        '<div class="btn-row"><button type="button" class="tool-btn" id="syncNowBtn">立即同步</button><button type="button" class="tool-btn" id="signOutBtn">登出</button></div>';
      sub.textContent = (i.status === 'error' ? '同步出錯・' : '已同步・') + (i.user.name || i.user.email || '');
    }
    box.innerHTML = html;
  }
  $('#view-settings').addEventListener('click', function (e) {
    if (e.target.id === 'signInBtn') Sync.signIn();
    if (e.target.id === 'signOutBtn') { if (confirm('登出後這台裝置會保留目前進度，但不再同步。確定？')) Sync.signOut(); }
    if (e.target.id === 'syncNowBtn') { Sync.flush(); toast('已送出'); }
  });

  renderAll();

  if (window.Sync) {
    Sync.onStatus(renderSync);
    Sync.init({
      getState: function () { return state; },
      mergeRemote: mergeRemote,
      clearPending: clearPending,
      render: function () { renderAll(); },
      toast: toast
    });
    renderSync();
  }
  // 除錯用（瀏覽器 console 可呼叫）
  window.ToeicDebug = { state: function () { return state; }, mergeRemote: mergeRemote };

  // 離線快取（file:// 直接開啟時不註冊）
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    var hadController = !!navigator.serviceWorker.controller;
    var reloaded = false;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // 每次打開都檢查有沒有新版
      try { reg.update(); } catch (e) {}
    }).catch(function () {});
    // 新版快取接手後自動重載一次（第一次安裝不重載）
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
  }
})();
