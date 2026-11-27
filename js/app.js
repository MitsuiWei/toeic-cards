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
    explain: 'show',               // 練習作答後的各選項解析：show 直接顯示／fold 先收起來
    rate: '0.7',                   // 語速（v21 起預設從 0.85 調慢成 0.7）
    voice: ''
  };

  // 舊設定相容：v18 起單字提示拿掉 IPA（使用者要求），存過 ipa 的一律改成 KK（另一台還沒更新的裝置同步過來也一樣）
  //           v21 起語速預設調慢：舊的預設值 0.85 改成 0.7（只改一次，之後使用者自己選的不動）
  function normSettings(st) {
    if (st.phonetic === 'ipa') st.phonetic = 'kk';
    if (!st.rateMig) { if (String(st.rate) === '0.85') st.rate = '0.7'; st.rateMig = 1; }
    return st;
  }

  var state = load();
  rebuildCustom();
  var undoStack = [];
  var current = null;        // {id, kind}
  var revealed = false;
  var forceAhead = false;
  var screen = null;         // 快速篩選：{list, idx, history}
  var browseLimit = 80;
  var browseIds = [];        // 單字庫目前列出來的字（依序的 id）；連續播放照這個順序
  // 單字庫的連續播放（函式在「單字庫：連續播放」那一段）
  var lib = { cur: null, auto: false, token: 0, shown: {}, show: 'all', say: 'both', follow: true, stage: null, playing: false, waiting: false, unlocked: false, wake: null, utter: null };
  (function () {
    try {
      var p = JSON.parse(localStorage.getItem('toeic-lib-v1') || '{}');
      if (/^(all|hidezh|hideen)$/.test(p.show)) lib.show = p.show;
      if (/^(both|en|zh)$/.test(p.say)) lib.say = p.say;
      if (p.follow === false) lib.follow = false;
    } catch (e) {}
  })();
  function libHidden(id, side) { return !lib.shown[id] && ((lib.show === 'hidezh' && side === 'zh') || (lib.show === 'hideen' && side === 'en')); }
  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var LP_PLAY = '<svg class="lp-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  var LP_PAUSE = '<svg class="lp-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';

  /* ---------- 儲存 ---------- */
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    s.v = 1;
    s.recs = s.recs || {};
    s.log = s.log || [];
    s.settings = normSettings(Object.assign({}, DEFAULT_SETTINGS, s.settings || {}));
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
    // 落點測驗結果：place[開始時間] = { t, L, R, S: [下限, 中間, 上限]（聽力、閱讀、總分；沒測聽力時 L、S 是 null）,
    //   m: { listen: [答對, 題數], p5: [...], read: [...] }, lv: 建議練的級別 }。placeCleared：清除進度的時間，之前的結果不算
    s.place = s.place || {};
    s.placeCleared = s.placeCleared || 0;
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
  var pending = { ids: {}, settings: false, logFrom: state.log.length, practice: {}, pdays: {}, custom: {}, place: {}, placeCleared: false };
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
    var pr = Object.keys(pending.practice), pd = Object.keys(pending.pdays), cu = Object.keys(pending.custom), pl = Object.keys(pending.place);
    if (ids.length || pending.settings || entries.length || pr.length || pd.length || cu.length || pl.length || pending.placeCleared) {
      Sync.noteChange({ ids: ids, settings: pending.settings, daily: true, log: entries, practice: pr, pdays: pd, custom: cu, place: pl, placeCleared: pending.placeCleared });
    }
    clearPending();
  }
  function clearPending() { pending = { ids: {}, settings: false, logFrom: state.log.length, practice: {}, pdays: {}, custom: {}, place: {}, placeCleared: false }; }
  function notePlace(key) { pending.place[key] = true; }
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
    if (mode !== 'ipa') mode = 'kk';
    var v = mode === 'ipa' ? w.ip : w.kk;
    if (!v) return '';
    var a = mode === 'ipa' ? '/' : '[', b = mode === 'ipa' ? '/' : ']';
    if (typeof v === 'string') return a + v + b;
    return v.map(function (x) { return x[0] + ' ' + a + x[1] + b; }).join('　');
  }
  // 單字庫、練習頁用：設定是自然發音或字根字首時，這些地方一律顯示 KK
  function phonHtml(w, cls, mode) {
    mode = mode || state.settings.phonetic;
    if (mode === 'none') return '';
    if (mode !== 'ipa') mode = 'kk';
    var v = mode === 'ipa' ? w.ip : w.kk;
    if (!v) return '';
    var a = mode === 'ipa' ? '/' : '[', b = mode === 'ipa' ? '/' : ']';
    var inner = typeof v === 'string' ? esc(a + v + b)
      : v.map(function (x) { return '<i>' + esc(x[0]) + '</i>' + esc(a + x[1] + b); }).join('<span class="phon-sep"></span>');
    return '<span class="phon ' + (cls || '') + '" lang="en">' + inner + '</span>';
  }

  /* ---------- 單字卡的提示行（設定「單字提示」）----------
     一次只顯示一種：KK、自然發音（data/aids.js 的 p）、字根字首（r）或不顯示（v18 依使用者要求拿掉 IPA）。
     字根字首會透露意思，所以只在翻面後出現，翻面前先顯示 KK；沒有拆解的字顯示 KK 加一行小字。
     點提示行可以臨時換成下一種（只對這張卡有效，設定不變）。aids.js 在需要時才載入。 */
  var AID_ORDER = ['kk', 'phonics', 'roots'];
  var AID_NAME = { kk: 'KK 音標', phonics: '自然發音', roots: '字根字首' };
  var aidOverride = null;                              // { id, mode }：這張卡臨時換的提示
  var aidsLoading = false;
  function loadAids() {
    if (window.TOEIC_AIDS || aidsLoading) return;
    aidsLoading = true;
    var sc = document.createElement('script');
    sc.src = 'data/aids.js';
    sc.onload = function () { aidsLoading = false; if (current && byId[current.id]) renderCard(byId[current.id]); };
    sc.onerror = function () { aidsLoading = false; };
    document.head.appendChild(sc);
  }
  function aidMode(w) { return aidOverride && aidOverride.id === w.id ? aidOverride.mode : state.settings.phonetic; }
  function phonicsHtml(p) {
    var k = 0, syl = p.s.split(/([·-])/).map(function (x) {
      if (x === '·') return '<i>·</i>';
      if (x === '-') return '-';
      var h = k === p.st ? '<b>' + esc(x) + '</b>' : esc(x); k++; return h;
    }).join('');
    return '<span class="aid-tag">自然發音</span><span class="aid-syl" lang="en">' + syl + '</span><span class="aid-rule">' + esc(p.n) + '</span>';
  }
  function rootsHtml(r) {
    return '<span class="aid-tag">字根字首</span><span class="aid-parts">' + r.p.map(function (x) {
      return '<span class="aid-part"><b lang="en">' + esc(x[0]) + '</b><small>' + esc(x[1]) + '</small></span>';
    }).join('<span class="aid-plus">＋</span>') + '</span><span class="aid-rule">' + esc(r.m) + '</span>';
  }
  function aidHtml(w) {
    var mode = aidMode(w);
    if (mode === 'none') return '';
    var A = window.TOEIC_AIDS, a = A && A[w.id], inner = '', note = '', rich = false;
    if ((mode === 'phonics' || mode === 'roots') && !A) loadAids();
    if (mode === 'phonics' && a && a.p) { inner = phonicsHtml(a.p); rich = true; }
    else if (mode === 'roots' && a && a.r && revealed) { inner = rootsHtml(a.r); rich = true; }
    else {
      inner = phonHtml(w, '', 'kk');
      if (A && mode === 'phonics') note = '這個字沒有自然發音拆解';
      if (A && mode === 'roots') note = a && a.r ? '翻面後看字根字首' : '這個字沒有可靠的字根拆法';
    }
    return '<button type="button" class="aid-line' + (rich ? ' is-rich' : '') + '" data-aid="' + mode + '" aria-label="' + AID_NAME[mode] + '，點一下換下一種提示">' +
      inner + (note ? '<span class="aid-note">' + note + '</span>' : '') + '</button>';
  }
  function cycleAid() {
    if (!current) return;
    var w = byId[current.id], i = AID_ORDER.indexOf(aidMode(w));
    var next = AID_ORDER[(i + 1) % AID_ORDER.length];
    aidOverride = { id: w.id, mode: next };
    renderCard(w);
    toast(AID_NAME[next] + '（只換這張卡，預設在設定改）');
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
    var auto = bestVoice();
    sel.innerHTML = '<option value="">自動挑最自然的' + (auto ? '（目前：' + esc(auto.name) + '）' : '') + '</option>';
    voices.filter(function (v) { return voiceScore(v) > 1; })
      .sort(function (a, b) { return voiceScore(b) - voiceScore(a); })
      .forEach(function (v) {
        var o = document.createElement('option');
        o.value = v.name; o.textContent = v.name + '（' + v.lang + (voiceScore(v) >= 80 ? '・較自然' : '') + '）';
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
    return bestVoice();
  }
  /* 語音是裝置內建的，品質差很多。自動挑的時候給每個英文語音打分數，挑最自然的：
     美式優先；Apple 的「高級／增強」語音（名稱或 voiceURI 有 premium、enhanced）、Edge 的線上自然語音（Natural）、
     Android 的 neural 語音加分；Apple 的趣味語音（Albert、Bells…）和機械感很重的 Eloquence 語音（Eddy、Flo…）排最後。 */
  var NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy|Princess|Bruce|Agnes|Vicki|Victoria)\b/i;
  var ELOQ = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/;
  function voiceScore(v) {
    var n = v.name || '', id = n + ' ' + (v.voiceURI || ''), s = 2;
    if (!/^en/i.test(v.lang || '')) return -1;
    if (NOVELTY.test(n) || ELOQ.test(n) || /eloquence/i.test(id)) return 1;
    if (/en[-_]US/i.test(v.lang)) s += 40; else if (/en[-_](GB|AU|CA)/i.test(v.lang)) s += 10;
    if (/premium/i.test(id)) s += 60;
    else if (/natural|neural/i.test(id)) s += 55;
    else if (/enhanced/i.test(id)) s += 45;
    else if (/siri/i.test(id)) s += 40;
    else if (/^Google US English/.test(n)) s += 30;
    else if (/compact/i.test(id)) s -= 1;
    if (/^(Ava|Zoe|Evan|Samantha|Allison|Nathan|Joelle|Noelle|Aria|Jenny|Guy|Michelle)\b/.test(n)) s += 6;
    return s;
  }
  function bestVoice() {
    var best = null, bs = 0;
    voices.forEach(function (v) { var sc = voiceScore(v); if (sc > bs) { bs = sc; best = v; } });
    return best;
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
    if (kara) kara.stop();
    if (!synth) return;
    if (synth.speaking || synth.pending) cancelBusyAt = Date.now();
    synth.cancel();
    clearSpeaking();
  }

  /* ---------- 逐字標示（唸到哪個字，那個字就亮起來）----------
     karaHtml(text, a0, a1)：把句子切成一個字一個 <span class="kw" data-c="在句中的位置">；[a0, a1) 是答案的位置，會加粗。
     元素裡有 .kw 時，speakSeq 會自動逐字標示：
       1. 瀏覽器有送 boundary 事件（iOS／macOS Safari、用本機語音的 Chrome）→ 照事件的 charIndex 標，最準。
       2. 沒送（Android Chrome、Chrome 的 Google 線上語音）→ 依字長和語速估時間，會有一點誤差。
     先用估的開始跑，一收到 boundary 事件就改用事件。 */
  function karaHtml(text, a0, a1) {
    var out = '', last = 0, re = /\S+/g, m;
    while ((m = re.exec(text))) {
      var ans = a1 > a0 && m.index < a1 && m.index + m[0].length > a0;
      out += esc(text.slice(last, m.index)) + '<span class="kw' + (ans ? ' kw-ans' : '') + '" data-c="' + m.index + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  var kara = null;
  function karaStart(u, el, rate) {
    var spans = [].slice.call(el.querySelectorAll('.kw'));
    if (!spans.length) return;
    var starts = spans.map(function (s) { return Number(s.getAttribute('data-c')); });
    var cur = -1, timers = [], byEvent = false, me;
    function set(i) {
      if (i === cur) return;
      if (spans[cur]) spans[cur].classList.remove('is-now');
      cur = i;
      if (spans[i]) spans[i].classList.add('is-now');
    }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    me = { stop: function () { clearTimers(); set(-1); if (kara === me) kara = null; } };
    if (kara) kara.stop();
    kara = me;
    u.addEventListener('start', function () {
      if (kara !== me || byEvent) return;
      // 估計每個字的時間：字母數 × 62ms ＋ 字間 70ms；逗號、句號後多停一下。除以語速
      var t = 0;
      spans.forEach(function (s, i) {
        var w = s.textContent, ms = w.replace(/[^A-Za-z0-9]/g, '').length * 62 + 70;
        if (/[,;:]$/.test(w)) ms += 220; else if (/[.!?]["')]*$/.test(w)) ms += 380;
        timers.push(setTimeout(function () { if (!byEvent) set(i); }, t / rate));
        t += ms;
      });
      // 保險：有些瀏覽器偶爾不送 end 事件，超過估計時間很久就自己收掉
      timers.push(setTimeout(me.stop, t / rate * 2.5 + 3000));
    });
    u.addEventListener('boundary', function (e) {
      if (kara !== me || (e.name && e.name !== 'word')) return;
      if (!byEvent) { byEvent = true; clearTimers(); }
      var i = 0;
      while (i + 1 < starts.length && starts[i + 1] <= e.charIndex) i++;
      set(i);
    });
    u.addEventListener('end', me.stop);
    u.addEventListener('error', me.stop);
  }
  /* items: [{text, el, pause}]，pause 是唸完後停頓的毫秒數；onDone 在整串唸完或中斷時呼叫 */
  function speakSeq(items, onDone) {
    if (!synth) { toast('這個瀏覽器不支援語音發音'); if (onDone) onDone(); return; }
    libHalt();
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
      if (it.el && it.el.querySelector && it.el.querySelector('.kw')) karaStart(u, it.el, u.rate);
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
    if (state.view !== 'browse') { libStop(); libBar(); }      // 離開單字庫：停止連續播放、收起控制列
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
      '<span class="pos">' + esc(posText(w.d[0])) + '</span></div>' + aidHtml(w);
    var meanings = '<div class="meaning-list">' + w.d.map(function (d) {
      return '<div class="meaning"><span class="pos">' + esc(posText(d)) + '</span>' + esc(d[1]) + '</div>';
    }).join('') + '</div>';
    var exHtml = exampleHtml(w, s.frontExample === 'cloze' && s.direction === 'en' && !revealed, true);
    // 例句：點裡面的字查意思、點喇叭唸整句、點這張卡的字唸那個字。data-ex／data-zh 是把查到的字存成自選時用的例句
    var exBtn = w.ex ? '<div class="speakable example ex-tap" data-ex="' + esc(w.ex) + '"' + (w.zh ? ' data-zh="' + esc(w.zh) + '"' : '') + '>' + exHtml +
      '<button class="ex-say" data-say="ex" aria-label="唸例句">' + SPK + '</button></div>' : '';   // 自選的字不一定有例句
    if (window.Practice && Practice.closePop) Practice.closePop();      // 換卡或翻面時把查字的小卡收起來
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
  /* tap：其他的字包成可以點的 <span class="tw">（點一下查意思，見 practice.js 的 pickWord）；
     這張卡自己的字（<mark>）不包，免得還沒翻面就查到答案 */
  function exampleHtml(w, cloze, tap) {
    var a = w.hl[0], b = w.hl[1];
    var wrap = tap && window.Practice && Practice.tw ? Practice.tw : esc;
    var pre = wrap(w.ex.slice(0, a)), mid = esc(w.ex.slice(a, b)), post = wrap(w.ex.slice(b));
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
    aidOverride = null;
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
    browseIds = items.map(function (w) { return w.id; });
    if (lib.cur != null && browseIds.indexOf(lib.cur) < 0) { libStop(); lib.cur = null; }   // 正在唸的字被篩掉了
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
      return '<li class="wl-item' + (lib.cur === w.id ? ' is-cur no-anim' : '') + '" data-id="' + w.id + '">' +
        '<div class="wl-head" role="button" tabindex="0" aria-expanded="' + open + '">' +
          '<button class="lp-play" aria-label="從 ' + esc(w.w) + ' 開始播放">' + LP_PLAY + '<span class="lp-eq"><i></i><i></i><i></i></span></button>' +
          '<span class="wl-main"><span class="lp-en' + (libHidden(w.id, 'en') ? ' cover' : '') + '"><button class="speakable wl-word" data-say-text="' + esc(w.w) + '" aria-label="唸 ' + esc(w.w) + '">' + esc(w.w) + SPK + '</button>' + phonHtml(w) + '</span>' +
          '<span class="wl-def lp-zh' + (libHidden(w.id, 'zh') ? ' cover' : '') + '">' + esc(defsText(w)) + '</span></span>' +
          '<span class="wl-meta">' + meta + '</span>' +
        '</div>' + body + '</li>';
    }).join('');
    if (items.length > browseLimit) html += '<li class="wl-more"><button class="tool-btn" id="moreBtn">顯示更多（還有 ' + (items.length - browseLimit) + ' 個）</button></li>';
    if (!items.length) html = '<li class="empty" style="border:0">沒有符合的字</li>';
    ul.innerHTML = html;
    libTools(); libPaint(); libBar();
  }

  /* ---------- 單字庫：連續播放 ----------
     照單字庫目前列出來的順序（級別、搜尋、狀態篩選之後）一個字一個字唸：英文用設定的英文語音，中文用裝置的中文語音。
     lib.show 顯示方式：all 全部顯示／hidezh 遮中文／hideen 遮英文（遮住的點一下就顯示）
     lib.say  唸哪一種：both 英文＋中文／en 只唸英文／zh 只唸中文
     連續播放時如果有遮住的一邊：先唸看得到的那一邊 → 停一下讓人想（遮住的地方會閃）→ 揭曉 → 再唸剛揭曉的那一邊。
     lib.cur 是正在唸的字的 id；lib.token 每次停止／換字就加一，還在排隊的步驟看到 token 變了就不再往下做。
     這三個選項只存在這台裝置（localStorage 的 toeic-lib-v1），不跟著帳號同步。 */
  var LIB_KEY = 'toeic-lib-v1';
  function libStop() {
    var was = lib.auto || lib.playing || lib.waiting;
    lib.token++; lib.auto = false; lib.playing = false; lib.waiting = false;
    if (synth && was) { if (synth.speaking || synth.pending) cancelBusyAt = Date.now(); synth.cancel(); }
    libWake(false); libPaint(); libBar();
  }
  // 使用者點了別的東西發音（單字、例句）：連續播放讓路，聲音交給 speakSeq 處理
  function libHalt() {
    if (!lib.auto && !lib.playing && !lib.waiting) return;
    lib.token++; lib.auto = false; lib.playing = false; lib.waiting = false;
    libWake(false); libPaint(); libBar();
  }
  function libSavePrefs() { try { localStorage.setItem(LIB_KEY, JSON.stringify({ show: lib.show, say: lib.say, follow: lib.follow })); } catch (e) {} }
  function libRow(id) { return id == null ? null : document.querySelector('#wordList .wl-item[data-id="' + id + '"]'); }
  function libReveal(id) {
    lib.shown[id] = 1;
    var row = libRow(id);
    if (row) Array.prototype.forEach.call(row.querySelectorAll('.cover'), function (n) { n.classList.remove('cover'); });
    libBar();
  }
  // 把「正在唸／正在等／唸到哪一邊」反映到那一列上（重畫清單之後也要再呼叫一次）
  function libPaint() {
    var row = libRow(lib.cur); if (!row) return;
    row.classList.toggle('is-playing', !!lib.playing);
    row.classList.toggle('is-waiting', !!lib.waiting);
    if (lib.stage) row.setAttribute('data-stage', lib.stage); else row.removeAttribute('data-stage');
  }
  function libSetCur(id) {
    if (id === lib.cur) { if (lib.follow) libLocate(false); return; }
    var old = libRow(lib.cur);
    if (old) { old.classList.remove('is-cur', 'no-anim', 'is-playing', 'is-waiting'); old.removeAttribute('data-stage'); }
    lib.cur = id; lib.stage = null; lib.playing = false; lib.waiting = false;
    var k = browseIds.indexOf(id);
    if (k >= browseLimit) { browseLimit = k + 60; renderBrowse(); }      // 唸到還沒列出來的字：多列一些
    var row = libRow(id);
    if (row) { row.classList.remove('no-anim'); row.classList.add('is-cur'); }
    libBar();
    if (lib.follow) libLocate(false);
  }
  // 把正在唸的字捲到畫面中間；已經在看得到的範圍裡就不動（force：按「定位」時一定捲）
  function libLocate(force) {
    var row = libRow(lib.cur); if (!row) return;
    var r = row.getBoundingClientRect(), h = window.innerHeight;
    if (!force && r.top > h * 0.22 && r.bottom < h * 0.68) return;
    row.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }
  function libAway() {
    var row = libRow(lib.cur); if (!row) return false;
    var r = row.getBoundingClientRect();
    return r.bottom < 60 || r.top > window.innerHeight - 90;
  }
  function libTools() {
    [['#lpShow', lib.show], ['#lpSay', lib.say]].forEach(function (x) {
      Array.prototype.forEach.call($(x[0]).children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === x[1]); });
    });
    $('#lpFollow').setAttribute('aria-pressed', !!lib.follow);
    $('#lpRate').value = state.settings.rate;
  }
  function libBar() {
    var bar = $('#lpNow'); if (!bar) return;
    var k = browseIds.indexOf(lib.cur), on = state.view === 'browse' && lib.cur != null && k >= 0;
    bar.classList.toggle('is-on', on);
    document.body.classList.toggle('lp-on', on);
    $('#lpPlay').innerHTML = lib.auto ? LP_PAUSE : LP_PLAY;
    $('#lpPlay').setAttribute('aria-label', lib.auto ? '暫停' : '連續播放');
    $('#lpAuto').innerHTML = lib.auto ? LP_PAUSE + '暫停' : LP_PLAY + '連續播放';
    if (!on) return;
    $('#lpPos').textContent = (k + 1) + ' / ' + browseIds.length;
    $('#lpWord').textContent = libHidden(lib.cur, 'en') ? '？？？' : byId[lib.cur].w;
    $('#lpProg').style.width = ((k + 1) / browseIds.length * 100) + '%';
    $('#lpLoc').classList.toggle('is-away', libAway());
  }
  // 連續播放時讓螢幕不要自己關掉（螢幕一關，手機就不唸了）；瀏覽器不支援就算了
  function libWake(on) {
    try {
      if (on) {
        if (!lib.wake && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { if (lib.auto) lib.wake = l; else l.release(); }).catch(function () {});
      } else if (lib.wake) { lib.wake.release(); lib.wake = null; }
    } catch (e) {}
  }
  // 中文語音：台灣的國語優先，沒有就用其他國語；粵語不要
  function zhVoice() {
    if (!voices.length && synth) voices = synth.getVoices() || [];
    var best = null, bs = 0;
    voices.forEach(function (v) {
      var lang = (v.lang || '').replace('_', '-').toLowerCase(), s = 0;
      if (/^(zh-tw|cmn-hant)/.test(lang)) s = 60;
      else if (/^(zh-cn|zh$|cmn)/.test(lang)) s = 20;
      else return;
      var id = (v.name + ' ' + (v.voiceURI || '')).toLowerCase();
      if (/premium/.test(id)) s += 30; else if (/natural|neural/.test(id)) s += 28; else if (/enhanced/.test(id)) s += 22;
      if (v.localService) s += 2;
      if (s > bs) { bs = s; best = v; }
    });
    return best;
  }
  function libRate() { return parseFloat(state.settings.rate) || 1; }
  // 停頓（想一下、字跟字之間）跟著語速拉長，但語速調到很慢（0.2）時不要跟著等太久
  function libPace() { return Math.max(0.5, libRate()); }
  function libSleep(ms, token) { return new Promise(function (res) { setTimeout(function () { res(token === lib.token); }, ms); }); }
  /* 唸某個字的英文或中文，唸完才 resolve；被停止（token 變了）回 false。
     有些瀏覽器偶爾不送 end 事件，所以另外估一個時間保底。 */
  function libSay(id, side, token) {
    var w = byId[id];
    var text = side === 'en' ? w.w : w.d.map(function (d) { return d[1]; }).join('，');
    return new Promise(function (res) {
      if (token !== lib.token) return res(false);
      if (!synth || !text) return res(true);
      var done = false, timer = 0;
      function fin() {
        if (done) return; done = true; clearTimeout(timer);
        if (token === lib.token) { lib.playing = false; libPaint(); }
        res(token === lib.token);
      }
      var u = new SpeechSynthesisUtterance(text), v;
      if (side === 'zh') { u.lang = 'zh-TW'; u.rate = 1; v = zhVoice(); }
      else { u.lang = 'en-US'; u.rate = libRate(); v = pickVoice(); }
      if (v) u.voice = v;
      u.onend = fin; u.onerror = fin;
      function go() {
        if (token !== lib.token) return fin();
        lib.stage = side; lib.playing = true; libPaint();
        lib.utter = u;                              // 留著參考，免得唸到一半被回收
        timer = setTimeout(fin, Math.max(2600, text.length * 280) / u.rate + 1500);
        synth.speak(u);
      }
      // 剛打斷別的語音時，Chrome 立刻 speak 偶爾會被吃掉，稍等一下；其他情況同步播放（iPhone 要求第一次發聲在點擊事件裡）
      if (Date.now() - cancelBusyAt < 150) setTimeout(go, 90); else go();
    });
  }
  function libThink(token) {
    lib.waiting = true; libPaint();
    return libSleep(2200 / libPace(), token).then(function (ok) { if (ok) { lib.waiting = false; libPaint(); } return ok; });
  }
  // 這個字要做哪些步驟。quiz：連續播放時遮住的一邊要「先唸另一邊 → 想 → 揭曉 → 再唸」
  function libSteps(id, quiz) {
    var sayEn = lib.say !== 'zh', sayZh = lib.say !== 'en', steps = [];
    var hid = !quiz ? null : libHidden(id, 'zh') ? 'zh' : libHidden(id, 'en') ? 'en' : null;
    if (!hid) {
      if (sayEn) steps.push(['say', 'en']);
      if (sayEn && sayZh) steps.push(['gap', 250]);
      if (sayZh) steps.push(['say', 'zh']);
    } else {
      var first = hid === 'zh' ? 'en' : 'zh';
      if (first === 'en' ? sayEn : sayZh) steps.push(['say', first]);
      steps.push(['think'], ['reveal']);
      if (hid === 'en' ? sayEn : sayZh) steps.push(['say', hid]);
    }
    return steps;
  }
  function libPlayEntry(id, token, quiz) {
    var steps = libSteps(id, quiz);
    function run(i) {
      if (token !== lib.token) return Promise.resolve(false);
      if (i >= steps.length) return Promise.resolve(true);
      var s = steps[i], p;
      if (s[0] === 'say') p = libSay(id, s[1], token);
      else if (s[0] === 'gap') p = libSleep(s[1], token);
      else if (s[0] === 'think') p = libThink(token);
      else { libReveal(id); p = Promise.resolve(true); }
      return p.then(function (ok) { return ok ? run(i + 1) : false; });
    }
    return run(0);
  }
  function libRun() {
    if (!browseIds.length) return;
    stopSpeech();
    var token = ++lib.token;
    lib.auto = true; libWake(true);
    if (lib.cur == null || browseIds.indexOf(lib.cur) < 0) libSetCur(browseIds[0]); else if (lib.follow) libLocate(false);
    libBar();
    // 第一步不是發音（先想再唸）的話，先在這次點擊裡出一個聽不到的聲音，之後計時器裡的發音 iPhone 才會放行
    if (synth && !lib.unlocked && libSteps(lib.cur, true)[0][0] !== 'say') {
      try { var u0 = new SpeechSynthesisUtterance(' '); u0.volume = 0; synth.speak(u0); } catch (e) {}
    }
    lib.unlocked = true;
    (function loop() {
      libPlayEntry(lib.cur, token, true).then(function (ok) {
        if (!ok) return;
        libSleep(600 / libPace(), token).then(function (ok2) {
          if (!ok2) return;
          var k = browseIds.indexOf(lib.cur);
          if (k < 0 || k + 1 >= browseIds.length) { lib.auto = false; libWake(false); libBar(); return; }   // 唸完最後一個字
          libSetCur(browseIds[k + 1]); loop();
        });
      });
    })();
  }
  function libToggle() { if (lib.auto) libStop(); else libRun(); }
  // 跳到某個字：連續播放中就從那個字接著播，否則只唸那個字
  function libGo(id) {
    var wasAuto = lib.auto;
    libStop(); stopSpeech();
    libSetCur(id);
    if (wasAuto) libRun(); else libPlayEntry(id, ++lib.token, false);
  }
  function libStep(d) {
    if (!browseIds.length) return;
    var k = browseIds.indexOf(lib.cur);
    k = k < 0 ? 0 : Math.max(0, Math.min(browseIds.length - 1, k + d));
    libGo(browseIds[k]);
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
    if (t.closest('[data-goto="place"]')) { state.view = 'practice'; stopSpeech(); save(); renderViews(); if (window.Practice) Practice.openPlace(); window.scrollTo(0, 0); return; }
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
  function switchLevel(lv) {
    state.level = lvOf(String(lv));
    current = null; revealed = false; openItem = null; browseLimit = 80; forceAhead = false;
    if (screen) screen = null;
    if (window.Practice) Practice.reset();          // 練習的一回會結束；落點測驗不受級別影響，不會被清掉
    $('#counts').hidden = false; $('#studyTools').hidden = false;
    save(); renderAll();
  }
  $all('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      switchLevel(t.getAttribute('data-level'));
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
    if (e.target.closest('.aid-line')) { cycleAid(); return; }
    if (!current) return;
    var w = byId[current.id];
    var tw = e.target.closest('.ex-tap .tw');
    if (tw && window.Practice) { Practice.pickWord(tw); return; }               // 例句裡的字：查意思
    if (e.target.closest('.ex-tap mark')) { speak(w.w, e.target.closest('mark')); return; }   // 這張卡的字：唸這個字
    if (e.target.closest('.ex-say')) { speak(w.ex, exEl()); return; }             // 喇叭：唸整句
    if (e.target.closest('.ex-tap')) return;                                      // 例句的空白處：不做事
    var b = e.target.closest('.speakable'); if (!b) return;
    speak(b.getAttribute('data-say') === 'word' ? w.w : w.ex, b);
  });

  $('#screenWord').addEventListener('click', function () { if (screen) speak(byId[screen.list[screen.idx]].w, $('#screenWord')); });
  $('#screenYes').addEventListener('click', function () { screenAnswer(true); });
  $('#screenNo').addEventListener('click', function () { screenAnswer(false); });
  $('#screenUndo').addEventListener('click', screenUndo);
  $('#screenExit').addEventListener('click', function () { endScreen(false); });

  /* 單字庫連續播放的按鈕 */
  ['#lpShow', '#lpSay'].forEach(function (sel) {
    $(sel).addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (sel === '#lpShow') { lib.show = b.getAttribute('data-v'); lib.shown = {}; } else lib.say = b.getAttribute('data-v');
      libSavePrefs();
      var wasAuto = lib.auto;
      if (wasAuto) libStop();
      renderBrowse();
      if (wasAuto) libRun();                 // 播到一半換方式：從目前這個字用新的方式接著播
    });
  });
  $('#lpAuto').addEventListener('click', libToggle);
  $('#lpPlay').addEventListener('click', libToggle);
  $('#lpPrev').addEventListener('click', function () { libStep(-1); });
  $('#lpNext').addEventListener('click', function () { libStep(1); });
  $('#lpLoc').addEventListener('click', function () { libLocate(true); });
  $('#lpFollow').addEventListener('click', function () { lib.follow = !lib.follow; libSavePrefs(); libTools(); if (lib.follow) libLocate(false); });
  $('#lpRate').addEventListener('change', function () {
    state.settings.rate = this.value; state.settingsUpdated = Date.now(); pending.settings = true; save();
  });
  window.addEventListener('scroll', function () { if (lib.cur != null) $('#lpLoc').classList.toggle('is-away', libAway()); }, { passive: true });

  $('#searchBox').addEventListener('input', function () { browseLimit = 80; renderBrowse(); });
  $('#stateFilter').addEventListener('change', function () { browseLimit = 80; renderBrowse(); });
  $('#wordList').addEventListener('click', function (e) {
    var cv = e.target.closest('.cover');
    if (cv) { e.stopPropagation(); libReveal(idOf(cv.closest('.wl-item').getAttribute('data-id'))); return; }
    var pb = e.target.closest('.lp-play');
    if (pb) { e.stopPropagation(); libGo(idOf(pb.closest('.wl-item').getAttribute('data-id'))); return; }
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
        Object.keys(state.place).forEach(function (k) { pending.place[k] = true; });
        pending.placeCleared = true;
        if (window.Practice) Practice.reset(true);
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
    state.place = {}; state.placeCleared = now; pending.placeCleared = true;      // 落點測驗結果也清掉
    if (window.Practice) Practice.reset(true);
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
    if (state.view === 'browse') {
      // 單字庫：空白鍵 播放／暫停、J K 或 ← → 上一個／下一個、G 捲到正在唸的字（焦點在按鈕上時空白鍵照按鈕原本的作用）
      var onBtn = tag === 'button' || (e.target.getAttribute && e.target.getAttribute('role') === 'button');
      var key = e.key.toLowerCase();
      if (key === ' ' && !onBtn) { e.preventDefault(); libToggle(); }
      else if (key === 'j' || key === 'arrowleft') { e.preventDefault(); libStep(-1); }
      else if (key === 'k' || key === 'arrowright') { e.preventDefault(); libStep(1); }
      else if (key === 'g') libLocate(true);
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
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    renderAll();
    if (lib.auto) { lib.wake = null; libWake(true); }      // 螢幕恆亮在切走時會被系統收回，回來再要一次
  });
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
      if (ru > lu) { state.settings = normSettings(Object.assign({}, DEFAULT_SETTINGS, remote.settings)); state.settingsUpdated = ru; changed = true; }
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
    var plWins = [], plClearWins = false;
    if (remote.placeCleared !== undefined || remote.place) {
      var rc = remote.placeCleared || 0;
      if (rc > state.placeCleared) {
        state.placeCleared = rc; changed = true;
        Object.keys(state.place).forEach(function (k) { if ((state.place[k].t || 0) <= rc) delete state.place[k]; });
      } else if (state.placeCleared > rc) plClearWins = true;
      var rpl = remote.place || {};
      Object.keys(rpl).forEach(function (k) {
        var r = rpl[k]; if (!r || typeof r !== 'object' || (r.t || 0) <= state.placeCleared) return;
        if (!state.place[k]) { state.place[k] = r; changed = true; }
      });
      Object.keys(state.place).forEach(function (k) { if (!rpl[k]) plWins.push(k); });
    }
    if (changed) persist();
    return { changed: changed, localWinIds: localWin, settingsLocalWins: settingsLocalWins, practiceLocalWins: pWins, pdayLocalWins: dWins, customLocalWins: cWins,
             placeLocalWins: plWins, placeClearedLocalWins: plClearWins };
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
    if (e.target.id === 'signOutBtn') {
      var gated = Sync.gate && Sync.gate().on;
      if (confirm(gated ? '登出後要重新登入才能使用這個網站（這台裝置的進度會保留）。確定？' : '登出後這台裝置會保留目前進度，但不再同步。確定？')) Sync.signOut();
    }
    if (e.target.id === 'syncNowBtn') { Sync.flush(); toast('已送出'); }
    if (e.target.id === 'voiceTestBtn') { lastGesture = Date.now(); speak('The manager announced a new vacation policy this morning.', e.target); }
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
      notePlace: notePlace, switchLevel: switchLevel, level: function () { return state.level; },
      phonHtml: phonHtml, SPK: SPK, karaHtml: karaHtml,
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
