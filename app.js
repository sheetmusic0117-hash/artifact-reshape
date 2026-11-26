(function () {
  'use strict';
  const RE = window.RE;
  const STATS = RE.STATS, byId = RE.statById;
  const $ = s => document.querySelector(s);
  const clone = o => JSON.parse(JSON.stringify(o));
  const t = (k, v) => I18N.t(k, v);
  const colon = () => (I18N.lang === 'en' ? ': ' : '：');
  const statName = id => t('stat.' + id);

  /* ---------------- 狀態 ---------------- */
  const DEFAULT = {
    initCount: 4,
    guarantee: 3,
    subs: [
      { stat: 'cr',   value: '', w: 1,   tier: 'auto' },
      { stat: 'cd',   value: '', w: 1,   tier: 'auto' },
      { stat: 'atkp', value: '', w: 0.5, tier: 'auto' },
      { stat: 'def',  value: '', w: 0,   tier: 'auto' },
    ],
    conds: [{ type: 'hits', join: 'and', subs: [true, true, false, false], min: 4 }],
    chartMetric: 'mean',
    baseline: false,
  };
  let S = loadState() || clone(DEFAULT);
  // sels：目前選中的選法（1～3 個）；slots：每個選法固定用的顏色序號，取消別的選法時不會換色
  const ui = { sels: [], slots: {}, combo: null, showFail: false };
  const MAX_CMP = 3;
  const SHAPES = ['circle', 'triangle', 'rect'];
  let last = null;      // 最近一次計算結果
  let inferRes = null;  // 推算結果
  const charts = {};

  function loadState() {
    try {
      if (location.hash.length > 1) {
        const s = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
        if (s && s.subs && s.subs.length === 4) return Object.assign(clone(DEFAULT), s);
      }
    } catch (e) { /* 忽略 */ }
    try {
      const raw = localStorage.getItem('reshape-state');
      if (raw) { const s = JSON.parse(raw); if (s && s.subs) return Object.assign(clone(DEFAULT), s); }
    } catch (e) { /* 忽略 */ }
    return null;
  }
  function saveState() {
    const json = JSON.stringify(S);
    try { localStorage.setItem('reshape-state', json); } catch (e) { /* 忽略 */ }
    try { history.replaceState(null, '', '#' + btoa(unescape(encodeURIComponent(json)))); } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 工具 ---------------- */
  const subName = i => statName(S.subs[i].stat);
  const fmtVal = (stat, v) => stat.pct ? v.toFixed(1) + '%' : (Math.round(v * 10) / 10).toString();
  const pct = (x, d = 2) => (x * 100).toFixed(d) + '%';
  const f2 = x => x == null ? '—' : x.toFixed(2);
  const pairLabel = pair => pair ? `${subName(pair[0])} + ${subName(pair[1])}` : t('noGuarantee');
  const comboLabel = h => h.map((k, i) => k ? `${subName(i)}×${k}` : null).filter(Boolean).join('　') || t('none');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (k in e && typeof attrs[k] !== 'string') e[k] = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    for (const k of kids) if (k != null) e.append(k);
    return e;
  }
  function statSelect(value, onchange) {
    const s = el('select', { onchange });
    for (const st of STATS) s.append(el('option', { value: st.id }, statName(st.id)));
    s.value = value;
    return s;
  }

  const isMulti = () => ui.sels.length > 1;
  const inSel = k => ui.sels.includes(k);
  const seriesColor = k => css('--s' + ((ui.slots[k] || 0) + 1));
  const swatch = k => (isMulti() && inSel(k) ? el('span', { class: 'swatch', style: `background:${seriesColor(k)}` }) : null);
  function selectOnly(k) { ui.sels = [k]; ui.slots = { [k]: 0 }; ui.combo = null; }
  function toggleSel(k) {
    if (inSel(k)) {
      if (ui.sels.length === 1) return;
      ui.sels = ui.sels.filter(x => x !== k);
      delete ui.slots[k];
    } else {
      if (ui.sels.length >= MAX_CMP) return;
      const used = Object.values(ui.slots);
      let slot = 0;
      while (used.includes(slot)) slot++;
      ui.sels.push(k);
      ui.slots[k] = slot;
    }
    ui.combo = null;
  }

  /* ---------------- 1. 聖遺物 ---------------- */
  function renderSubs() {
    $('#initCount').value = String(S.initCount);
    $('#guarantee').value = String(S.guarantee);
    const tb = $('#subsBody');
    tb.innerHTML = '';
    S.subs.forEach((sub, i) => {
      const tierSel = el('select', { onchange: e => { sub.tier = e.target.value; changed(); } });
      tb.append(el('tr', null,
        el('td', null, String(i + 1)),
        el('td', null, statSelect(sub.stat, e => { sub.stat = e.target.value; renderSubs(); renderConds(); changed(); })),
        el('td', null, el('input', {
          type: 'number', step: 'any', min: '0', value: sub.value, placeholder: t('optional'),
          oninput: e => { sub.value = e.target.value; changed(); },
        })),
        el('td', null, el('input', {
          type: 'number', step: '0.1', value: sub.w,
          oninput: e => { sub.w = e.target.value; changed(); },
        })),
        el('td', null, tierSel),
        el('td', { class: 'infer', id: 'inf' + i }),
      ));
      fillTierSelect(tierSel, sub);
    });
  }
  function fillTierSelect(sel, sub) {
    const st = byId[sub.stat];
    sel.innerHTML = '';
    sel.append(el('option', { value: 'auto' }, t('auto')));
    t('tier').forEach((n, ti) =>
      sel.append(el('option', { value: String(ti) }, `${n} ${fmtVal(st, st.tiers[ti])}`)));
    sel.value = String(sub.tier);
  }

  function updateInfer() {
    const subs = S.subs.map(s => ({ stat: s.stat, value: s.value === '' ? null : +s.value }));
    inferRes = RE.infer(subs, S.initCount);
    const tierNames = t('tierShort');
    inferRes.subs.forEach((r, i) => {
      const st = byId[S.subs[i].stat];
      const c = $('#inf' + i);
      if (r.empty) c.textContent = t('inf.empty', { v: fmtVal(st, st.avg) });
      else if (!r.known) { c.innerHTML = `<span class="warn">${t('inf.bad')}</span>`; }
      else {
        c.textContent = t('inf.known', {
          ks: r.ks.join(t('or')), ups: r.ks.map(k => k - 1).join('/'),
          tiers: r.tiers.map(x => tierNames[x]).join('/'), v: fmtVal(st, r.auto),
        });
      }
    });
    const dup = new Set(S.subs.map(s => s.stat)).size < 4;
    const msgs = [];
    if (dup) msgs.push(`<span class="warn">${t('warn.dup')}</span>`);
    if (inferRes.allKnown && !inferRes.ok)
      msgs.push(`<span class="warn">${t('warn.total', { total: inferRes.totalRolls, n: S.initCount })}</span>`);
    $('#inferMsg').innerHTML = msgs.join(' ');
  }

  function initValue(i) {
    const sub = S.subs[i], st = byId[sub.stat];
    if (sub.tier !== 'auto') return st.tiers[+sub.tier];
    return inferRes.subs[i].auto;
  }
  function currentScore() {
    if (S.subs.some(s => s.value === '' || !isFinite(+s.value))) return null;
    return S.subs.reduce((a, s) => a + (+s.w || 0) * (+s.value) / byId[s.stat].avg, 0);
  }

  /* ---------------- 2. 保留條件 ---------------- */
  function renderConds() {
    const box = $('#conds');
    box.innerHTML = '';
    if (S.conds.length === 0) box.append(el('p', { class: 'hint' }, t('conds.none')));
    S.conds.forEach((c, ci) => {
      const row = el('div', { class: 'cond' });
      if (ci > 0) {
        const j = el('select', { class: 'join', onchange: e => { c.join = e.target.value; changed(); } },
          el('option', { value: 'and' }, t('and')), el('option', { value: 'or' }, t('or').trim()));
        j.value = c.join || 'and';
        row.append(j);
      }
      if (c.type === 'hits') {
        row.append(el('span', { class: 'tag' }, t('c.hits')));
        S.subs.forEach((_, i) => {
          row.append(el('label', { class: 'chip' },
            el('input', { type: 'checkbox', checked: !!c.subs[i], onchange: e => { c.subs[i] = e.target.checked; changed(); } }),
            subName(i)));
        });
        row.append(el('span', null, t('c.sum')),
          el('input', { type: 'number', min: '0', max: '5', step: '1', value: c.min,
            oninput: e => { c.min = +e.target.value; changed(); } }), el('span', null, t('c.times')));
      } else if (c.type === 'score') {
        row.append(el('span', { class: 'tag' }, t('c.score')),
          el('input', { type: 'number', step: '0.1', value: c.min, id: 'scoreIn' + ci,
            oninput: e => { c.min = +e.target.value; changed(); } }),
          el('button', { class: 'ghost tiny', title: t('c.fillTitle'), onclick: () => {
            const cs = currentScore();
            if (cs == null) { alert(t('c.fillAlert')); return; }
            c.min = Math.round(cs * 100) / 100; renderConds(); changed();
          } }, t('c.fill')));
      } else if (c.type === 'value') {
        const s = el('select', { onchange: e => { c.sub = +e.target.value; renderConds(); changed(); } });
        S.subs.forEach((_, i) => s.append(el('option', { value: String(i) }, subName(i))));
        s.value = String(c.sub);
        const st = byId[S.subs[c.sub].stat];
        row.append(el('span', { class: 'tag' }, t('c.value')), s, el('span', null, '≥'),
          el('input', { type: 'number', step: 'any', value: c.min, oninput: e => { c.min = +e.target.value; changed(); } }),
          el('span', { class: 'tag' }, st.pct ? '%' : ''));
      }
      row.append(el('span', { class: 'grow' }),
        el('button', { class: 'icon', title: t('delete'), onclick: () => { S.conds.splice(ci, 1); renderConds(); changed(); } }, '×'));
      box.append(row);
    });
  }
  document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.add;
    const c = { type: kind, join: 'and' };
    if (kind === 'hits') { c.subs = [true, true, false, false]; c.min = S.guarantee + 1; }
    if (kind === 'score') { const cs = currentScore(); c.min = cs != null ? Math.round(cs * 100) / 100 : 5; }
    if (kind === 'value') { c.sub = 0; c.min = 0; }
    S.conds.push(c);
    renderConds(); changed();
  }));

  /* ---------------- 計算 ---------------- */
  let timer = null;
  function changed() {
    clearTimeout(timer);
    timer = setTimeout(recompute, 60);
  }
  function recompute() {
    updateInfer();
    const cfg = {
      subs: S.subs.map((s, i) => ({ stat: s.stat, init: initValue(i), w: +s.w || 0 })),
      upgrades: S.initCount === 4 ? 5 : 4,
      guarantee: S.guarantee,
      conds: S.conds,
      includeBaseline: S.baseline,
    };
    const rows = RE.compute(cfg);
    const cs = currentScore();
    const ref = cs != null ? cs : rows[0].initScore;
    for (const r of rows) r.key = r.pair ? r.pair.join('-') : 'base';
    $('#curScore').textContent = cs != null ? cs.toFixed(2) : t('incomplete');
    $('#initScore').textContent = rows[0].initScore.toFixed(2);
    last = { rows, ref, refIsCurrent: cs != null };
    sortRows();
    ui.sels = ui.sels.filter(k => last.rows.find(r => r.key === k));
    for (const k in ui.slots) if (!inSel(k)) delete ui.slots[k];
    if (!ui.sels.length) selectOnly(last.best.key);
    saveState();
    renderResults();
    renderDetail();
  }

  // 依「成功率 × 成功時平均收益」由高到低排序（無保底參考固定放最後）
  function sortRows() {
    if (S.chartMetric !== 'p') S.chartMetric = 'mean';
    for (const r of last.rows) r.ev = r.P > 0 ? r.P * r.meanSucc : 0;
    const main = last.rows.filter(r => r.pair).sort((a, b) => b.ev - a.ev);
    last.rows = main.concat(last.rows.filter(r => !r.pair));
    last.best = main[0];
  }

  /* ---------------- 3. 結果 ---------------- */
  function chartDefaults() {
    Chart.defaults.color = css('--muted');
    Chart.defaults.borderColor = css('--line');
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  }

  function renderResults() {
    const { rows, best } = last;
    const anyP = rows.some(r => r.P > 0);
    $('#bestBox').innerHTML = anyP
      ? t('best', { pair: pairLabel(best.pair), p: pct(best.P), m: f2(best.meanSucc), e: best.ev.toFixed(3) })
      : `<span class="warn">${t('impossible')}</span>`;

    // 表格
    const tbl = $('#resultTable');
    tbl.innerHTML = '';
    tbl.append(el('thead', null, el('tr', null,
      el('th', { class: 'pick', title: t('cmp.title') }, t('cmp.col')),
      el('th', null, t('col.pair')), el('th', { class: 'n' }, t('col.p')), el('th', { class: 'n' }, t('col.tries')),
      el('th', { class: 'n' }, t('col.mean')), el('th', { class: 'n' }, t('col.ev')),
      el('th', { class: 'n' }, t('col.all')), el('th', { class: 'n' }, t('col.trig')))));
    const tb = el('tbody');
    rows.forEach(r => {
      const tr = el('tr', {
        class: [inSel(r.key) ? 'sel' : '', !r.pair ? 'base' : '', r === best && anyP ? 'best' : ''].join(' '),
        onclick: () => { selectOnly(r.key); renderResults(); renderDetail(); },
      },
        el('td', { class: 'pick', onclick: e => e.stopPropagation() }, el('input', {
          type: 'checkbox', checked: inSel(r.key),
          disabled: !inSel(r.key) && ui.sels.length >= MAX_CMP || inSel(r.key) && ui.sels.length === 1,
          title: t('cmp.title'),
          onchange: () => { toggleSel(r.key); renderResults(); renderDetail(); },
        })),
        el('td', null, swatch(r.key), pairLabel(r.pair)),
        el('td', { class: 'n' }, pct(r.P)),
        el('td', { class: 'n' }, r.P > 0 ? (1 / r.P).toFixed(1) : '∞'),
        el('td', { class: 'n' }, f2(r.meanSucc)),
        el('td', { class: 'n' }, r.ev.toFixed(3)),
        el('td', { class: 'n' }, r.meanAll.toFixed(2)),
        el('td', { class: 'n' }, r.pair ? pct(r.pTrig, 1) : '—'));
      tb.append(tr);
    });
    tbl.append(tb);

    // 圖表：一次只顯示一個指標（預設成功時平均收益）
    chartDefaults();
    const accent = css('--accent'), sel = css('--sel'), fail = css('--fail');
    const M = {
      mean: { label: t('m.mean'), get: r => r.meanSucc == null ? null : +r.meanSucc.toFixed(3), fmt: v => v.toFixed(2) },
      p:    { label: t('chart.pPct'), get: r => +(r.P * 100).toFixed(3), fmt: v => v.toFixed(2) + '%' },
    }[S.chartMetric];
    const data = {
      labels: rows.map(r => r.pair ? [subName(r.pair[0]), '+ ' + subName(r.pair[1])] : [t('noGuarantee1'), t('noGuarantee2')]),
      datasets: [{
        type: 'bar', label: M.label,
        data: rows.map(M.get),
        backgroundColor: rows.map(r => isMulti() && inSel(r.key) ? seriesColor(r.key)
          : !r.pair ? fail : inSel(r.key) ? accent : accent + '59'),
        borderColor: rows.map(r => !isMulti() && inSel(r.key) ? sel : 'transparent'),
        borderWidth: 2, borderRadius: 4,
      }],
    };
    const opts = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: S.chartMetric === 'mean' ? meanAxis(data.datasets[0].data, M.label)
                                     : { beginAtZero: true, title: { display: true, text: M.label } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: items => pairLabel(rows[items[0].dataIndex].pair),
          label: ctx => M.label + colon() + (ctx.raw == null ? '—' : M.fmt(ctx.raw)),
        } },
      },
      onClick: (evt, els, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
        if (!pts.length) return;
        // 一般點選＝只看這一組；按住 Ctrl／⌘／Shift 點選＝加入或移出比較
        const k = rows[pts[0].index].key, ne = evt.native;
        if (ne && (ne.ctrlKey || ne.metaKey || ne.shiftKey)) toggleSel(k); else selectOnly(k);
        renderResults(); renderDetail();
      },
    };
    if (charts.main) { charts.main.data = data; charts.main.options = opts; charts.main.update(); }
    else charts.main = new Chart($('#mainChart'), { data, options: opts });
  }

  /* ---------------- 4. 細節 ---------------- */
  // 不小於 x 的「好看」刻度
  function niceStep(x) {
    const e = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  // 不大於 x 的「好看」刻度
  function niceFloor(x) {
    const e = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / e;
    return (f >= 5 ? 5 : f >= 2.5 ? 2.5 : f >= 2 ? 2 : 1) * e;
  }

  // 平均收益的縱軸：從 0 開始時若最低與最高柱相差不到兩格，
  // 就改用放大的刻度，讓最低與最高至少相差兩格。
  function meanAxis(vals, label) {
    const v = vals.filter(x => x != null && isFinite(x));
    const zero = { beginAtZero: true, title: { display: true, text: label } };
    if (v.length < 2) return zero;
    const mn = Math.min(...v), mx = Math.max(...v), range = mx - mn;
    const autoStep = niceStep(Math.max(mx, 1e-6) / 6); // 約等於從 0 開始時的格寬
    if (range >= 2 * autoStep) return zero;
    const step = range > 1e-9 ? niceFloor(range / 2) : niceStep(Math.max(Math.abs(mx), 0.1) * 0.01);
    let min = (Math.floor(mn / step + 1e-9) - 1) * step; // 留一格，最低的柱子才看得到
    if (mn >= 0 && min < 0) min = 0;
    const max = (Math.floor(mx / step + 1e-9) + 1) * step;
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (step / Math.pow(10, Math.floor(Math.log10(step))) === 2.5 ? 1 : 0));
    return {
      min, max,
      ticks: { stepSize: step, callback: x => (+x).toFixed(dec) },
      title: { display: true, text: label + t('axis.notZero') },
    };
  }

  function renderDetail() {
    if (isMulti()) return renderDetailMulti();
    const row = last.rows.find(r => r.key === ui.sels[0]);
    $('#detailTitle').textContent = pairLabel(row.pair);
    const accent = css('--accent'), okC = css('--ok'), okSoft = css('--ok-soft'), fail = css('--fail'), sel = css('--sel');
    const combos = row.combos.slice().sort((a, b) => b.pSucc - a.pSucc || b.p - a.p);
    const ckey = c => c.h.join(',');

    // 命中組合散佈圖
    const succPts = [], failPts = [];
    for (const c of combos) {
      if (c.pSucc > 1e-12) succPts.push({ x: c.meanSucc, y: c.pSucc * 100, c });
      const pf = c.p - c.pSucc;
      if (pf > 1e-12) failPts.push({ x: c.meanFail, y: pf * 100, c });
    }
    const isSel = p => ui.combo && ckey(p.c) === ui.combo;
    const sData = {
      datasets: [
        {
          label: t('ds.ok'), data: succPts,
          backgroundColor: succPts.map(p => isSel(p) ? sel : okSoft),
          borderColor: succPts.map(p => isSel(p) ? sel : okC),
          pointRadius: succPts.map(p => isSel(p) ? 9 : 5), pointHoverRadius: 8,
        },
        {
          label: t('ds.fail'), data: failPts,
          backgroundColor: failPts.map(p => isSel(p) ? sel : fail),
          borderColor: failPts.map(p => isSel(p) ? sel : fail),
          pointRadius: failPts.map(p => isSel(p) ? 8 : 3), pointHoverRadius: 6,
        },
      ],
    };
    const ref = last.ref;
    const sOpts = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      scales: {
        x: { type: 'linear', title: { display: true, text: t('ax.comboMean') } },
        y: { beginAtZero: true, title: { display: true, text: t('ax.prob') } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const p = ctx.raw;
              return [comboLabel(p.c.h), t('tip.combo', { p: p.y.toFixed(3), m: p.x.toFixed(2) })];
            },
          },
        },
        annotationLine: { x: ref },
      },
      onClick: (evt, els) => {
        if (!els.length) return;
        const ds = sData.datasets[els[0].datasetIndex].data[els[0].index];
        ui.combo = ui.combo === ckey(ds.c) ? null : ckey(ds.c);
        renderDetail();
      },
    };
    if (charts.combo) { charts.combo.data = sData; charts.combo.options = sOpts; charts.combo.update(); }
    else charts.combo = new Chart($('#comboChart'), { type: 'scatter', data: sData, options: sOpts, plugins: [refLinePlugin] });

    // 達標時的收益分佈：只看達標結果，機率總和為 100%（＝已經成功時的分佈）
    const selC = ui.combo ? row.combos.find(x => ckey(x) === ui.combo) : null;
    const selOk = selC && selC.pSucc > 1e-12;
    let lo = Infinity, hi = -Infinity;
    for (const c of row.combos) for (const [s, , ok] of c.pts) if (ok) { if (s < lo) lo = s; if (s > hi) hi = s; }
    if (!(row.P > 0)) { lo = 0; hi = 1; }
    const step = niceStep(Math.max(hi - lo, 0.1) / 28);
    const start = Math.floor(lo / step + 1e-9) * step;
    const nb = Math.max(1, Math.floor((hi - start) / step + 1e-9) + 1);
    const allB = new Array(nb).fill(0), selB = new Array(nb).fill(0);
    for (const c of row.combos) {
      const isS = selOk && c === selC;
      for (const [s, q, ok] of c.pts) {
        if (!ok) continue;
        const b = Math.min(nb - 1, Math.max(0, Math.floor((s - start) / step + 1e-9)));
        allB[b] += q / row.P * 100;
        if (isS) selB[b] += q / selC.pSucc * 100;
      }
    }
    const labels = allB.map((_, i) => (start + i * step).toFixed(step < 0.1 ? 2 : 1));
    let hDatasets;
    if (selOk) {
      hDatasets = [
        { type: 'bar', label: t('ds.sel'), data: selB, backgroundColor: sel, order: 2 },
        { type: 'line', label: t('ds.all'), data: allB, borderColor: okC, backgroundColor: okC,
          borderDash: [5, 4], stepped: 'middle', pointRadius: 0, borderWidth: 2, order: 1 },
      ];
      $('#histHint').innerHTML = t('hist.sel', { c: comboLabel(selC.h) });
    } else {
      hDatasets = [{ type: 'bar', label: t('ds.succ'), data: allB, backgroundColor: okC }];
      $('#histHint').innerHTML = row.P > 0
        ? (selC ? `<span class="warn">${t('hist.selNone')}</span>${t('hist.selNone2')} ` : '') + t('hist.all', { s: step })
        : `<span class="warn">${t('hist.never')}</span>`;
    }
    const hData = { labels, datasets: hDatasets };
    const hOpts = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      scales: {
        x: { title: { display: true, text: t('ax.score') } },
        y: { beginAtZero: true, title: { display: true, text: t('ax.succProb') } },
      },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label} ${(+ctx.raw).toFixed(3)}%` } } },
    };
    if (charts.hist) { charts.hist.data = hData; charts.hist.options = hOpts; charts.hist.update(); }
    else charts.hist = new Chart($('#histChart'), { data: hData, options: hOpts });

    // 組合表
    const tbl = $('#comboTable');
    tbl.innerHTML = '';
    tbl.append(el('thead', null, el('tr', null,
      el('th', null, t('cc.combo')), el('th', { class: 'n' }, t('cc.p')), el('th', { class: 'n' }, t('cc.ok')),
      el('th', { class: 'n' }, t('cc.mean')), el('th', { class: 'n' }, t('cc.share')), el('th', { class: 'n' }, t('cc.trig')))));
    const tb = el('tbody');
    const list = combos.filter(c => ui.showFail || c.pSucc > 1e-12);
    if (!list.length) tb.append(el('tr', null, el('td', { colspan: '6' }, t('cc.none'))));
    for (const c of list) {
      const k = ckey(c);
      tb.append(el('tr', {
        class: (k === ui.combo ? 'sel ' : '') + (c.pSucc > 1e-12 ? '' : 'fail'),
        onclick: () => { ui.combo = ui.combo === k ? null : k; renderDetail(); },
      },
        el('td', null, comboLabel(c.h)),
        el('td', { class: 'n' }, pct(c.p, 3)),
        el('td', { class: 'n' }, c.p > 0 ? pct(c.pSucc / c.p, 1) : '—'),
        el('td', { class: 'n' }, f2(c.meanSucc)),
        el('td', { class: 'n' }, row.P > 0 ? pct(c.pSucc / row.P, 1) : '—'),
        el('td', { class: 'n' }, c.p > 0 ? pct(c.pTrig / c.p, 0) : '—')));
    }
    tbl.append(tb);
  }

  /* ---------------- 4b. 多選比較 ---------------- */
  // 同時比較 2～3 種選法：散佈圖、分數分佈、組合表都疊在一起，顏色跟著選法走
  function renderDetailMulti() {
    const rows = ui.sels.map(k => last.rows.find(r => r.key === k));
    $('#detailTitle').textContent = rows.map(r => pairLabel(r.pair)).join(t('vs'));
    chartDefaults();
    const selC = css('--sel');
    const ckey = (r, c) => r.key + '|' + c.h.join(',');
    const isS = p => ui.combo === ckey(p.r, p.c);

    // 命中組合散佈圖：每種選法一組點，顏色＋點的形狀區分
    const datasets = [];
    for (const r of rows) {
      const col = seriesColor(r.key), shape = SHAPES[ui.slots[r.key] || 0];
      const ok = [], bad = [];
      for (const c of r.combos) {
        if (c.pSucc > 1e-12) ok.push({ x: c.meanSucc, y: c.pSucc * 100, c, r });
        const pf = c.p - c.pSucc;
        if (ui.showFail && pf > 1e-12) bad.push({ x: c.meanFail, y: pf * 100, c, r });
      }
      datasets.push({
        label: pairLabel(r.pair), data: ok, pointStyle: shape,
        backgroundColor: ok.map(p => isS(p) ? selC : col + '99'),
        borderColor: ok.map(p => isS(p) ? selC : col),
        pointRadius: ok.map(p => isS(p) ? 9 : 5), pointHoverRadius: 8,
      });
      if (bad.length) datasets.push({
        label: pairLabel(r.pair) + ' · ' + t('ds.fail'), data: bad, pointStyle: shape,
        backgroundColor: 'transparent',
        borderColor: bad.map(p => isS(p) ? selC : col + '88'),
        pointRadius: bad.map(p => isS(p) ? 8 : 3), pointHoverRadius: 6,
      });
    }
    const sData = { datasets };
    const sOpts = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      scales: {
        x: { type: 'linear', title: { display: true, text: t('ax.comboMean') } },
        y: { beginAtZero: true, title: { display: true, text: t('ax.prob') } },
      },
      plugins: {
        legend: { display: true, labels: { usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => {
          const p = ctx.raw;
          return [pairLabel(p.r.pair), comboLabel(p.c.h), t('tip.combo', { p: p.y.toFixed(3), m: p.x.toFixed(2) })];
        } } },
        annotationLine: { x: last.ref },
      },
      onClick: (evt, els) => {
        if (!els.length) return;
        const p = sData.datasets[els[0].datasetIndex].data[els[0].index];
        const k = ckey(p.r, p.c);
        ui.combo = ui.combo === k ? null : k;
        renderDetail();
      },
    };
    if (charts.combo) { charts.combo.data = sData; charts.combo.options = sOpts; charts.combo.update(); }
    else charts.combo = new Chart($('#comboChart'), { type: 'scatter', data: sData, options: sOpts, plugins: [refLinePlugin] });

    // 達標時收益分佈：每種選法各自總和 100%，用同一組格子
    let lo = Infinity, hi = -Infinity;
    for (const r of rows) for (const c of r.combos) for (const [sc, , ok] of c.pts) if (ok) { if (sc < lo) lo = sc; if (sc > hi) hi = sc; }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const step = niceStep(Math.max(hi - lo, 0.1) / 28);
    const start = Math.floor(lo / step + 1e-9) * step;
    const nb = Math.max(1, Math.floor((hi - start) / step + 1e-9) + 1);
    const never = [];
    const hDatasets = [];
    for (const r of rows) {
      if (!(r.P > 0)) { never.push(pairLabel(r.pair)); continue; }
      const B = new Array(nb).fill(0);
      for (const c of r.combos) for (const [sc, q, ok] of c.pts) {
        if (!ok) continue;
        B[Math.min(nb - 1, Math.max(0, Math.floor((sc - start) / step + 1e-9)))] += q / r.P * 100;
      }
      const col = seriesColor(r.key);
      hDatasets.push({ type: 'line', label: pairLabel(r.pair), data: B, borderColor: col, backgroundColor: col,
        stepped: 'middle', pointRadius: 0, borderWidth: 2, fill: false });
    }
    $('#histHint').innerHTML = t('hist.multi', { s: step }) +
      (never.length ? ` <span class="warn">${t('hist.multiNever', { p: never.join(I18N.lang === 'en' ? ', ' : '、') })}</span>` : '');
    const hData = { labels: Array.from({ length: nb }, (_, i) => (start + i * step).toFixed(step < 0.1 ? 2 : 1)), datasets: hDatasets };
    const hOpts = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { title: { display: true, text: t('ax.score') } },
        y: { beginAtZero: true, title: { display: true, text: t('ax.succProb') } },
      },
      plugins: {
        legend: { display: true },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label} ${(+ctx.raw).toFixed(3)}%` } },
      },
    };
    if (charts.hist) { charts.hist.data = hData; charts.hist.options = hOpts; charts.hist.update(); }
    else charts.hist = new Chart($('#histChart'), { data: hData, options: hOpts });

    // 組合表：多一欄「選法」
    const tbl = $('#comboTable');
    tbl.innerHTML = '';
    tbl.append(el('thead', null, el('tr', null,
      el('th', null, t('cc.pair')), el('th', null, t('cc.combo')), el('th', { class: 'n' }, t('cc.p')),
      el('th', { class: 'n' }, t('cc.ok')), el('th', { class: 'n' }, t('cc.mean')),
      el('th', { class: 'n' }, t('cc.share')), el('th', { class: 'n' }, t('cc.trig')))));
    const tb = el('tbody');
    let n = 0;
    for (const r of rows) {
      const list = r.combos.slice().sort((a, b) => b.pSucc - a.pSucc || b.p - a.p)
        .filter(c => ui.showFail || c.pSucc > 1e-12);
      for (const c of list) {
        const k = ckey(r, c);
        n++;
        tb.append(el('tr', {
          class: (k === ui.combo ? 'sel ' : '') + (c.pSucc > 1e-12 ? '' : 'fail'),
          onclick: () => { ui.combo = ui.combo === k ? null : k; renderDetail(); },
        },
          el('td', null, swatch(r.key), pairLabel(r.pair)),
          el('td', null, comboLabel(c.h)),
          el('td', { class: 'n' }, pct(c.p, 3)),
          el('td', { class: 'n' }, c.p > 0 ? pct(c.pSucc / c.p, 1) : '—'),
          el('td', { class: 'n' }, f2(c.meanSucc)),
          el('td', { class: 'n' }, r.P > 0 ? pct(c.pSucc / r.P, 1) : '—'),
          el('td', { class: 'n' }, c.p > 0 ? pct(c.pTrig / c.p, 0) : '—')));
      }
    }
    if (!n) tb.append(el('tr', null, el('td', { colspan: '7' }, t('cc.none'))));
    tbl.append(tb);
  }

  // 在散佈圖上畫一條「目前收益」的參考線
  const refLinePlugin = {
    id: 'annotationLine',
    afterDatasetsDraw(chart, args, opt) {
      if (opt == null || opt.x == null) return;
      const xs = chart.scales.x;
      const x = xs.getPixelForValue(opt.x);
      if (x < chart.chartArea.left || x > chart.chartArea.right) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = css('--accent');
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x, chart.chartArea.top); ctx.lineTo(x, chart.chartArea.bottom); ctx.stroke();
      ctx.fillStyle = css('--accent');
      ctx.font = '12px ' + Chart.defaults.font.family;
      ctx.fillText(last.refIsCurrent ? t('ref.cur') : t('ref.init'), x + 4, chart.chartArea.top + 12);
      ctx.restore();
    },
  };

  /* ---------------- 匯出 / 匯入 ---------------- */
  function stamp() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function ioMsg(msg, warn) {
    const m = $('#ioMsg');
    m.innerHTML = warn ? `<span class="warn">${msg}</span>` : msg;
    clearTimeout(ioMsg.t); ioMsg.t = setTimeout(() => { m.textContent = ''; }, 6000);
  }
  const r6 = x => x == null ? null : Math.round(x * 1e6) / 1e6;
  const pairStats = pair => pair ? pair.map(i => S.subs[i].stat) : null;

  function exportJSON() {
    const data = {
      app: 'artifact-reshape-simulator', version: 1, exportedAt: new Date().toISOString(),
      settings: clone(S),
      summary: {
        currentScore: r6(currentScore()),
        initialScore: r6(last.rows[0].initScore),
        initialValues: S.subs.map((_, i) => r6(initValue(i))),
      },
      results: last.rows.map(r => ({
        pair: pairStats(r.pair), label: pairLabel(r.pair),
        successRate: r6(r.P), meanGainOnSuccess: r6(r.meanSucc), product: r6(r.ev),
        overallMeanGain: r6(r.meanAll), guaranteeTriggerRate: r.pair ? r6(r.pTrig) : null,
        combos: r.combos.slice().sort((a, b) => b.pSucc - a.pSucc || b.p - a.p).map(c => ({
          hits: c.h, label: comboLabel(c.h), prob: r6(c.p), successProb: r6(c.pSucc),
          meanGainOnSuccess: r6(c.meanSucc), fromGuarantee: r6(c.pTrig),
        })),
      })),
    };
    download(`${t('file.json')}_${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
    ioMsg(t('io.json'));
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        const s = d && d.settings ? d.settings : d; // 也接受只有設定的檔案
        if (!s || !Array.isArray(s.subs) || s.subs.length !== 4 || s.subs.some(x => !byId[x.stat]))
          throw new Error(t('io.invalid'));
        const conds = Array.isArray(s.conds) ? s.conds.filter(c => ['hits', 'score', 'value'].includes(c.type)) : [];
        S = Object.assign(clone(DEFAULT), s, { conds });
        S.initCount = S.initCount === 3 ? 3 : 4;
        S.guarantee = [2, 3, 4].includes(+S.guarantee) ? +S.guarantee : 3;
        delete S.sortBy;
        ui.sels = []; ui.slots = {}; ui.combo = null;
        $('#chartMetric').value = S.chartMetric === 'p' ? 'p' : 'mean';
        $('#baseline').checked = !!S.baseline;
        renderSubs(); renderConds(); recompute();
        ioMsg(t('io.imported', { f: file.name }));
      } catch (e) {
        ioMsg(t('io.fail') + e.message, true);
      }
    };
    reader.readAsText(file);
  }

  function csvText(rows) {
    const q = v => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'); // BOM 讓 Excel 正確顯示中文
  }
  function exportCsv() {
    const rows = [['col.pair', 'col.p', 'col.tries', 'col.mean', 'col.ev', 'col.all', 'col.trig'].map(k => t(k))];
    for (const r of last.rows) rows.push([
      pairLabel(r.pair), r6(r.P), r.P > 0 ? r6(1 / r.P) : '', r6(r.meanSucc), r6(r.ev), r6(r.meanAll),
      r.pair ? r6(r.pTrig) : '',
    ]);
    download(`${t('file.csv')}_${stamp()}.csv`, csvText(rows), 'text/csv');
    ioMsg(t('io.csv'));
  }
  function exportComboCsv() {
    const sels = ui.sels.map(k => last.rows.find(r => r.key === k));
    const rows = [[t('col.pair'), t('cc.combo'), ...S.subs.map((_, i) => t('csv.hits', { s: subName(i) })), t('cc.p'), t('csv.okProb'), t('cc.mean'), t('cc.trig')]];
    for (const row of sels) {
      const list = row.combos.slice().sort((a, b) => b.pSucc - a.pSucc || b.p - a.p)
        .filter(c => ui.showFail || c.pSucc > 1e-12);
      for (const c of list) rows.push([
        pairLabel(row.pair), comboLabel(c.h), ...c.h, r6(c.p), r6(c.pSucc), r6(c.meanSucc), c.p > 0 ? r6(c.pTrig / c.p) : '',
      ]);
    }
    download(`${t('file.combo')}_${stamp()}.csv`, csvText(rows), 'text/csv');
  }

  /* ---------------- 綁定 ---------------- */
  $('#btnExport').addEventListener('click', exportJSON);
  $('#btnCsv').addEventListener('click', exportCsv);
  $('#btnComboCsv').addEventListener('click', exportComboCsv);
  $('#fileImport').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importJSON(f);
    e.target.value = '';
  });
  $('#initCount').addEventListener('change', e => { S.initCount = +e.target.value; changed(); });
  $('#guarantee').addEventListener('change', e => { S.guarantee = +e.target.value; changed(); });
  $('#baseline').addEventListener('change', e => { S.baseline = e.target.checked; changed(); });
  $('#chartMetric').addEventListener('change', e => {
    S.chartMetric = e.target.value;
    sortRows(); saveState(); renderResults();
  });
  $('#showFail').addEventListener('change', e => { ui.showFail = e.target.checked; renderDetail(); });
  // 語言切換：重畫所有動態文字（設定與計算結果不變）
  const langSel = $('#langSel');
  for (const l of I18N.LANGS) langSel.append(el('option', { value: l.id }, l.name));
  langSel.value = I18N.lang;
  langSel.addEventListener('change', e => {
    I18N.setLang(e.target.value);
    renderSubs(); renderConds(); updateInfer();
    const cs = currentScore();
    $('#curScore').textContent = cs != null ? cs.toFixed(2) : t('incomplete');
    renderResults(); renderDetail();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (last) { renderResults(); renderDetail(); } });

  if (S.chartMetric !== 'p') S.chartMetric = 'mean';
  delete S.sortBy;
  $('#chartMetric').value = S.chartMetric;
  $('#baseline').checked = !!S.baseline;
  renderSubs();
  renderConds();
  recompute();
})();
