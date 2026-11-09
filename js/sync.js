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
 *   toeicCards/{uid}                { recs, settings, settingsUpdated, daily, updated }
 *   toeicCards/{uid}/log/{YYYY-MM}  { e: [{t, id, r, s}, ...] }
 */
(function (global) {
  'use strict';

  var COLL = 'toeicCards';
  var app = null, auth = null, db = null, user = null;
  var hooks = null;           // { getState, mergeRemote(remote) -> {localWinIds, changed}, render, toast, clearPending }
  var unsubDoc = null, unsubLog = null;
  var queue = null, flushTimer = null;
  var lastSync = 0, status = 'off';   // off | ready | signed-out | syncing | synced | error
  var statusMsg = '';
  var listeners = [];

  function monthKey(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1); }
  function setStatus(s, msg) { status = s; statusMsg = msg || ''; listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  function available() {
    return !!(global.FIREBASE_CONFIG && typeof global.firebase !== 'undefined' && global.firebase.firestore && global.firebase.auth);
  }

  function init(h) {
    hooks = h;
    if (!available()) { setStatus('off', global.FIREBASE_CONFIG ? '同步程式庫沒載入（可能沒有網路）' : '未設定'); return; }
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
      stopListening();
      if (user) start(); else setStatus('signed-out');
    });
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
      var result = hooks.mergeRemote({ recs: r.recs, settings: r.settings, settingsUpdated: r.settingsUpdated, daily: r.daily });
      lastSync = Date.now();
      setStatus('synced');
      if (result.localWinIds.length) noteChange({ ids: result.localWinIds, settings: result.settingsLocalWins, daily: true, log: [] });
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
    if (!user || status === 'off') return;
    queue = queue || { ids: {}, settings: false, daily: false, log: [] };
    (ch.ids || []).forEach(function (id) { queue.ids[id] = true; });
    if (ch.settings) queue.settings = true;
    if (ch.daily) queue.daily = true;
    if (ch.log && ch.log.length) queue.log = queue.log.concat(ch.log);
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
    info: function () {
      return { status: status, msg: statusMsg, user: user ? { name: user.displayName, email: user.email, photo: user.photoURL } : null, lastSync: lastSync };
    }
  };
})(window);
