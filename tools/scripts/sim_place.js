require('/home/claude/work/site/js/score.js');
const S = globalThis.ToeicScore;
function run(theta, nL, nP5, nPass) {
  // listening
  let obsL = [], obsR = [];
  for (let i = 0; i < nL; i++) { const lv = S.bestLevel(S.estimate(obsL), 1/3); obsL.push({ lv, c: 1/3, ok: Math.random() < S.prob(theta.L, lv, 1/3) }); }
  for (let i = 0; i < nP5; i++) { const lv = S.bestLevel(S.estimate(obsR), .25); obsR.push({ lv, c: .25, ok: Math.random() < S.prob(theta.R, lv, .25) }); }
  for (let i = 0; i < nPass; i++) { const lv = S.bestLevel(S.estimate(obsR), .25); for (let k = 0; k < 3; k++) obsR.push({ lv, c: .25, ok: Math.random() < S.prob(theta.R, lv, .25) }); }
  const L = S.estimate(obsL), R = S.estimate(obsR);
  return { L, R, T: S.total(L, R) };
}
for (const t of [100, 150, 200, 250, 300, 350, 400, 450, 480]) {
  let errs = [], cover = 0, sds = [], N = 400;
  for (let r = 0; r < N; r++) {
    const o = run({ L: t, R: t }, 15, 16, 3);
    const tot = o.L.m + o.R.m; errs.push(tot - 2 * t); sds.push(o.T[2] - o.T[0]);
    if (o.T[0] <= 2 * t && 2 * t <= o.T[2]) cover++;
  }
  const mean = errs.reduce((a, b) => a + b) / N, rmse = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / N);
  console.log('true total', 2 * t, 'bias', mean.toFixed(0), 'rmse', rmse.toFixed(0), 'avg width', (sds.reduce((a, b) => a + b) / N).toFixed(0), 'coverage', (cover / N * 100).toFixed(0) + '%');
}
