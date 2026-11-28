/*
 * 聖遺物重塑模擬核心（精確窮舉，不是隨機模擬）
 *
 * 模型：
 *  - 每次強化等機率落在 4 個詞條之一（各 1/4）。
 *  - 每次命中的數值等機率為第七～第十檔之一（各 1/4）。
 *  - 保底：結果出來後，若選中兩詞條的強化命中合計 < 保底，
 *    就逐次從「未選中詞條的命中」隨機拿走 1 次（依命中次數加權），
 *    再隨機（各 1/2）加到兩個選中詞條之一，直到合計 = 保底。
 *    被搬動的那次命中會重新抽檔位（檔位仍各 1/4）。
 *  - 重塑會保留四個詞條的初始值，只重抽強化。
 *
 * 收益 = Σ 比例_i × 數值_i ÷ 詞條 i 的平均單次值
 * （比例 1 的詞條每命中一次平均 +1 分）
 *
 * 同時可在瀏覽器（window.RE）與 Node（module.exports）使用。
 */
(function (root) {
  'use strict';

  // 五星聖遺物副詞條單次數值（第七～第十檔）
  const STATS = [
    { id: 'hp',   name: '生命值',       tiers: [209.13, 239.00, 268.88, 298.75], pct: false },
    { id: 'atk',  name: '攻擊力',       tiers: [13.62, 15.55, 17.51, 19.45],     pct: false },
    { id: 'def',  name: '防禦力',       tiers: [16.20, 18.52, 20.83, 23.15],     pct: false },
    { id: 'em',   name: '元素精通',     tiers: [16.32, 18.65, 20.98, 23.31],     pct: false },
    { id: 'hpp',  name: '生命值%',      tiers: [4.08, 4.66, 5.25, 5.83],         pct: true },
    { id: 'atkp', name: '攻擊力%',      tiers: [4.08, 4.66, 5.25, 5.83],         pct: true },
    { id: 'defp', name: '防禦力%',      tiers: [5.10, 5.83, 6.56, 7.29],         pct: true },
    { id: 'er',   name: '元素充能效率', tiers: [4.53, 5.18, 5.83, 6.48],         pct: true },
    { id: 'cr',   name: '爆擊率',       tiers: [2.72, 3.11, 3.50, 3.89],         pct: true },
    { id: 'cd',   name: '爆擊傷害',     tiers: [5.44, 6.22, 6.99, 7.77],         pct: true },
  ];
  const statById = {};
  for (const s of STATS) {
    s.avg = (s.tiers[0] + s.tiers[1] + s.tiers[2] + s.tiers[3]) / 4;
    statById[s.id] = s;
  }

  const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880];

  // 所有長度 4、總和 k 的非負整數向量
  const msCache = {};
  function multisets(k) {
    if (msCache[k]) return msCache[k];
    const out = [];
    for (let a = 0; a <= k; a++)
      for (let b = 0; a + b <= k; b++)
        for (let c = 0; a + b + c <= k; c++)
          out.push([a, b, c, k - a - b - c]);
    return (msCache[k] = out);
  }

  // 4 類各 1/4 的多項分佈機率
  function multinomP(cnt) {
    let k = 0, p = 1;
    for (const x of cnt) { k += x; p /= FACT[x]; }
    return p * FACT[k] / Math.pow(4, k);
  }

  // 依遊戲顯示精度取整（% 詞條 1 位小數，固定值取整數）
  function displayRound(stat, v) {
    return stat.pct ? Math.round(v * 10 + 1e-9) / 10 : Math.round(v + 1e-9);
  }

  /* ---------- 由目前數值推算命中次數與初始檔位 ---------- */

  // 某詞條目前數值可能由哪些「k 次命中 + 檔位組合」構成
  function decompose(stat, value, maxK) {
    const out = [];
    const tol = (stat.pct ? 0.05 : 0.5) + 0.006 * maxK; // 表中單次值已四捨五入，留一點誤差
    for (let k = 1; k <= maxK; k++) {
      for (const c of multisets(k)) {
        let sum = 0;
        for (let t = 0; t < 4; t++) sum += c[t] * stat.tiers[t];
        if (Math.abs(sum - value) <= tol) out.push({ k, counts: c, sum });
      }
    }
    return out;
  }

  /**
   * subs: [{stat:id, value:number|null}]，initCount: 3|4
   * 回傳每個詞條：{ ks:[可能命中次數], tiers:[可能初始檔位], auto:初始值估計, known:bool }
   * 以及 ok（是否找到總命中數吻合的組合）
   */
  function infer(subs, initCount) {
    const totalRolls = initCount + 5; // 4詞條：4+5=9；3詞條：3+1(解鎖)+4=8
    const maxK = 6;
    const dec = subs.map(s => {
      const st = statById[s.stat];
      if (s.value == null || !isFinite(s.value) || s.value <= 0) return null;
      return decompose(st, s.value, maxK);
    });
    const allKnown = dec.every(d => d !== null);
    let feasible = dec.map(d => d ? new Set(d.map(x => x.k)) : null);
    let ok = true;
    if (allKnown) {
      const kSets = feasible.map(s => [...s]);
      const keep = [new Set(), new Set(), new Set(), new Set()];
      for (const a of kSets[0]) for (const b of kSets[1]) for (const c of kSets[2]) for (const d of kSets[3]) {
        if (a + b + c + d === totalRolls) { keep[0].add(a); keep[1].add(b); keep[2].add(c); keep[3].add(d); }
      }
      if (keep[0].size === 0) ok = false; else feasible = keep;
    }
    const res = subs.map((s, i) => {
      const st = statById[s.stat];
      const d = dec[i];
      if (!d || d.length === 0) {
        return { known: false, ks: [], tiers: [], auto: st.avg, empty: !d };
      }
      const cands = d.filter(x => feasible[i].has(x.k));
      const use = cands.length ? cands : d;
      const tierSet = new Set();
      let acc = 0;
      for (const x of use) {
        let m = 0;
        for (let t = 0; t < 4; t++) { if (x.counts[t]) tierSet.add(t); m += x.counts[t] * st.tiers[t]; }
        acc += m / x.k; // 初始值 = 這組命中中任一次，等機率
      }
      return {
        known: true,
        ks: [...new Set(use.map(x => x.k))].sort((a, b) => a - b),
        tiers: [...tierSet].sort(),
        auto: acc / use.length,
      };
    });
    return { subs: res, ok, allKnown, totalRolls };
  }

  /* ---------- 強化命中分佈（含保底調整） ---------- */

  function hitDist(U, pair, G) {
    const map = new Map();
    const add = (h, p, trig) => {
      const key = h.join(',');
      const e = map.get(key);
      if (e) { e.p += p; e.pTrig += trig; } else map.set(key, { h, p, pTrig: trig });
    };
    const un = pair ? [0, 1, 2, 3].filter(i => i !== pair[0] && i !== pair[1]) : [];
    function adjust(h, d, p) {
      if (d === 0) { add(h, p, p); return; }
      let T = 0;
      for (const u of un) T += h[u];
      for (const u of un) {
        if (!h[u]) continue;
        for (const c of pair) {
          const h2 = h.slice(); h2[u]--; h2[c]++;
          adjust(h2, d - 1, p * h[u] / T / 2);
        }
      }
    }
    for (const h of multisets(U)) {
      const p = multinomP(h);
      if (!pair) { add(h, p, 0); continue; }
      const s = h[pair[0]] + h[pair[1]];
      if (s >= G) add(h, p, 0); else adjust(h, G - s, p);
    }
    return [...map.values()];
  }

  // 某詞條命中 k 次時，各檔位組合 {p, add(增加的數值)}
  const tdCache = {};
  function tierDist(stat, k) {
    const key = stat.id + ':' + k;
    if (tdCache[key]) return tdCache[key];
    const out = multisets(k).map(c => {
      let add = 0;
      for (let t = 0; t < 4; t++) add += c[t] * stat.tiers[t];
      return { p: multinomP(c), add, counts: c };
    });
    return (tdCache[key] = out);
  }

  /* ---------- 保留條件 ---------- */
  // 條件：{type:'hits', subs:[bool×4], min} | {type:'score', min} | {type:'value', sub, min}
  // join: 'and' | 'or'（第一個忽略）。「且」優先於「或」。
  // {type:'cap', sub, max}：收益上限，不是判定條件（超過上限的數值按上限計分），這裡略過。
  function compileConds(conds, stats) {
    conds = (conds || []).filter(c => c.type !== 'cap');
    if (conds.length === 0) return () => true;
    const groups = [];
    conds.forEach((c, i) => {
      if (i === 0 || c.join === 'or') groups.push([c]); else groups[groups.length - 1].push(c);
    });
    const test = (c, h, vals, score) => {
      if (c.type === 'hits') {
        let n = 0;
        for (let i = 0; i < 4; i++) if (c.subs[i]) n += h[i];
        return n >= c.min;
      }
      if (c.type === 'score') return score >= c.min - 1e-9;
      if (c.type === 'value') return displayRound(stats[c.sub], vals[c.sub]) >= c.min - 1e-9;
      return true;
    };
    return (h, vals, score) => groups.some(g => g.every(c => test(c, h, vals, score)));
  }

  /* ---------- 主計算 ---------- */
  const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

  /**
   * cfg = {
   *   subs: [{stat:id, init:number, w:number}] ×4,
   *   upgrades: 5|4, guarantee: 2|3|4, conds: [...],
   *   includeBaseline: bool
   * }
   */
  function compute(cfg) {
    const stats = cfg.subs.map(s => statById[s.stat]);
    const w = cfg.subs.map(s => +s.w || 0);
    const unit = stats.map(s => s.avg);
    // 收益上限：該詞條數值超過上限時按上限計分（同一詞條設了多個上限取最小）
    const cap = [Infinity, Infinity, Infinity, Infinity];
    for (const c of cfg.conds || []) {
      if (c.type === 'cap' && c.sub >= 0 && c.sub < 4 && isFinite(+c.max)) cap[c.sub] = Math.min(cap[c.sub], +c.max);
    }
    const initScore = cfg.subs.reduce((a, s, i) => a + w[i] * Math.min(s.init, cap[i]) / unit[i], 0);
    const cond = compileConds(cfg.conds, stats);
    const pairs = PAIRS.slice();
    if (cfg.includeBaseline) pairs.push(null);

    return pairs.map(pair => {
      const hd = hitDist(cfg.upgrades, pair, cfg.guarantee);
      let P = 0, sSucc = 0, sAll = 0, pTrig = 0;
      const combos = hd.map(({ h, p, pTrig: pt }) => {
        pTrig += pt;
        const lists = h.map((k, i) => tierDist(stats[i], k));
        const combo = { h, p, pTrig: pt, pSucc: 0, sSucc: 0, sFail: 0, pts: [] };
        const vals = [0, 0, 0, 0];
        (function rec(i, q) {
          if (i === 4) {
            let score = 0;
            for (let j = 0; j < 4; j++) score += w[j] * Math.min(vals[j], cap[j]) / unit[j];
            const ok = cond(h, vals, score);
            if (ok) { combo.pSucc += q; combo.sSucc += q * score; }
            else combo.sFail += q * score;
            combo.pts.push([score, q, ok]);
            return;
          }
          for (const t of lists[i]) {
            vals[i] = cfg.subs[i].init + t.add;
            rec(i + 1, q * t.p);
          }
        })(0, p);
        P += combo.pSucc; sSucc += combo.sSucc; sAll += combo.sSucc + combo.sFail;
        combo.meanSucc = combo.pSucc > 0 ? combo.sSucc / combo.pSucc : null;
        combo.meanFail = combo.p - combo.pSucc > 1e-15 ? combo.sFail / (combo.p - combo.pSucc) : null;
        return combo;
      });
      return {
        pair,
        P,
        meanSucc: P > 0 ? sSucc / P : null,
        meanAll: sAll,
        pTrig,
        initScore,
        combos,
      };
    });
  }

  const api = { STATS, statById, multisets, multinomP, displayRound, decompose, infer, hitDist, compute, PAIRS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RE = api;
})(typeof window !== 'undefined' ? window : globalThis);
