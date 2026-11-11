/* 間隔複習排程（仿 Anki 的 SM-2 變體）
 *
 * 卡片狀態 st：
 *   new        還沒學過
 *   learning   剛學，走學習步驟（1 分鐘 → 10 分鐘 → 畢業為 review）
 *   relearning 複習時忘記，重走 10 分鐘步驟後回到 review
 *   review     已畢業，以「天」為單位排程
 *   known      使用者標記「早就會了」，不排進複習
 *   suspended  使用者手動停用
 *
 * 卡片紀錄欄位：
 *   st, step(學習步驟索引), iv(天), ef(難易度係數), due(毫秒時間戳),
 *   reps(評分次數), lapses(忘記次數), last(最後一次評分時間)
 */
(function (global) {
  'use strict';

  var MIN = 60 * 1000;
  var DAY = 24 * 60 * MIN;
  var LEARN_STEPS = [1 * MIN, 10 * MIN];   // 新卡學習步驟
  var RELEARN_STEPS = [10 * MIN];          // 忘記後的重學步驟
  var GRADUATE_IV = 1;                     // 良好畢業：1 天
  var EASY_IV = 4;                         // 簡單畢業：4 天
  var MAX_IV = 365;
  var MIN_EF = 1.3;
  var LEARN_AHEAD = 2 * MIN;               // 沒卡可複習時，自動提前抓 2 分鐘內到期的學習卡（更久的讓使用者自己決定）

  function newRecord() {
    return { st: 'new', step: 0, iv: 0, ef: 2.5, due: 0, reps: 0, lapses: 0, last: 0 };
  }

  function startOfDay(t) {
    var d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // 複習卡的到期時間定在目標日的 00:00，當天任何時候都算到期
  function dueInDays(now, days) {
    return startOfDay(now) + Math.round(days) * DAY;
  }

  // 小幅隨機，避免同一天學的卡永遠一起到期
  function fuzz(days) {
    if (days < 3) return days;
    var f = days < 7 ? 1 : days < 30 ? Math.round(days * 0.08) : Math.round(days * 0.05);
    return days + Math.floor(Math.random() * (2 * f + 1)) - f;
  }

  function clampIv(days) {
    return Math.max(1, Math.min(MAX_IV, Math.round(days)));
  }

  /* 計算評分後的新紀錄。rating: 1 重來 / 2 困難 / 3 良好 / 4 簡單 */
  function apply(rec, rating, now, opts) {
    opts = opts || {};
    var useFuzz = opts.fuzz !== false;
    var r = Object.assign({}, rec);
    r.reps = (r.reps || 0) + 1;
    r.last = now;

    if (r.st === 'new' || r.st === 'learning' || r.st === 'relearning') {
      var steps = r.st === 'relearning' ? RELEARN_STEPS : LEARN_STEPS;
      var wasRelearning = r.st === 'relearning';
      if (r.st === 'new') { r.st = 'learning'; r.step = 0; }

      if (rating === 1) {
        r.step = 0;
        r.due = now + steps[0];
      } else if (rating === 2) {
        // 困難：停在目前步驟，間隔取目前步驟與下一步驟的中間
        var cur = steps[r.step] || steps[steps.length - 1];
        var nxt = steps[r.step + 1] || cur * 2;
        r.due = now + Math.round((cur + nxt) / 2);
      } else if (rating === 3) {
        if (r.step + 1 < steps.length) {
          r.step += 1;
          r.due = now + steps[r.step];
        } else {
          graduate(r, wasRelearning ? Math.max(1, r.iv) : GRADUATE_IV, now, useFuzz);
        }
      } else {
        graduate(r, wasRelearning ? Math.max(EASY_IV, r.iv) : EASY_IV, now, useFuzz);
      }
      return r;
    }

    if (r.st === 'review') {
      if (rating === 1) {
        r.lapses = (r.lapses || 0) + 1;
        r.ef = Math.max(MIN_EF, r.ef - 0.2);
        r.iv = 1;                         // 忘記後重來，畢業回到 1 天
        r.st = 'relearning';
        r.step = 0;
        r.due = now + RELEARN_STEPS[0];
      } else if (rating === 2) {
        r.ef = Math.max(MIN_EF, r.ef - 0.15);
        r.iv = clampIv(Math.max(r.iv + 1, r.iv * 1.2));
        r.due = dueInDays(now, useFuzz ? fuzz(r.iv) : r.iv);
      } else if (rating === 3) {
        r.iv = clampIv(Math.max(r.iv + 1, r.iv * r.ef));
        r.due = dueInDays(now, useFuzz ? fuzz(r.iv) : r.iv);
      } else {
        var goodIv = clampIv(Math.max(r.iv + 1, r.iv * r.ef));
        r.ef = r.ef + 0.15;
        r.iv = clampIv(Math.max(goodIv + 1, r.iv * r.ef * 1.3));
        r.due = dueInDays(now, useFuzz ? fuzz(r.iv) : r.iv);
      }
      return r;
    }

    return r; // known / suspended 不排程
  }

  function graduate(r, iv, now, useFuzz) {
    r.st = 'review';
    r.step = 0;
    r.iv = clampIv(iv);
    r.due = dueInDays(now, useFuzz ? fuzz(r.iv) : r.iv);
  }

  /* 預覽四個按鈕各自的下次間隔，回傳文字 */
  function previews(rec, now) {
    var out = {};
    for (var rt = 1; rt <= 4; rt++) {
      var r = apply(rec, rt, now, { fuzz: false });
      out[rt] = fmtInterval(r.due, now, r.st);
    }
    return out;
  }

  function fmtInterval(due, now, st) {
    if (st === 'learning' || st === 'relearning') {
      var m = Math.round((due - now) / MIN);
      if (m < 1) return '<1 分';
      if (m < 60) return m + ' 分';
      return Math.round(m / 60) + ' 小時';
    }
    var d = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
    if (d <= 0) d = 1;
    if (d < 30) return d + ' 天';
    if (d < 365) return (d / 30).toFixed(1).replace(/\.0$/, '') + ' 月';
    return (d / 365).toFixed(1).replace(/\.0$/, '') + ' 年';
  }

  function fmtDue(due, now) {
    var diff = due - now;
    if (diff <= 0) return '現在';
    var m = Math.round(diff / MIN);
    if (m < 60) return m + ' 分鐘後';
    var h = Math.round(diff / (60 * MIN));
    if (h < 24 && startOfDay(due) === startOfDay(now)) return h + ' 小時後';
    var days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
    if (days <= 1) return '明天';
    if (days < 30) return days + ' 天後';
    var dt = new Date(due);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  /* 建立學習佇列
   * cards: [{id, level}], recs: {id: rec}, filter: 'all' | 400 | 600 | 800 | 990
   * newAllowance: 今天還可以放幾張新卡
   */
  function buildQueue(cards, recs, filter, now, newAllowance, newOrder) {
    var learn = [], review = [], fresh = [], pendingLearn = [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (filter !== 'all' && c.level !== filter) continue;
      var r = recs[c.id] || newRecord();
      if (r.st === 'learning' || r.st === 'relearning') {
        if (r.due <= now) learn.push(c.id); else pendingLearn.push({ id: c.id, due: r.due });
      } else if (r.st === 'review') {
        if (r.due <= now) review.push(c.id);
      } else if (r.st === 'new') {
        fresh.push(c.id);
      }
    }
    learn.sort(function (a, b) { return recs[a].due - recs[b].due; });
    shuffle(review);
    if (newOrder === 'random') shuffle(fresh);
    // 在練習題裡點過「要背」的字（pri = 存的時間）排最前面，先存的先背
    var pri = [], rest = [];
    for (var k = 0; k < fresh.length; k++) { var pr = recs[fresh[k]]; if (pr && pr.pri) pri.push(fresh[k]); else rest.push(fresh[k]); }
    if (pri.length) { pri.sort(function (a, b) { return recs[a].pri - recs[b].pri; }); fresh = pri.concat(rest); }
    var newToday = fresh.slice(0, Math.max(0, newAllowance));
    pendingLearn.sort(function (a, b) { return a.due - b.due; });
    return {
      learn: learn,
      review: review,
      fresh: newToday,
      freshTotal: fresh.length,
      pendingLearn: pendingLearn
    };
  }

  /* 從佇列挑下一張：到期學習卡 → 複習與新卡交錯 → 提前抓學習卡 */
  function pickNext(q, now, lastId) {
    if (q.learn.length) return { id: q.learn[0], kind: 'learn' };
    var total = q.review.length + q.fresh.length;
    if (total) {
      // 每 3 張複習插 1 張新卡，避免新卡全部堆在最後
      var useNew = q.fresh.length && (!q.review.length || (q.review.length + q.fresh.length) % 4 === 0);
      if (useNew) return { id: q.fresh[0], kind: 'new' };
      return { id: q.review[0], kind: 'review' };
    }
    if (q.pendingLearn.length && q.pendingLearn[0].due - now <= LEARN_AHEAD) {
      return { id: q.pendingLearn[0].id, kind: 'learn', ahead: true };
    }
    return null;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  global.SRS = {
    MIN: MIN, DAY: DAY,
    newRecord: newRecord,
    apply: apply,
    previews: previews,
    fmtInterval: fmtInterval,
    fmtDue: fmtDue,
    buildQueue: buildQueue,
    pickNext: pickNext,
    startOfDay: startOfDay,
    LEARN_AHEAD: LEARN_AHEAD
  };
})(typeof window !== 'undefined' ? window : globalThis);
