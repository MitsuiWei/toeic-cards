/* 多益落點分數估計（純計算，不碰畫面；practice.js 和測試腳本都用這支）
 *
 * 模型：三參數試題反應理論（3PL IRT），電腦化適性測驗常用的做法。
 *   P(答對 | 能力 θ) = c + (1 − c) / (1 + e^(−a(θ − b)))
 *   θ：單科分數（聽力或閱讀，5–495）
 *   b：題目難度。題庫沒有拿真實考生的成績校正過，所以 b 是依題目級別「假設」的：
 *      衝 400 分的題 175、600 分 275、800 分 375、990 分 455（大約是那個總分一半的單科分數）
 *   a：鑑別度 0.025（能力每差 40 分，猜不到的那部分答對機率從 50% 變成 73%）
 *   c：猜對機率。四選一 1/4，聽力三選一 1/3
 * 估計：5–495 每 5 分一格算後驗分布（先驗：常態，平均 250、標準差 125），取期望值（EAP）
 *   和標準差；顯示的區間是「期望值 ± 1 個標準差」，大約是 68% 的把握。
 *   總分 = 聽力 + 閱讀，標準差用平方和開根號合併。
 */
(function (g) {
  'use strict';
  var B = { 400: 175, 600: 275, 800: 375, 990: 455 };
  var A = 0.025;
  var LEVELS = [400, 600, 800, 990];
  var GRID = [];
  for (var x = 5; x <= 495; x += 5) GRID.push(x);
  var LOG_PRIOR = GRID.map(function (t) { var z = (t - 250) / 125; return -z * z / 2; });

  function prob(theta, lv, c) { return c + (1 - c) / (1 + Math.exp(-A * (theta - B[lv]))); }
  /* obs：[{ lv: 400|600|800|990, ok: true/false, c: 猜對機率 }] → { m: 估計分數, sd: 標準差, n: 題數 } */
  function estimate(obs) {
    var lp = LOG_PRIOR.slice();
    obs.forEach(function (o) {
      if (!B[o.lv]) return;
      for (var i = 0; i < GRID.length; i++) {
        var p = prob(GRID[i], o.lv, o.c);
        lp[i] += Math.log(o.ok ? p : 1 - p);
      }
    });
    var mx = Math.max.apply(null, lp), s = 0, m = 0, v = 0;
    var w = lp.map(function (l) { return Math.exp(l - mx); });
    w.forEach(function (x, i) { s += x; m += x * GRID[i]; });
    m /= s;
    w.forEach(function (x, i) { v += x * (GRID[i] - m) * (GRID[i] - m); });
    return { m: m, sd: Math.sqrt(v / s), n: obs.length };
  }
  /* 這一題能提供多少資訊（3PL 的 Fisher information）；下一題挑資訊量最大的級別 */
  function info(theta, lv, c) {
    var p = prob(theta, lv, c), q = 1 - p, k = (p - c) / (1 - c);
    return A * A * (q / p) * k * k;
  }
  function bestLevel(est, c, allowed) {
    var best = null, bi = -1;
    (allowed || LEVELS).forEach(function (lv) {
      var i = info(est.m, lv, c);
      if (i > bi) { bi = i; best = lv; }
    });
    return best;
  }
  function r5(x) { return Math.round(x / 5) * 5; }
  function clip(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  /* 單科 → [下限, 中間, 上限]；總分（兩科合併）→ 同格式 */
  function band(est) {
    return [clip(r5(est.m - est.sd), 5, 495), clip(r5(est.m), 5, 495), clip(r5(est.m + est.sd), 5, 495)];
  }
  function total(L, R) {
    var m = L.m + R.m, sd = Math.sqrt(L.sd * L.sd + R.sd * R.sd);
    return [clip(r5(m - sd), 10, 990), clip(r5(m), 10, 990), clip(r5(m + sd), 10, 990)];
  }
  /* 建議練哪一級：往上一個目標練（總分不到 350 → 400；350–549 → 600；550–749 → 800；750 以上 → 990） */
  function suggest(totalMid) {
    return totalMid < 350 ? 400 : totalMid < 550 ? 600 : totalMid < 750 ? 800 : 990;
  }

  g.ToeicScore = { B: B, A: A, LEVELS: LEVELS, prob: prob, estimate: estimate, info: info, bestLevel: bestLevel,
                   band: band, total: total, suggest: suggest };
})(typeof window !== 'undefined' ? window : globalThis);
