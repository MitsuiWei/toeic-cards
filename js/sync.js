/* 雲端同步（Firebase Auth + Firestore）
 *
 * 原則：
 *  - localStorage 永遠是本機快取，沒登入也能完整使用。
 *  - 登入後：先把雲端與本機「合併」，再把合併結果推回雲端；之後每次評分只推有變動的卡。
 *  - 合併規則：每張卡比 last（最後操作時間），新的贏；設定比 settingsUpdated；
 *    同一天的 daily 取較大值；複習紀錄以 (時間, 卡片) 去重後聯集。
 *  - Firestore 離線快取開著，沒網路時照常用，恢復連線自動補寫。
 *
 * 資料位置（collection 名稱刻意獨立，不碰同一專案裡其他 app 的資料）：
 *   toeicCards/{uid}                { recs, settings, settingsUpdated, daily, practice, pday, custom, place, placeCleared, updated }
 *   toeicCards/{uid}/log/{YYYY-MM}  { e: [{t, id, r, s}, ...] }
 *   toeicAccess/{uid}               { email, name, status: pending|approved|denied, requestedAt, decidedAt }   使用權限申請
 *
 * 使用權限（gate）：網站要用 Google 帳號登入，而且管理員同意後才能用。
 *  - 誰是管理員寫在 Firestore 安全規則裡（規則在 Firebase Console，不在這個公開的 repo），程式裡沒有管理員的信箱：
 *    登入後試著列出 toeicAccess，規則允許（＝管理員）就是管理員。
 *  - 一般使用者：讀自己的 toeicAccess/{uid}。沒有 → 可以送出申請（status: pending）；approved → 放行；其他 → 等待或被拒。
 *  - 規則還沒更新時讀自己的申請單會被拒（permission-denied）→ 視為「審核尚未啟用」（dormant），登入就放行，不會把人鎖在外面。
 *  - 核准過的裝置把結果記在 localStorage（toeic-gate-v1），下次開啟先放行再背景確認，離線也能用。
 *  - file:// 直接開啟、或沒有 FIREBASE_CONFIG 時不啟用（本機開發與測試）；測試可設 window.TOEIC_FORCE_GATE = true。
 *  注意：這是前端的門，擋的是一般訪客；網站程式和題庫本身放在公開的 GitHub Pages，懂技術的人仍然拿得到。
 *  真正由伺服器把關的只有 Firestore 裡的雲端資料（見 README 的安全規則）。
 */
(function (global) {
  'use strict';

  var COLL = 'toeicCards', ACC = 'toeicAccess', GATE_KEY = 'toeic-gate-v1';
  var app = null, auth = null, db = null, user = null;
  var hooks = null;           // { getState, mergeRemote(remote) -> {localWinIds, changed}, render, toast, clearPending }
  var unsubDoc = null, unsubLog = null;
  var queue = null, flushTimer = null;
  var lastSync = 0, status = 'off';   // off | ready | signed-out | syncing | synced | error
  var statusMsg = '';
  var listeners = [];
  var started = false, unsubAcc = null, unsubReqs = null;

  function gateEnabled() { return !!global.FIREBASE_CONFIG && (location.protocol !== 'file:' || !!global.TOEIC_FORCE_GATE); }
  function gateCache() { try { return JSON.parse(localStorage.getItem(GATE_KEY) || 'null'); } catch (e) { return null; } }
  function setGateCache(v) { try { if (v) localStorage.setItem(GATE_KEY, JSON.stringify(v)); else localStorage.removeItem(GATE_KEY); } catch (e) {} }
  // state：off 不啟用｜checking 確認中｜nosdk 登入程式庫沒載入｜signed-out｜none 還沒申請｜pending｜denied｜unavailable 連不上｜ok 可以用
  var gate = { on: gateEnabled(), state: 'off', admin: false, dormant: false, msg: '', reqs: [] };
  gate.state = gate.on ? (gateCache() ? 'ok' : 'checking') : 'off';
  function setGate(st, msg) { gate.state = st; gate.msg = msg || ''; listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  function monthKey(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1); }
  function setStatus(s, msg) { status = s; statusMsg = msg || ''; listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  function available() {
    return !!(global.FIREBASE_CONFIG && typeof global.firebase !== 'undefined' && global.firebase.firestore && global.firebase.auth);
  }

  function init(h) {
    hooks = h;
    if (!available()) {
      setStatus('off', global.FIREBASE_CONFIG ? '同步程式庫沒載入（可能沒有網路）' : '未設定');
      if (gate.on) setGate(gateCache() ? 'ok' : 'nosdk');      // 之前核准過的裝置，離線時照常使用
      return;
    }
    try {
      app = firebase.apps.length ? firebase.app() : firebase.initializeApp(global.FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
    } catch (e) { setStatus('error', '初始化失敗：' + e.message); return; }
    setStatus('signed-out');
    auth.getRedirectResult().catch(function (e) { if (e && e.code !== 'auth/no-auth-event') setStatus('signed-out', '登入失敗：' + friendly(e)); });
    auth.onAuthStateChanged(function (u) {
      user = u || null;
      stopListening(); stopAccess(); started = false;
      if (!user) {
        gate.admin = false; gate.dormant = false; gate.reqs = [];
        if (gate.on) { setGateCache(null); gate.state = 'signed-out'; }
        setStatus('signed-out');
        return;
      }
      if (!gate.on) { startOnce(); return; }
      var c = gateCache();
      if (c && c.uid === user.uid) { gate.admin = !!c.admin; gate.state = 'ok'; startOnce(); }   // 先放行，背景再確認
      else { setGateCache(null); gate.state = 'checking'; setStatus('ready'); }
      checkAccess();
    });
  }
  function startOnce() { if (!started) { started = true; start(); } }

  /* ---------- 使用權限 ---------- */
  function accRef() { return db.collection(ACC).doc(user.uid); }
  function stopAccess() {
    if (unsubAcc) { unsubAcc(); unsubAcc = null; }
    if (unsubReqs) { unsubReqs(); unsubReqs = null; }
  }
  function checkAccess() {
    if (!user || !gate.on) return;
    var uid = user.uid;
    var own = accRef().get().then(function (s) { return { snap: s }; }, function (e) { return { err: e }; });
    // 管理員才列得出申請單。一定要問伺服器（離線快取會回空結果，不能當成「列得出來」）
    var probe = db.collection(ACC).limit(1).get({ source: 'server' }).then(function () { return 'yes'; },
      function (e) { return e && e.code === 'permission-denied' ? 'no' : 'unknown'; });
    Promise.all([own, probe]).then(function (r) {
      if (!user || user.uid !== uid) return;
      var c = gateCache();
      var admin = r[1] === 'yes' || (r[1] === 'unknown' && !!(c && c.uid === uid && c.admin));
      applyAccess(r[0], admin);
      if (!gate.dormant && !unsubAcc) {
        // 管理員同意或撤銷時，這個畫面會自己更新
        unsubAcc = accRef().onSnapshot(function (s) {
          if (!user || user.uid !== uid || (s.metadata.fromCache && !s.exists)) return;
          applyAccess({ snap: s }, gate.admin);
        }, function () {});
      }
    });
  }
  function applyAccess(own, admin) {
    var st;
    gate.admin = admin; gate.dormant = false;
    if (admin) st = 'ok';
    else if (own.err) {
      if (own.err.code === 'permission-denied') { gate.dormant = true; st = 'ok'; }     // 規則還沒更新：審核尚未啟用
      else st = gateCache() ? 'ok' : 'unavailable';
    } else if (!own.snap.exists) st = 'none';
    else { var v = own.snap.data().status; st = v === 'approved' ? 'ok' : v === 'denied' ? 'denied' : 'pending'; }
    if (st === 'ok') {
      setGateCache({ uid: user.uid, admin: admin, t: Date.now() });
      if (admin && !unsubReqs) watchRequests();
      setGate('ok');
      startOnce();
    } else {
      if (st !== 'unavailable') setGateCache(null);
      stopListening(); started = false; queue = null;
      status = 'ready'; statusMsg = '';
      setGate(st, st === 'unavailable' ? friendly(own.err) : '');
    }
  }
  function requestAccess() {
    if (!user || !db) return;
    accRef().set({ email: user.email || '', name: user.displayName || '', status: 'pending',
                   requestedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function () { if (gate.state === 'none') setGate('pending'); })
      .catch(function (e) { setGate(gate.state, '送出失敗：' + friendly(e)); });
  }
  function watchRequests() {
    unsubReqs = db.collection(ACC).onSnapshot(function (qs) {
      var a = [];
      qs.forEach(function (d) {
        var x = d.data(), t = x.requestedAt && x.requestedAt.toMillis ? x.requestedAt.toMillis() : 0;
        a.push({ uid: d.id, email: x.email || '', name: x.name || '', status: x.status || 'pending', t: t });
      });
      a.sort(function (p, q) { return (p.status === 'pending' ? 0 : 1) - (q.status === 'pending' ? 0 : 1) || q.t - p.t; });
      gate.reqs = a;
      setGate(gate.state, gate.msg);
    }, function () {});
  }
  function decide(uid, st) {
    if (!gate.admin || !db) return Promise.resolve();
    return db.collection(ACC).doc(uid).update({ status: st, decidedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(function (e) { hooks.toast('更新失敗：' + friendly(e)); });
  }
  /* 管理頁用：讀 toeicCards/{uid} 和最近兩個月的複習紀錄 */
  function loadUser(uid) {
    if (!gate.admin || !db) return Promise.reject(new Error('not admin'));
    var ref = db.collection(COLL).doc(uid), now = Date.now(), d = new Date(now);
    var prev = monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime());
    return Promise.all([ref.get(), ref.collection('log').doc(monthKey(now)).get(), ref.collection('log').doc(prev).get()]).then(function (r) {
      var data = r[0].exists ? r[0].data() : null, log = [];
      [r[1], r[2]].forEach(function (s) { if (s.exists) (s.data().e || []).forEach(function (o) { log.push(o.t); }); });
      return { data: data, log: log, updated: data && data.updated && data.updated.toMillis ? data.updated.toMillis() : 0 };
    });
  }
  function removeAccess(uid) {
    if (!gate.admin || !db) return Promise.resolve();
    return db.collection(ACC).doc(uid).delete().catch(function (e) { hooks.toast('刪除失敗：' + friendly(e)); });
  }

  function friendly(e) {
    var c = (e && e.code) || '';
    if (c === 'auth/unauthorized-domain') return '這個網域還沒加進 Firebase 的 Authorized domains';
    if (c === 'auth/popup-closed-by-user') return '登入視窗被關掉了';
    if (c === 'auth/network-request-failed') return '沒有網路';
    if (c === 'permission-denied') return 'Firestore 安全規則拒絕存取，請檢查規則';
    return (e && e.message) || String(e);
  }

  function signIn() {
    if (!auth) return;
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setStatus('syncing', '登入中…');
    auth.signInWithPopup(provider).catch(function (e) {
      var c = e && e.code;
      if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment' || c === 'auth/cancelled-popup-request') {
        return auth.signInWithRedirect(provider);
      }
      setStatus('signed-out', '登入失敗：' + friendly(e));
    });
  }
  function signOut() {
    if (!auth) return;
    flushNow();
    setGateCache(null);
    auth.signOut();
  }

  function docRef() { return db.collection(COLL).doc(user.uid); }
  function logRef(m) { return docRef().collection('log').doc(m); }

  /* 登入後：拉雲端 → 合併 → 推回 → 開始監聽 */
  function start() {
    setStatus('syncing', '同步中…');
    Promise.all([docRef().get(), docRef().collection('log').get()]).then(function (res) {
      var snap = res[0], logs = res[1];
      var remote = snap.exists ? snap.data() : {};
      var entries = [];
      logs.forEach(function (d) { (d.data().e || []).forEach(function (o) { entries.push([o.t, o.id, o.r, o.s]); }); });
      remote.log = entries;
      var result = hooks.mergeRemote(remote);
      hooks.clearPending();
      // 全量推一次（第一次登入、或換裝置時雲端可能缺很多）
      return pushFull().then(function () {
        lastSync = Date.now();
        setStatus('synced');
        if (result.changed) hooks.toast('已和雲端合併');
        listen();
      });
    }).catch(function (e) { setStatus('error', '同步失敗：' + friendly(e)); });
  }

  function listen() {
    unsubDoc = docRef().onSnapshot(function (snap) {
      if (snap.metadata.hasPendingWrites || !snap.exists) return;
      var r = snap.data();
      var result = hooks.mergeRemote({ recs: r.recs, settings: r.settings, settingsUpdated: r.settingsUpdated, daily: r.daily, practice: r.practice, pday: r.pday, custom: r.custom,
                                       place: r.place, placeCleared: r.placeCleared });
      lastSync = Date.now();
      setStatus('synced');
      var pw = result.practiceLocalWins || [], dw = result.pdayLocalWins || [], cw = result.customLocalWins || [], lw = result.placeLocalWins || [];
      if (result.localWinIds.length || pw.length || dw.length || cw.length || lw.length || result.placeClearedLocalWins) {
        noteChange({ ids: result.localWinIds, settings: result.settingsLocalWins, daily: true, log: [], practice: pw, pdays: dw, custom: cw,
                     place: lw, placeCleared: result.placeClearedLocalWins });
      }
      if (result.changed) hooks.render();
    }, function (e) { setStatus('error', '監聽失敗：' + friendly(e)); });
    var m = monthKey(Date.now());
    unsubLog = logRef(m).onSnapshot(function (snap) {
      if (snap.metadata.hasPendingWrites || !snap.exists) return;
      var entries = (snap.data().e || []).map(function (o) { return [o.t, o.id, o.r, o.s]; });
      var result = hooks.mergeRemote({ log: entries });
      if (result.changed) hooks.render();
    }, function () {});
  }
  function stopListening() {
    if (unsubDoc) { unsubDoc(); unsubDoc = null; }
    if (unsubLog) { unsubLog(); unsubLog = null; }
  }

  function toLogObjs(entries) { return entries.map(function (e) { return { t: e[0], id: e[1], r: e[2], s: e[3] }; }); }

  function pushFull() {
    var s = hooks.getState();
    var batch = db.batch();
    batch.set(docRef(), {
      recs: s.recs, settings: s.settings, settingsUpdated: s.settingsUpdated || 0, daily: s.daily,
      practice: s.practice || {}, pday: s.pday || {}, custom: s.custom || {}, place: s.place || {}, placeCleared: s.placeCleared || 0,
      updated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    var byMonth = {};
    s.log.forEach(function (e) { var m = monthKey(e[0]); (byMonth[m] = byMonth[m] || []).push(e); });
    Object.keys(byMonth).forEach(function (m) {
      batch.set(logRef(m), { e: firebase.firestore.FieldValue.arrayUnion.apply(null, toLogObjs(byMonth[m])) }, { merge: true });
    });
    return batch.commit();
  }

  /* app 每次 save() 呼叫：累積變更，1.5 秒後一次推 */
  function noteChange(ch) {
    if (!user || status === 'off' || (gate.on && gate.state !== 'ok')) return;
    queue = queue || { ids: {}, settings: false, daily: false, log: [], practice: {}, pdays: {}, custom: {}, place: {}, placeCleared: false };
    (ch.ids || []).forEach(function (id) { queue.ids[id] = true; });
    if (ch.settings) queue.settings = true;
    if (ch.daily) queue.daily = true;
    if (ch.log && ch.log.length) queue.log = queue.log.concat(ch.log);
    (ch.practice || []).forEach(function (k) { queue.practice[k] = true; });
    (ch.pdays || []).forEach(function (k) { queue.pdays[k] = true; });
    (ch.custom || []).forEach(function (k) { queue.custom[k] = true; });
    (ch.place || []).forEach(function (k) { queue.place[k] = true; });
    if (ch.placeCleared) queue.placeCleared = true;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushNow, 1500);
  }
  function flushNow() {
    clearTimeout(flushTimer);
    if (!user || !queue) return;
    var q = queue; queue = null;
    var s = hooks.getState();
    var upd = { updated: firebase.firestore.FieldValue.serverTimestamp() };
    var ids = Object.keys(q.ids);
    if (ids.length) { upd.recs = {}; ids.forEach(function (id) { upd.recs[id] = s.recs[id] || null; }); }
    if (q.settings) { upd.settings = s.settings; upd.settingsUpdated = s.settingsUpdated || 0; }
    if (q.daily) upd.daily = s.daily;
    var pk = Object.keys(q.practice || {});
    if (pk.length) {
      upd.practice = {};
      pk.forEach(function (k) {
        var i = k.indexOf('|'), tp = k.slice(0, i), id = k.slice(i + 1);
        var v = (s.practice && s.practice[tp] && s.practice[tp][id]) || null;
        if (v) { (upd.practice[tp] = upd.practice[tp] || {})[id] = v; }
      });
    }
    var dk = Object.keys(q.pdays || {});
    if (dk.length) { upd.pday = {}; dk.forEach(function (k) { if (s.pday && s.pday[k]) upd.pday[k] = s.pday[k]; }); }
    var ck = Object.keys(q.custom || {});
    if (ck.length) { upd.custom = {}; ck.forEach(function (k) { if (s.custom && s.custom[k]) upd.custom[k] = s.custom[k]; }); }
    var lk = Object.keys(q.place || {});
    if (lk.length) { upd.place = {}; lk.forEach(function (k) { if (s.place && s.place[k]) upd.place[k] = s.place[k]; }); }
    if (q.placeCleared) upd.placeCleared = s.placeCleared || 0;
    var batch = db.batch();
    batch.set(docRef(), upd, { merge: true });
    var byMonth = {};
    q.log.forEach(function (e) { var m = monthKey(e[0]); (byMonth[m] = byMonth[m] || []).push(e); });
    Object.keys(byMonth).forEach(function (m) {
      batch.set(logRef(m), { e: firebase.firestore.FieldValue.arrayUnion.apply(null, toLogObjs(byMonth[m])) }, { merge: true });
    });
    setStatus('syncing');
    batch.commit().then(function () { lastSync = Date.now(); setStatus('synced'); })
      .catch(function (e) { setStatus('error', '上傳失敗：' + friendly(e)); });
  }

  // 關閉分頁前把還沒推的先推掉（離線時 SDK 會存在本機佇列）
  global.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushNow(); });

  global.Sync = {
    init: init,
    available: available,
    signIn: signIn,
    signOut: signOut,
    noteChange: noteChange,
    flush: flushNow,
    onStatus: function (f) { listeners.push(f); },
    gate: function () { return { on: gate.on, state: gate.state, admin: gate.admin, dormant: gate.dormant, msg: gate.msg, reqs: gate.reqs,
                                 user: user ? { name: user.displayName, email: user.email, photo: user.photoURL } : null }; },
    requestAccess: requestAccess, decide: decide, removeAccess: removeAccess, recheck: checkAccess, loadUser: loadUser,
    info: function () {
      return { status: status, msg: statusMsg, user: user ? { name: user.displayName, email: user.email, photo: user.photoURL } : null, lastSync: lastSync };
    }
  };
})(window);
