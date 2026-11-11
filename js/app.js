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
  var BASE_N = WORDS.length;         // 字表本身的字數；陣列後面接的是「自選」單字
  function idOf(s) { return /^\d+$/.test(String(s)) ? Number(s) : String(s); }   // 字表的字是數字 id，自選的是 'c_xxx'
  function lvOf(v) { return v === 'all' || v === 'my' ? v : Number(v); }
  function lvLabel(lv) { return lv === 'my' ? '自選' : '衝 ' + lv + ' 分'; }
  function lvShort(lv) { return lv === 'my' ? '自選' : String(lv); }
  function levels() { return WORDS.length > BASE_N ? [400, 600, 800, 990, 'my'] : [400, 600, 800, 990]; }

  var DEFAULT_SETTINGS = {
    newPerDay: 20,
    newOrder: 'list',
    direction: 'en',
    frontExample: 'show',
    autoSpeak: 'word',
    speakOnShow: 'yes',
    phonetic: 'kk',
    practiceScope: 'learned',
    rate: '0.85',
    voice: ''
  };

  var state = load();
  rebuildCustom();
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
    // 練習成績：practice[題型][題號] = [作答次數, 答對數, 最後作答時間, 最後一次答對數, 最後一次選的選項（字串）]
    s.practice = s.practice || {};
    ['p5', 'read', 'listen'].forEach(function (k) { s.practice[k] = s.practice[k] || {}; });
    // 每天的練習量：pday[日期] = { p5: [題數, 答對], read: [...], listen: [...], t: 最後更新時間 }
    s.pday = s.pday || {};
    // 自選單字（在練習題裡點一下存下來、字表以外的字）
    s.custom = s.custom || {};
    return s;
  }
  /* 自選單字：state.custom[id] = { w, kk, ip, d: ['詞性|中文', …], ex, zh, hl: [起, 迄], t, del }
     del = 1 是刪除記號（留著給雲端同步用）。這些字接在 WORDS 後面，lv 是 'my'，排程和字表的字一樣。
     d 存成字串陣列是因為 Firestore 不能存巢狀陣列。 */
  function customId(word) { return 'c_' + String(word).toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
  function rebuildCustom() {
    WORDS.length = BASE_N;
    Object.keys(byId).forEach(function (k) { if (byId[k].custom) delete byId[k]; });
    Object.keys(state.custom).filter(function (id) { var c = state.custom[id]; return c && !c.del && c.w; })
      .sort(function (a, b) { return (state.custom[a].t || 0) - (state.custom[b].t || 0); })
      .forEach(function (id) {
        var c = state.custom[id];
        var d = (c.d || []).map(function (x) { var i = String(x).indexOf('|'); return [String(x).slice(0, i), String(x).slice(i + 1)]; });
        var w = { id: id, w: c.w, lv: 'my', kk: c.kk || '', ip: c.ip || '', d: d.length ? d : [['', '']],
                  ex: c.ex || '', zh: c.zh || '', hl: c.hl && c.hl.length === 2 ? c.hl : [0, 0], custom: true };
        WORDS.push(w); byId[id] = w;
      });
  }
  function addCustom(e) {
    var id = customId(e.w), now = Date.now();
    state.custom[id] = { w: e.w, kk: e.kk || '', ip: e.ip || '', d: (e.d || []).map(function (x) { return x[0] + '|' + x[1]; }),
                         ex: e.ex || '', zh: e.zh || '', hl: e.hl || [0, 0], t: now, del: 0 };
    pending.custom[id] = true;
    rebuildCustom();
    if (!state.recs[id] || state.recs[id].st === 'new') setRec(id, Object.assign(SRS.newRecord(), { last: now, pri: now }));
    save(); renderTabs();
    return id;
  }
  function removeCustom(id) {
    if (!state.custom[id]) return;
    state.custom[id] = { t: Date.now(), del: 1 };
    pending.custom[id] = true;
    delete state.recs[id]; pending.ids[id] = true;
    rebuildCustom();
    if (current && current.id === id) { current = null; revealed = false; }
    undoStack = [];
    save(); renderTabs();
  }
  /* 字表裡還沒學的字：排到新字的最前面（on = false 取消） */
  function prioritize(id, on) {
    var r = rec(id);
    if (r.st !== 'new') return false;
    var now = Date.now();
    setRec(id, Object.assign({}, r, { pri: on ? now : 0, last: now }));
    save();
    return true;
  }
  // 還沒推到雲端的變更
  var pending = { ids: {}, settings: false, logFrom: state.log.length, practice: {}, pdays: {}, custom: {} };
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
    var pr = Object.keys(pending.practice), pd = Object.keys(pending.pdays), cu = Object.keys(pending.custom);
    if (ids.length || pending.settings || entries.length || pr.length || pd.length || cu.length) {
      Sync.noteChange({ ids: ids, settings: pending.settings, daily: true, log: entries, practice: pr, pdays: pd, custom: cu });
    }
    clearPending();
  }
  function clearPending() { pending = { ids: {}, settings: false, logFrom: state.log.length, practice: {}, pdays: {}, custom: {} }; }
  function notePractice(type, id) { pending.practice[type + '|' + id] = true; pending.pdays[todayKey()] = true; }
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
  function levelFilter() { return lvOf(state.level); }
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
  // 最近一次使用者操作的時間：自動發音只在操作之後觸發（瀏覽器不允許頁面自己出聲）
  var lastGesture = 0;
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () { lastGesture = Date.now(); }, true);
  });
  var cancelBusyAt = 0, seqId = 0;
  function stopSpeech() {
    seqId++;                       // 讓還在排隊的句子不再接著唸
    if (!synth) return;
    if (synth.speaking || synth.pending) cancelBusyAt = Date.now();
    synth.cancel();
    clearSpeaking();
  }
  /* items: [{text, el, pause}]，pause 是唸完後停頓的毫秒數；onDone 在整串唸完或中斷時呼叫 */
  function speakSeq(items, onDone) {
    if (!synth) { toast('這個瀏覽器不支援語音發音'); if (onDone) onDone(); return; }
    stopSpeech();
    var my = seqId, i = 0;
    function next() {
      if (my !== seqId) return;
      if (i >= items.length) { if (onDone) onDone(); return; }
      var it = items[i++];
      var u = new SpeechSynthesisUtterance(it.text);
      u.lang = 'en-US';
      u.rate = parseFloat(state.settings.rate) || 1;
      var v = pickVoice();
      if (v) u.voice = v;
      u.onstart = function () { clearSpeaking(); if (it.el) { it.el.classList.add('is-speaking'); speakingEl = it.el; } };
      u.onend = function () { clearSpeaking(); if (it.pause) setTimeout(next, it.pause); else next(); };
      u.onerror = function () { clearSpeaking(); if (my === seqId && onDone) onDone(); };
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
      var n = dueCount(lvOf(lv));
      t.querySelector('.tab-count').textContent = n ? String(n) : '';
    });
    var pill = $('#deckPill');
    if (state.level === 'all') pill.innerHTML = '全部 <span class="pill-num">' + WORDS.length + '</span> 字';
    else if (state.level === 'my') pill.innerHTML = '自選單字 <span class="pill-num">' + (WORDS.length - BASE_N) + '</span> 個';
    else pill.innerHTML = '衝 <span class="pill-num">' + state.level + '</span> 分必備單字';
  }
  function renderViews() {
    $all('.view-btn').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-view') === state.view); });
    $all('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + state.view); });
    if (state.view === 'study') renderStudy();
    if (state.view === 'browse') renderBrowse();
    if (state.view === 'stats') renderStats();
    if (state.view === 'settings') renderSettings();
    if (state.view === 'practice' && window.Practice) Practice.render();
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
      if (!pick) forceAhead = false;   // 學習中的卡都出完了，下次回到正常節奏
      current = pick;
      revealed = false;
    }
    var card = $('#card'), empty = $('#studyEmpty'), ratings = $('#ratings');
    $('#screenBtn').hidden = !q.freshTotal;
    if (!current) {
      card.hidden = true; ratings.hidden = true;
      if (empty.hidden) emptyShownAt = Date.now();
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
  var emptyShownAt = 0;   // 休息畫面出現的時間（快捷鍵防誤觸用）
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
    if (state.level === 'my' && WORDS.length === BASE_N) {
      return '<strong>還沒有自選單字</strong>做「練習」的題目時，點一下不認識的英文字，就會存到這裡，之後和其他單字卡一樣排進來背。';
    }
    if (q.pendingLearn.length) {
      var wait = Math.max(1, Math.ceil((q.pendingLearn[0].due - Date.now()) / SRS.MIN));
      return '<strong>先休息一下</strong>還有 ' + q.pendingLearn.length + ' 張學習中的卡，' + wait + ' 分鐘後回來。' +
        '<br><button class="tool-btn" id="aheadBtn">不等了，現在複習 <kbd>空白鍵</kbd></button>';
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
    var badge = state.level === 'all' ? '<span class="level-badge" data-level="' + w.lv + '">' + lvLabel(w.lv) + '</span>' : '';
    var wordBtn = '<div class="word-line"><button class="speakable word" data-say="word" aria-label="唸單字 ' + esc(w.w) + '">' + esc(w.w) + SPK + '</button>' +
      '<span class="pos">' + esc(posText(w.d[0])) + '</span></div>' + phonHtml(w, 'phon-line');
    var meanings = '<div class="meaning-list">' + w.d.map(function (d) {
      return '<div class="meaning"><span class="pos">' + esc(posText(d)) + '</span>' + esc(d[1]) + '</div>';
    }).join('') + '</div>';
    var exHtml = exampleHtml(w, s.frontExample === 'cloze' && s.direction === 'en' && !revealed);
    var exBtn = w.ex ? '<button class="speakable example" data-say="ex" aria-label="唸例句">' + exHtml + SPK + '</button>' : '';   // 自選的字不一定有例句
    var zh = w.zh ? '<div class="example-zh">' + esc(w.zh) + '</div>' : '';

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
    current = null; revealed = false; shownId = null;
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
      if (state.level === 'all') meta = '<span class="level-badge" data-level="' + w.lv + '" style="margin:0">' + lvShort(w.lv) + '</span>' + meta;
      var body = '';
      if (open) {
        body = '<div class="wl-body">' +
          (w.ex ? '<button class="speakable example" data-say-text="' + esc(w.ex) + '">' + exampleHtml(w, false) + SPK + '</button>' : '') +
          (w.zh ? '<div class="example-zh">' + esc(w.zh) + '</div>' : '') +
          '<div class="browse-summary">複習 ' + (r.reps || 0) + ' 次・忘記 ' + (r.lapses || 0) + ' 次' + (r.st === 'review' ? '・間隔 ' + r.iv + ' 天' : '') + '</div>' +
          '<div class="wl-actions">' +
            (r.st === 'known' ? '<button class="tool-btn" data-act="unknown">取消已會，重新學</button>' : '<button class="tool-btn" data-act="known">標記為已會</button>') +
            (r.st === 'suspended' ? '<button class="tool-btn" data-act="resume">恢復</button>' : (r.st !== 'known' ? '<button class="tool-btn" data-act="suspend">停用</button>' : '')) +
            (r.st !== 'new' ? '<button class="tool-btn" data-act="reset">重置進度</button>' : '') +
            (w.custom ? '<button class="tool-btn danger" data-act="remove">從自選移除</button>' : '') +
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
    Object.keys(state.pday).forEach(function (k) {
      var d = state.pday[k], n = 0;
      ['p5', 'read', 'listen'].forEach(function (t) { if (d[t]) n += d[t][0] || 0; });
      if (n) days[k] = (days[k] || 0) + n;
    });
    if (window.Practice) $('#pracStats').innerHTML = Practice.statsHtml();
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

    $('#levelBars').innerHTML = levels().map(function (lv) {
      var cards = WORDS.filter(function (w) { return w.lv === lv; });
      var k = 0, rv = 0, ln = 0;
      cards.forEach(function (w) { var r = rec(w.id); if (r.st === 'known') k++; else if (r.st === 'review') rv++; else if (r.st === 'learning' || r.st === 'relearning') ln++; });
      var n = cards.length;
      return '<div class="lb" role="button" tabindex="0" data-stat-lv="' + lv + '" title="看這一級有哪些字"><span class="lb-name level-badge" data-level="' + lv + '" style="margin:0">' + lvShort(lv) + '</span>' +
        '<div class="lb-bar"><i class="seg-review" style="width:' + (rv / n * 100) + '%"></i><i class="seg-learning" style="width:' + (ln / n * 100) + '%"></i><i class="seg-known" style="width:' + (k / n * 100) + '%"></i></div>' +
        '<span class="lb-num">' + (rv + ln + k) + ' / ' + n + '</span></div>';
    }).join('') + '<div class="legend">' + STAT_GROUPS.map(function (g) {
      var n = g[0] === 'review' ? reviewN : g[0] === 'learning' ? learnN : g[0] === 'known' ? known : total - reviewN - learnN - known;
      return '<button type="button" class="legend-btn' + (statSel && statSel.g === g[0] ? ' is-on' : '') + '" data-stat-g="' + g[0] + '" aria-expanded="' + !!(statSel && statSel.g === g[0]) + '">' +
        '<i style="background:' + g[2] + '"></i>' + g[1] + ' <b>' + n + '</b></button>';
    }).join('') + '</div><p class="note legend-note">點上面任一項，會列出是哪些字。</p>';
    renderStatWords();

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
      cells += '<i data-l="' + lvl + '" title="' + k2 + '：' + c + ' 次"></i>';
    }
    $('#heat').innerHTML = cells;

    var lapsed = WORDS.filter(function (w) { return (rec(w.id).lapses || 0) > 0; })
      .sort(function (a, b) { return rec(b.id).lapses - rec(a.id).lapses; }).slice(0, 20);
    $('#lapsedList').innerHTML = lapsed.length ? lapsed.map(function (w) {
      return '<li><b>' + esc(w.w) + '</b> <span>' + esc(w.d[0][1]) + '・忘了 ' + rec(w.id).lapses + ' 次</span></li>';
    }).join('') : '<li><span>還沒有忘記過的字</span></li>';
  }

  /* 統計頁：點「複習中／學習中／已會／還沒學」列出是哪些字 */
  var STAT_GROUPS = [['review', '複習中', 'var(--good)'], ['learning', '學習中', 'var(--again)'], ['known', '已會', 'var(--ink);opacity:.55'], ['new', '還沒學', '#cdbfae']];
  var statSel = null;               // { g: 群組, lv: 'all' 或級別, limit: 顯示幾個 }
  function statGroup(r) {
    return r.st === 'review' ? 'review' : (r.st === 'learning' || r.st === 'relearning') ? 'learning' : r.st === 'known' ? 'known' : 'new';
  }
  function renderStatWords() {
    var box = $('#statWords'); if (!box) return;
    if (!statSel) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    var now = Date.now(), g = statSel.g, endToday = SRS.startOfDay(now) + SRS.DAY;
    var name = STAT_GROUPS.filter(function (x) { return x[0] === g; })[0][1];
    var all = WORDS.filter(function (w) { return statGroup(rec(w.id)) === g; });
    var byLv = {};
    all.forEach(function (w) { byLv[w.lv] = (byLv[w.lv] || 0) + 1; });
    var items = all.filter(function (w) { return statSel.lv === 'all' || w.lv === statSel.lv; });
    if (g === 'review' || g === 'learning') items.sort(function (a, b) { return rec(a.id).due - rec(b.id).due; });
    var h = '<div class="sw-head"><b>' + name + '的字</b><span>' + items.length + ' 個</span><button type="button" class="link-btn" data-stat-close>收起</button></div>' +
      '<div class="prac-scope sw-levels"><button type="button" class="chip' + (statSel.lv === 'all' ? ' is-on' : '') + '" data-stat-lv="all">全部 ' + all.length + '</button>' +
      [400, 600, 800, 990, 'my'].map(function (lv) {
        if (!byLv[lv] && statSel.lv !== lv) return '';          // 沒有字的級別不列
        return '<button type="button" class="chip' + (statSel.lv === lv ? ' is-on' : '') + '" data-stat-lv="' + lv + '">' + (lv === 'my' ? '自選' : lv + ' 分') + ' ' + (byLv[lv] || 0) + '</button>';
      }).join('') + '</div>';
    var note = '';
    if (g === 'review' && items.length) {
      var dueToday = 0, week = 0, mature = 0, sum = 0;
      items.forEach(function (w) {
        var r = rec(w.id);
        if (r.due < endToday) dueToday++;
        if (r.due < endToday + 6 * SRS.DAY) week++;
        if ((r.iv || 0) >= 21) mature++;
        sum += r.iv || 0;
      });
      note = '今天到期 <b>' + dueToday + '</b> 個・7 天內到期 <b>' + week + '</b> 個・平均間隔 <b>' + Math.round(sum / items.length) + '</b> 天・間隔 21 天以上（已經很熟）<b>' + mature + '</b> 個。快到期的排前面。';
    } else if (g === 'learning' && items.length) {
      var re = items.filter(function (w) { return rec(w.id).st === 'relearning'; }).length;
      note = '新學的 <b>' + (items.length - re) + '</b> 個・忘記後重學的 <b>' + re + '</b> 個。這些字要再答對才會進到「複習中」；可以複習的排前面。';
    } else if (g === 'known') {
      note = '你標成「已會」的字，不會出現在複習裡。要改回來，到「單字庫」點那個字，按「取消已會」。';
    } else if (g === 'new') {
      note = '還沒開始學的字，依單字表的順序排。';
    }
    if (note) h += '<p class="note sw-note">' + note + '</p>';
    h += '<ul class="wordlist sw-list">' + items.slice(0, statSel.limit).map(function (w) {
      var r = rec(w.id), meta = '';
      if (g === 'review') {
        meta = '<span class="sw-due">' + (r.due < endToday ? '今天' : SRS.fmtDue(r.due, now)) + '</span><span>間隔 ' + (r.iv || 0) + ' 天</span>' + (r.lapses ? '<span>忘 ' + r.lapses + ' 次</span>' : '');
      } else if (g === 'learning') {
        meta = '<span class="state state-' + r.st + '">' + (r.st === 'relearning' ? '重學' : '新學') + '</span><span class="sw-due">' + (r.due <= now ? '現在可複習' : SRS.fmtDue(r.due, now)) + '</span>';
      } else if (r.st === 'suspended') {
        meta = '<span class="state state-suspended">停用</span>';
      }
      if (statSel.lv === 'all') meta = '<span class="level-badge" data-level="' + w.lv + '" style="margin:0">' + lvShort(w.lv) + '</span>' + meta;
      return '<li class="wl-item"><div class="wl-head sw-row"><span class="wl-main">' +
        '<button type="button" class="speakable wl-word" data-say-text="' + esc(w.w) + '" aria-label="唸 ' + esc(w.w) + '">' + esc(w.w) + SPK + '</button>' + phonHtml(w) +
        '<span class="wl-def">' + esc(defsText(w)) + '</span></span><span class="wl-meta">' + meta + '</span></div></li>';
    }).join('') + '</ul>';
    if (!items.length) h += '<p class="note">' + (statSel.lv === 'all' ? '' : lvLabel(statSel.lv)) + '目前沒有「' + name + '」的字。</p>';
    if (items.length > statSel.limit) h += '<div class="wl-more"><button type="button" class="tool-btn" id="statMore">顯示更多（還有 ' + (items.length - statSel.limit) + ' 個）</button></div>';
    box.innerHTML = h;
  }
  function statClick(e) {
    var t = e.target;
    var sp = t.closest('.speakable[data-say-text]');
    if (sp) { speak(sp.getAttribute('data-say-text'), sp); return; }
    if (t.closest('[data-goto="wrong"]')) { state.view = 'practice'; stopSpeech(); save(); renderViews(); if (window.Practice) Practice.openWrong(); return; }
    if (t.closest('[data-stat-close]')) { statSel = null; renderStats(); return; }
    if (t.id === 'statMore') { statSel.limit += 100; renderStatWords(); return; }
    var gb = t.closest('[data-stat-g]');
    if (gb) {
      var k = gb.getAttribute('data-stat-g');
      statSel = statSel && statSel.g === k ? null : { g: k, lv: statSel ? statSel.lv : 'all', limit: 60 };
      renderStats(); return;
    }
    var lb = t.closest('[data-stat-lv]');
    if (lb) {
      var v = lb.getAttribute('data-stat-lv'), lv = lvOf(v), grp = statSel ? statSel.g : null;
      var fromRow = lb.classList.contains('lb');
      if (!grp) {                     // 從級別那一列點進來：挑這一級第一個有字的分類
        var has = {};
        WORDS.forEach(function (w) { if (w.lv === lv) has[statGroup(rec(w.id))] = true; });
        grp = ['review', 'learning', 'known', 'new'].filter(function (x) { return has[x]; })[0] || 'new';
      }
      statSel = { g: grp, lv: lv, limit: 60 };
      renderStats();
      if (fromRow) $('#statWords').scrollIntoView({ block: 'nearest' });
    }
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
      state.level = lvOf(lv);
      current = null; revealed = false; openItem = null; browseLimit = 80; forceAhead = false;
      if (screen) screen = null;
      if (window.Practice) Practice.reset();
      $('#counts').hidden = false; $('#studyTools').hidden = false;
      save(); renderAll();
    });
  });
  $('#view-stats').addEventListener('click', statClick);
  $('#view-stats').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('lb')) { e.preventDefault(); statClick(e); }
  });
  $all('.view-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      state.view = b.getAttribute('data-view');
      stopSpeech();
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
    var id = idOf(li.getAttribute('data-id'));
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'remove') { openItem = null; removeCustom(id); renderBrowse(); toast('已從自選移除'); return; }
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
      var id = idOf(e.target.closest('.wl-item').getAttribute('data-id'));
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
        state = load(); rebuildCustom(); current = null; undoStack = [];
        var now = Date.now();
        Object.keys(state.custom).forEach(function (id) { pending.custom[id] = true; });
        Object.keys(state.recs).forEach(function (id) { state.recs[id].last = Math.max(state.recs[id].last || 0, now); pending.ids[id] = true; });
        state.settingsUpdated = now; pending.settings = true; pending.logFrom = 0;
        ['p5', 'read', 'listen'].forEach(function (tp) { Object.keys(state.practice[tp]).forEach(function (id) { pending.practice[tp + '|' + id] = true; }); });
        Object.keys(state.pday).forEach(function (k) { state.pday[k].t = now; pending.pdays[k] = true; });
        if (window.Practice) Practice.reset();
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
    if (!confirm('確定要清除全部學習進度？設定會保留，單字（包含自選的字）不會消失。')) return;
    var now = Date.now();
    state.recs = {};
    WORDS.forEach(function (w) { setRec(w.id, Object.assign(SRS.newRecord(), { last: now }, w.custom ? { pri: now } : {})); });
    state.log = []; state.daily = { day: todayKey(), newCount: 0, extraNew: 0 };
    // 練習成績也歸零（留下時間戳，雲端才會跟著歸零）
    ['p5', 'read', 'listen'].forEach(function (tp) { Object.keys(state.practice[tp]).forEach(function (id) { state.practice[tp][id] = [0, 0, now, 0]; pending.practice[tp + '|' + id] = true; }); });
    Object.keys(state.pday).forEach(function (k) { state.pday[k] = { t: now }; pending.pdays[k] = true; });
    if (window.Practice) Practice.reset();
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
    if (state.view !== 'study') return;
    if (!current) {
      // 休息畫面：空白鍵 / Enter =「不等了，現在複習」。畫面剛出現的 0.6 秒內不反應，避免連按評分時誤觸
      var ab = document.getElementById('aheadBtn');
      if (ab && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        if (Date.now() - emptyShownAt > 600) ab.click();
      }
      return;
    }
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
    var changed = false, localWin = [], settingsLocalWins = false, cWins = [];
    if (remote.custom) {                 // 自選單字要先合併，後面的進度才對得上
      var cChanged = false;
      Object.keys(remote.custom).forEach(function (id) {
        var r = remote.custom[id]; if (!r || typeof r !== 'object') return;
        var l = state.custom[id];
        if (!l || (r.t || 0) > (l.t || 0)) { state.custom[id] = r; cChanged = true; }
        else if ((l.t || 0) > (r.t || 0)) cWins.push(id);
      });
      Object.keys(state.custom).forEach(function (id) { if (!remote.custom[id]) cWins.push(id); });
      if (cChanged) { rebuildCustom(); changed = true; if (current && !byId[current.id]) { current = null; revealed = false; } }
    }
    if (remote.recs) {
      Object.keys(remote.recs).forEach(function (id) {
        var rr = remote.recs[id]; if (!rr || !byId[id]) return;
        var lr = state.recs[id];
        var rl = rr.last || 0, ll = lr ? (lr.last || 0) : -1;
        if (!lr && rr.st === 'new' && !rl) return;
        if (rl > ll) { state.recs[id] = rr; changed = true; if (current && String(current.id) === String(id)) { current = null; revealed = false; } }
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
    var pWins = [], dWins = [];
    if (remote.practice) {
      ['p5', 'read', 'listen'].forEach(function (tp) {
        var rp = remote.practice[tp] || {}, lp = state.practice[tp];
        Object.keys(rp).forEach(function (id) {
          var r = rp[id]; if (!Array.isArray(r)) return;
          var l = lp[id];
          if (!l || (r[2] || 0) > (l[2] || 0)) { lp[id] = r; changed = true; }
          else if ((l[2] || 0) > (r[2] || 0)) pWins.push(tp + '|' + id);
        });
        Object.keys(lp).forEach(function (id) { if (!rp[id]) pWins.push(tp + '|' + id); });
      });
    }
    if (remote.pday) {
      Object.keys(remote.pday).forEach(function (k) {
        var r = remote.pday[k]; if (!r || typeof r !== 'object') return;
        var l = state.pday[k];
        if (!l || (r.t || 0) > (l.t || 0)) { state.pday[k] = r; changed = true; }
        else if ((l.t || 0) > (r.t || 0)) dWins.push(k);
      });
      Object.keys(state.pday).forEach(function (k) { if (!remote.pday[k]) dWins.push(k); });
    }
    if (changed) persist();
    return { changed: changed, localWinIds: localWin, settingsLocalWins: settingsLocalWins, practiceLocalWins: pWins, pdayLocalWins: dWins, customLocalWins: cWins };
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

  // 給 js/practice.js 用的內部介面
  if (window.Practice) {
    Practice.init({
      state: function () { return state; },
      save: save, notePractice: notePractice, todayKey: todayKey,
      esc: esc, toast: toast, byId: byId, rec: rec, setRec: setRec, SRS: SRS,
      levelFilter: levelFilter, levelName: function () { return state.level === 'all' ? '全部級別' : lvLabel(state.level); },
      lvLabel: lvLabel, words: function () { return WORDS; }, baseCount: BASE_N,
      customId: customId, addCustom: addCustom, removeCustom: removeCustom, prioritize: prioritize,
      speak: speak, speakSeq: speakSeq, stopSpeech: stopSpeech, canSpeak: function () { return !!synth; },
      phonHtml: phonHtml, SPK: SPK,
      renderTabs: renderTabs, isActive: function () { return state.view === 'practice'; }
    });
  }

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
