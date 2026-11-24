/* 使用權限的畫面：登入／申請／等待同意的遮罩，以及管理員在「設定」裡的審核清單。
 * 判斷邏輯都在 js/sync.js（Sync.gate()）；這支只負責畫面。
 * <body class="is-locked"> 時整個網站藏起來、只顯示 #gate；Sync.gate().state === 'ok'（或 gate 沒啟用）才解鎖。 */
(function () {
  'use strict';
  var box = document.getElementById('gate');
  if (!box || !window.Sync) { document.body.classList.remove('is-locked'); return; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function who(u) {
    return u ? '<div class="gate-user">' + (u.photo ? '<img src="' + esc(u.photo) + '" alt="" referrerpolicy="no-referrer">' : '') +
      '<div><b>' + esc(u.name || '') + '</b><span>' + esc(u.email || '') + '</span></div></div>' : '';
  }
  var SWITCH = '<button type="button" class="link-btn" data-gate="signout">換一個帳號</button>';
  function gateHtml(g, info) {
    var err = g.msg || (g.state === 'signed-out' ? info.msg : '');
    var h = '<div class="gate-card"><p class="gate-brand">多益單字卡</p>';
    if (g.state === 'checking') h += '<p class="gate-text">確認登入狀態中…</p>';
    else if (g.state === 'nosdk') h += '<h1>連不上登入服務</h1><p class="gate-text">這個網站要先登入才能使用，但登入用的程式沒有載入（可能沒有網路）。請連上網路後重新整理。</p>' +
      '<button type="button" class="reveal" data-gate="reload">重新整理</button>';
    else if (g.state === 'signed-out') h += '<h1>請先登入</h1>' +
      '<button type="button" class="reveal" data-gate="signin">使用 Google 帳號登入</button>';
    else if (g.state === 'none') h += '<h1>申請使用權限</h1>' + who(g.user) +
      '<button type="button" class="reveal" data-gate="request">申請使用權限</button>' + SWITCH;
    else if (g.state === 'pending') h += '<h1>等待管理員同意</h1>' + who(g.user) + '<p class="gate-text">申請已經送出。管理員同意後，這個畫面會自動進入網站，不用重新整理。</p>' + SWITCH;
    else if (g.state === 'denied') h += '<h1>申請沒有通過</h1>' + who(g.user) + '<p class="gate-text">這個帳號目前不能使用這個網站。如果覺得有誤，請直接聯絡管理員。</p>' + SWITCH;
    else if (g.state === 'unavailable') h += '<h1>無法確認使用權限</h1>' + who(g.user) + '<p class="gate-text">目前連不上伺服器，沒辦法確認這個帳號的使用權限。請確認網路後再試一次。</p>' +
      '<button type="button" class="reveal" data-gate="retry">再試一次</button>' + SWITCH;
    if (err) h += '<p class="gate-err">' + esc(err) + '</p>';
    return h + '</div>';
  }
  /* ---------- 管理頁（只有管理員看得到「管理」分頁）：審核申請＋每個人的學習狀況 ---------- */
  var stats = {};                                    // uid → { loading, err, s: 摘要, t: 讀取時間 }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function md(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function mdhm(t) { var d = new Date(t); return md(t) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  /* 把對方的雲端資料整理成幾個數字（資料格式見 tools/SPEC.md 第 10 節） */
  function summarize(x) {
    var d = x.data; if (!d) return null;
    var c = { total: 0, learning: 0, review: 0, known: 0 }, recs = d.recs || {};
    Object.keys(recs).forEach(function (k) {
      var r = recs[k]; if (!r || !r.st || r.st === 'new') return;
      c.total++;
      if (r.st === 'learning' || r.st === 'relearning') c.learning++; else if (r.st === 'review') c.review++; else if (r.st === 'known') c.known++;
    });
    var q = { p5: [0, 0], read: [0, 0], listen: [0, 0] }, pr = d.practice || {};
    Object.keys(q).forEach(function (t) {
      var per = t === 'read' ? 3 : 1;
      Object.keys(pr[t] || {}).forEach(function (id) { var r = pr[t][id]; if (r && r[0]) { q[t][0] += r[0] * per; q[t][1] += r[1] || 0; } });
    });
    var days = {}, i, now = Date.now(), from = new Date(); from.setHours(0, 0, 0, 0); from = from.getTime() - 6 * 864e5;
    var rev7 = 0, prac7 = 0;
    (x.log || []).forEach(function (t) { if (t >= from) { rev7++; days[dayKey(t)] = 1; } });
    for (i = 0; i < 7; i++) {
      var k = dayKey(now - i * 864e5), pd = (d.pday || {})[k];
      if (!pd) continue;
      var n = ['p5', 'read', 'listen'].reduce(function (a, t) { return a + ((pd[t] && pd[t][0]) || 0); }, 0);
      if (n) { prac7 += n; days[k] = 1; }
    }
    var cut = d.placeCleared || 0, place = null;
    Object.keys(d.place || {}).forEach(function (k) { var v = d.place[k]; if (v && (v.t || 0) > cut && (!place || v.t > place.t)) place = v; });
    return { c: c, q: q, qn: q.p5[0] + q.read[0] + q.listen[0], qc: q.p5[1] + q.read[1] + q.listen[1],
             rev7: rev7, prac7: prac7, days7: Object.keys(days).length, place: place, updated: x.updated };
  }
  function ensureStats(g, force) {
    g.reqs.forEach(function (r) {
      if (r.status !== 'approved' || (stats[r.uid] && (!force || stats[r.uid].loading))) return;      // 讀過（含讀失敗）就不自動重讀，按「重新整理」才重讀
      stats[r.uid] = { loading: true, s: stats[r.uid] && stats[r.uid].s };
      Sync.loadUser(r.uid).then(function (x) { stats[r.uid] = { s: summarize(x), t: Date.now(), empty: !x.data }; render(); },
                                function (e) { stats[r.uid] = { err: (e && e.code) || 'error' }; render(); });
    });
  }
  function statHtml(uid) {
    var st = stats[uid];
    if (!st || (st.loading && !st.s)) return '<p class="adm-line adm-dim">讀取學習狀況中…</p>';
    if (st.err) return '<p class="adm-line adm-dim">讀不到學習狀況（' + esc(st.err === 'permission-denied' ? 'Firestore 規則不允許' : st.err) + '）</p>';
    var s = st.s;
    if (!s) return '<p class="adm-line adm-dim">還沒有學習紀錄。</p>';
    var pct = s.qn ? Math.round(s.qc / s.qn * 100) + '%' : '—';
    return '<div class="adm-nums">' +
        '<div><b>' + s.c.total + '</b><span>學過的字</span></div>' +
        '<div><b>' + s.qn + '</b><span>練習題數</span></div>' +
        '<div><b>' + pct + '</b><span>練習答對率</span></div>' +
        '<div><b>' + s.days7 + ' 天</b><span>近 7 天有使用</span></div></div>' +
      '<p class="adm-line">單字：學習中 ' + s.c.learning + '・複習中 ' + s.c.review + '・已會 ' + s.c.known + '</p>' +
      '<p class="adm-line">練習：單字填空 ' + s.q.p5[0] + ' 題・閱讀 ' + s.q.read[0] + ' 題・聽力 ' + s.q.listen[0] + ' 題</p>' +
      '<p class="adm-line">最近 7 天：複習單字卡 ' + s.rev7 + ' 次、練習 ' + s.prac7 + ' 題</p>' +
      '<p class="adm-line">落點測驗：' + (s.place ? (s.place.S ? '約 ' + s.place.S[1] + ' 分（' + s.place.S[0] + '–' + s.place.S[2] + '）' : '只測閱讀，約 ' + s.place.R[1] + ' 分') + '・' + md(s.place.t) : '還沒測過') + '</p>' +
      '<p class="adm-line adm-dim">最後同步：' + (s.updated ? mdhm(s.updated) : '不明') + '</p>';
  }
  function userCard(r) {
    var btn = r.status === 'pending' ? '<button type="button" class="tool-btn acc-yes" data-acc="approved">同意</button><button type="button" class="tool-btn" data-acc="denied">拒絕</button>'
      : r.status === 'approved' ? '<button type="button" class="tool-btn" data-acc="denied">撤銷</button>'
      : '<button type="button" class="tool-btn acc-yes" data-acc="approved">改為同意</button><button type="button" class="tool-btn" data-acc="remove">刪除</button>';
    return '<div class="acc-row is-' + r.status + '" data-uid="' + esc(r.uid) + '"><div class="acc-head"><div class="acc-who"><b>' + esc(r.name || '（沒有名字）') + '</b><span>' + esc(r.email) + '</span>' +
      (r.t ? '<small>' + md(r.t) + ' 申請</small>' : '') + '</div><div class="acc-btns">' + btn + '</div></div>' +
      (r.status === 'approved' ? '<div class="adm-stats">' + statHtml(r.uid) + '</div>' : '') + '</div>';
  }
  function adminPageHtml(g) {
    if (!g.admin) return '<p class="note">這一頁只有管理員可以使用。</p>';
    var by = { pending: [], approved: [], denied: [] };
    g.reqs.forEach(function (r) { (by[r.status] || by.pending).push(r); });
    var h = '<div class="prac-top"><b>管理</b><span></span><button type="button" class="link-btn" data-adm="reload">重新整理</button></div>';
    h += '<h2 class="stat-h">待審核' + (by.pending.length ? '<span class="acc-badge">' + by.pending.length + '</span>' : '') + '</h2>';
    h += by.pending.length ? '<div class="acc-list">' + by.pending.map(userCard).join('') + '</div>'
      : '<p class="note">目前沒有新的申請。別人用 Google 帳號登入並按「申請使用權限」後，會出現在這裡。</p>';
    h += '<h2 class="stat-h">使用中（' + by.approved.length + ' 人）</h2>';
    h += by.approved.length ? '<div class="acc-list">' + by.approved.map(userCard).join('') + '</div>' : '';
    if (by.denied.length) h += '<h2 class="stat-h">已拒絕</h2><div class="acc-list">' + by.denied.map(userCard).join('') + '</div>';
    return h;
  }
  function settingsHtml(g) {
    if (!g.on) return '';
    if (g.dormant) return '<h2 class="stat-h">使用權限</h2><p class="note">使用權限審核還沒啟用（Firestore 安全規則尚未更新），目前只要用 Google 帳號登入就能使用。</p>';
    if (!g.admin) return '';
    var pend = g.reqs.filter(function (r) { return r.status === 'pending'; }).length;
    return '<h2 class="stat-h">使用權限' + (pend ? '<span class="acc-badge">' + pend + ' 個待審核</span>' : '') + '</h2>' +
      '<p class="note">你是管理員。審核申請、看每個人的學習狀況，請到「管理」分頁。</p>';
  }
  var lastGate = '', lastSet = '', lastAdm = '';
  function render() {
    var g = Sync.gate(), locked = g.on && g.state !== 'ok';
    document.body.classList.toggle('is-locked', locked);
    var gh = locked ? gateHtml(g, Sync.info()) : '';
    if (gh !== lastGate) { box.innerHTML = gh; lastGate = gh; }
    var ab = document.getElementById('accessBox'), sh = settingsHtml(g);
    if (ab && sh !== lastSet) { ab.innerHTML = sh; lastSet = sh; }
    var tab = document.getElementById('adminTab'), view = document.getElementById('view-admin'), root = document.getElementById('adminRoot');
    if (!tab || !view || !root) return;
    tab.hidden = !g.admin;
    tab.classList.toggle('has-badge', g.admin && g.reqs.some(function (r) { return r.status === 'pending'; }));
    var active = view.classList.contains('is-active');
    if (active && !g.admin && !locked && g.state !== 'checking') {            // 不是管理員卻停在管理頁（例如換了帳號）→ 回學習頁
      var home = document.querySelector('.view-btn[data-view="study"]'); if (home) home.click();
      return;
    }
    if (active && g.admin) ensureStats(g);
    var ah = active ? adminPageHtml(g) : '';
    if (ah !== lastAdm) { root.innerHTML = ah; lastAdm = ah; }
  }
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-gate]'); if (!b) return;
    var a = b.getAttribute('data-gate');
    if (a === 'signin') Sync.signIn();
    else if (a === 'signout') Sync.signOut();
    else if (a === 'request') { b.disabled = true; Sync.requestAccess(); }
    else if (a === 'retry') Sync.recheck();
    else if (a === 'reload') location.reload();
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-acc]'); if (!b) return;
    var row = b.closest('[data-uid]'), uid = row && row.getAttribute('data-uid'), a = b.getAttribute('data-acc');
    if (!uid) return;
    if (a === 'remove') { if (confirm('刪除這筆申請？對方可以重新申請。')) Sync.removeAccess(uid); }
    else if (a === 'denied' && row.classList.contains('is-approved')) { if (confirm('撤銷這個人的使用權限？')) Sync.decide(uid, a); }
    else Sync.decide(uid, a);
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-adm="reload"]')) { ensureStats(Sync.gate(), true); render(); }
    if (e.target.closest('.view-btn')) setTimeout(render, 0);           // 切到管理頁時畫出內容、讀學習狀況
  });
  // 鎖住時，鍵盤快捷鍵不要動到後面的單字卡
  ['keydown', 'keyup', 'keypress'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      if (document.body.classList.contains('is-locked') && !(e.target.closest && e.target.closest('#gate'))) e.stopImmediatePropagation();
    }, true);
  });
  Sync.onStatus(render);
  render();
})();
