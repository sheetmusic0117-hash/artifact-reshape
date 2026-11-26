// 用 node test/verify.js 執行：核對引擎與獨立計算的結果
const RE = require('../engine.js');
let fail = 0;
const near = (a, b, tol, msg) => {
  const ok = Math.abs(a - b) <= tol;
  if (!ok) fail++;
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + msg + ': ' + a.toFixed(4) + ' vs ' + b.toFixed(4));
};

// 1) 命中分佈機率總和 = 1，且保底後選中兩詞條合計 ≥ 保底
for (const G of [2, 3, 4]) for (const U of [4, 5]) for (const pair of RE.PAIRS) {
  const hd = RE.hitDist(U, pair, G);
  const s = hd.reduce((a, x) => a + x.p, 0);
  if (Math.abs(s - 1) > 1e-12) { fail++; console.log('FAIL sum', G, U, pair, s); }
  for (const x of hd) if (x.h[pair[0]] + x.h[pair[1]] < G) { fail++; console.log('FAIL guarantee', x.h); }
}
console.log('hitDist 檢查完成');

// 2) 與先前 Python 結果比對：比例 1.2:0:0.5:0、保底 3、12 命中 ≥4
//    初始值設為平均值 → 每次命中期望 +比例，初始收益 = 1.7
function run(w) {
  const subs = ['cr', 'def', 'atkp', 'hp'].map((id, i) => ({ stat: id, init: RE.statById[id].avg, w: w[i] }));
  return RE.compute({ subs, upgrades: 5, guarantee: 3, conds: [{ type: 'hits', subs: [true, true, false, false], min: 4 }] });
}
const init1 = 1.2 + 0.5;
const r1 = run([1.2, 0, 0.5, 0]);
const py1 = { '0,1': [0.1875, 2.7083], '0,2': [0.1875, 3.4870], '0,3': [0.1875, 3.3672], '1,2': [0.1875, 2.0495], '1,3': [0.1875, 1.9297] };
for (const r of r1) {
  const k = r.pair.join(',');
  if (!py1[k]) continue;
  near(r.P, py1[k][0], 1e-4, `[1.2,0,0.5,0] ${k} 成功率`);
  near(r.meanSucc - init1, py1[k][1], 1e-3, `[1.2,0,0.5,0] ${k} 成功平均(扣初始)`);
}
const init2 = 1.2 + 1 + 0.5;
const r2 = run([1.2, 1, 0.5, 0]);
const py2 = { '0,1': 4.7917, '0,2': 4.9714, '0,3': 4.8516, '1,2': 4.7318, '1,3': 4.6120 };
for (const r of r2) {
  const k = r.pair.join(',');
  if (py2[k] == null) continue;
  near(r.meanSucc - init2, py2[k], 1e-3, `[1.2,1,0.5,0] ${k} 成功平均(扣初始)`);
}

// 3) 推算：爆擊率 3.5+3.89+2.72 = 10.11 → 顯示 10.1，應推得 3 次命中
const inf = RE.infer([
  { stat: 'cr', value: 10.1 }, { stat: 'cd', value: 7.0 }, { stat: 'atkp', value: 9.9 }, { stat: 'def', value: 46 },
], 4);
console.log('推算:', JSON.stringify(inf.subs.map(s => ({ ks: s.ks, tiers: s.tiers, auto: +s.auto.toFixed(3) }))), 'ok=', inf.ok);

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
