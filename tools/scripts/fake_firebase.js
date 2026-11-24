// 測試用的假 Firebase（compat API 的一小部分）：記憶體裡的「伺服器」存在 localStorage('__fakefb')，重新整理後還在。
// 在頁面載入前注入（Playwright addInitScript）。window.__fb 是測試控制用：
//   __fb.nextUser = {uid, email, displayName}   下一次 signInWithPopup 登入的帳號
//   __fb.setRules('old' | 'new')                  舊規則（只有 toeicCards 自己讀寫）／新規則（README 那一份）
//   __fb.admin = 'admin@example.com'              新規則裡的管理員信箱
//   __fb.offline = true                           模擬離線（要問伺服器的讀取會失敗）
//   __fb.serverSet(path, data) / serverDelete(path)   直接改伺服器資料（模擬另一台裝置上的管理員）
module.exports = function fakeFirebase(opts) {
  opts = opts || {};
  var KEY = '__fakefb';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { docs: {}, user: null }; } catch (e) { return { docs: {}, user: null }; } }
  var S = load();
  function persist() { localStorage.setItem(KEY, JSON.stringify(S)); }
  var fb = window.__fb = { nextUser: null, rules: S.rules || opts.rules || 'new', admin: opts.admin || 'admin@example.com', offline: false, log: [] };
  var docL = {}, collL = {}, authL = [];
  function err(code) { var e = new Error(code); e.code = code; return e; }
  function TS(ms) { return { __ts: ms }; }
  function wrap(v) {
    if (v && typeof v === 'object') {
      if (v.__ts !== undefined) return { toMillis: function () { return v.__ts; } };
      if (Array.isArray(v)) return v.map(wrap);
      var o = {}; Object.keys(v).forEach(function (k) { o[k] = wrap(v[k]); }); return o;
    }
    return v;
  }
  function resolve(v, old) {
    if (v && v.__sentinel === 'ts') return TS(Date.now());
    if (v && v.__sentinel === 'union') { var a = (old || []).slice(); v.items.forEach(function (x) { if (!a.some(function (y) { return JSON.stringify(y) === JSON.stringify(x); })) a.push(x); }); return a; }
    if (v && typeof v === 'object' && !Array.isArray(v)) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = resolve(v[k], old && old[k]); }); return o; }
    return v;
  }
  function deepMerge(a, b) {
    if (!a || typeof a !== 'object' || Array.isArray(a) || !b || typeof b !== 'object' || Array.isArray(b) || b.__ts !== undefined) return b;
    var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; }); Object.keys(b).forEach(function (k) { o[k] = deepMerge(a[k], b[k]); }); return o;
  }
  /* 規則：和 README／Firebase Console 的那一份同樣的邏輯 */
  function can(op, path, data) {
    var u = S.user, p = path.split('/');
    if (!u) return false;
    if (fb.rules === 'old') return p[0] === 'toeicCards' && p[1] === u.uid;
    var admin = u.email === fb.admin;
    var acc = S.docs['toeicAccess/' + u.uid];
    var approved = admin || (acc && acc.status === 'approved');
    if (p[0] === 'toeicCards') return ((op === 'get' || op === 'list') && admin) || (p[1] === u.uid && !!approved);   // 管理員可以讀、不能寫別人的
    if (p[0] === 'toeicAccess') {
      if (op === 'get') return admin || p[1] === u.uid;
      if (op === 'list' || op === 'update' || op === 'delete') return admin;
      if (op === 'create') return admin || (p[1] === u.uid && data.status === 'pending' && data.email === u.email &&
        Object.keys(data).every(function (k) { return ['email', 'name', 'status', 'requestedAt'].indexOf(k) >= 0; }));
    }
    return false;
  }
  function snap(path) { var d = S.docs[path]; return { exists: d !== undefined, id: path.split('/').pop(), data: function () { return wrap(d); }, metadata: { hasPendingWrites: false, fromCache: !!fb.offline } }; }
  function qsnap(coll) {
    var docs = Object.keys(S.docs).filter(function (k) { return k.indexOf(coll + '/') === 0 && k.split('/').length === coll.split('/').length + 1; }).map(snap);
    return { size: docs.length, forEach: function (f) { docs.forEach(f); }, metadata: { fromCache: !!fb.offline } };
  }
  function fire(path) {
    (docL[path] || []).forEach(function (l) { if (can('get', path)) l.cb(snap(path)); });
    var coll = path.split('/').slice(0, -1).join('/');
    (collL[coll] || []).forEach(function (l) { if (can('list', coll + '/x')) l.cb(qsnap(coll)); });
  }
  function write(path, data, merge, isUpdate) {
    var old = S.docs[path], op = isUpdate ? 'update' : (old === undefined ? 'create' : 'update');
    if (isUpdate && old === undefined) return Promise.reject(err('not-found'));
    var val = resolve(data, old);
    if (!can(op, path, val)) { fb.log.push('DENIED ' + op + ' ' + path); return Promise.reject(err('permission-denied')); }
    S.docs[path] = (merge || isUpdate) && old ? deepMerge(old, val) : val;
    persist(); fb.log.push(op + ' ' + path);
    setTimeout(function () { fire(path); }, 0);
    return Promise.resolve();
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path: path,
      get: function () {
        if (!can('get', path)) return Promise.reject(err('permission-denied'));
        if (fb.offline && S.docs[path] === undefined) return Promise.reject(err('unavailable'));
        return Promise.resolve(snap(path));
      },
      set: function (d, o) { return write(path, d, o && o.merge, false); },
      update: function (d) { return write(path, d, true, true); },
      delete: function () {
        if (!can('delete', path)) return Promise.reject(err('permission-denied'));
        delete S.docs[path]; persist(); setTimeout(function () { fire(path); }, 0); return Promise.resolve();
      },
      onSnapshot: function (cb, ecb) {
        if (!can('get', path)) { setTimeout(function () { ecb && ecb(err('permission-denied')); }, 0); return function () {}; }
        var l = { cb: cb }; (docL[path] = docL[path] || []).push(l);
        setTimeout(function () { if ((docL[path] || []).indexOf(l) >= 0) cb(snap(path)); }, 0);
        return function () { docL[path] = (docL[path] || []).filter(function (x) { return x !== l; }); };
      },
      collection: function (name) { return collRef(path + '/' + name); }
    };
  }
  function collRef(coll) {
    var q = {
      doc: function (id) { return docRef(coll + '/' + id); },
      limit: function () { return q; },
      get: function (o) {
        if (!can('list', coll + '/x') && !(coll.split('/').length === 3 && can('get', coll + '/x'))) return Promise.reject(err('permission-denied'));
        if (fb.offline && o && o.source === 'server') return Promise.reject(err('unavailable'));
        return Promise.resolve(qsnap(coll));
      },
      onSnapshot: function (cb, ecb) {
        if (!can('list', coll + '/x')) { setTimeout(function () { ecb && ecb(err('permission-denied')); }, 0); return function () {}; }
        var l = { cb: cb }; (collL[coll] = collL[coll] || []).push(l);
        setTimeout(function () { if ((collL[coll] || []).indexOf(l) >= 0) cb(qsnap(coll)); }, 0);
        return function () { collL[coll] = (collL[coll] || []).filter(function (x) { return x !== l; }); };
      }
    };
    return q;
  }
  fb.serverSet = function (path, data) { S.docs[path] = deepMerge(S.docs[path] || {}, data); persist(); fire(path); };
  fb.serverDelete = function (path) { delete S.docs[path]; persist(); fire(path); };
  fb.docs = function () { return S.docs; };
  fb.setRules = function (r) { fb.rules = S.rules = r; persist(); };            // 重新整理後還在
  function setUser(u) { S.user = u; persist(); authL.forEach(function (f) { f(u ? { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: null } : null); }); }
  var authObj = {
    getRedirectResult: function () { return Promise.resolve({}); },
    onAuthStateChanged: function (f) { authL.push(f); setTimeout(function () { var u = S.user; f(u ? { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: null } : null); }, 20); },
    signInWithPopup: function () { if (!fb.nextUser) return Promise.reject(err('auth/popup-closed-by-user')); var u = fb.nextUser; setTimeout(function () { setUser(u); }, 10); return Promise.resolve({}); },
    signInWithRedirect: function () { return authObj.signInWithPopup(); },
    signOut: function () { setTimeout(function () { setUser(null); }, 0); return Promise.resolve(); }
  };
  var fsObj = {
    enablePersistence: function () { return Promise.resolve(); },
    collection: collRef,
    batch: function () { var ops = []; return { set: function (ref, d, o) { ops.push([ref, d, o]); }, commit: function () { return ops.reduce(function (p, x) { return p.then(function () { return x[0].set(x[1], x[2]); }); }, Promise.resolve()); } }; }
  };
  var auth = function () { return authObj; }; auth.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  var firestore = function () { return fsObj; };
  firestore.FieldValue = { serverTimestamp: function () { return { __sentinel: 'ts' }; }, arrayUnion: function () { return { __sentinel: 'union', items: [].slice.call(arguments) }; } };
  var apps = [];
  window.firebase = { apps: apps, initializeApp: function (c) { apps.push(c); return c; }, app: function () { return apps[0]; }, auth: auth, firestore: firestore };
  if (opts.forceGate !== false) window.TOEIC_FORCE_GATE = true;
};
