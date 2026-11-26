# 產生 i18n.js：繁中與英文手寫，簡中由繁中經 OpenCC (tw2sp) 轉換，並套用陸服遊戲用語
import json, sys, opencc

HANT = {
  # ---- 頁面 ----
  'title': '聖遺物重塑模擬器',
  'desc': '原神啟聖之塵重塑：精確計算每種保底選法的成功率與期望收益',
  'lede': '啟聖之塵：選兩個詞條、保底命中次數。工具會窮舉所有強化結果與成長檔位，精確算出每種選法的成功率與收益（不是隨機模擬）。',
  'lang': '語言',
  'btnExport': '匯出設定與結果（JSON）',
  'btnImport': '匯入 JSON',
  'btnCsv': '匯出比較表（CSV）',
  'sec1': '聖遺物',
  'initCount': '初始詞條數',
  'init4': '4 詞條（重塑 5 次強化）',
  'init3': '3 詞條（重塑 4 次強化）',
  'guarantee': '保底命中次數',
  'times': '{n} 次',
  'th.sub': '詞條', 'th.value': '目前數值', 'th.w': '收益比例', 'th.init': '初始值', 'th.infer': '推算',
  'hint.score': '收益 = Σ 比例 × 數值 ÷ 該詞條的平均單次值。比例 1 的詞條每命中一次平均 +1 分。「初始值」是重塑後保留的數值，選「自動」會從目前數值推算；沒填目前數值就用平均值。',
  'curScore': '目前收益：', 'initScore': '重塑後初始收益：',
  'sec2': '保留條件（最差可接受）',
  'add.hits': '＋ 命中次數', 'add.score': '＋ 收益總和', 'add.value': '＋ 詞條數值',
  'hint.conds': '「且」優先於「或」：A 且 B 或 C ＝ (A 且 B) 或 C。命中次數只算重塑的強化命中，不含初始值。沒有條件時全部保留。',
  'sec3': '各選法比較',
  'show': '顯示',
  'm.mean': '成功時平均收益', 'm.p': '成功率',
  'baseline': '顯示無保底參考',
  'hint.sort': '依「成功率 × 成功時平均收益」由高到低排序。點選表格列或圖表柱可查看細節。',
  'sec4': '組合細節：',
  'h.combo': '命中組合分佈',
  'hint.combo': '每點是一種強化命中組合（保底調整後）。橫軸為該組合的平均收益，縱軸為機率。點選可查看分數分佈。',
  'h.hist': '達標時收益分佈',
  'hint.hist0': '含成長檔位隨機的精確分佈。',
  'showFail': '也列出未達標的組合',
  'btnComboCsv': '匯出組合表（CSV）',
  'footer': '模型假設：每次強化等機率落在四詞條之一，每次數值等機率為第七～第十檔；保底在結果確定後調整，從未選中詞條隨機搬移命中到選中詞條（各 1/2）。',
  # ---- 詞條 ----
  'stat.hp': '生命值', 'stat.atk': '攻擊力', 'stat.def': '防禦力', 'stat.em': '元素精通',
  'stat.hpp': '生命值%', 'stat.atkp': '攻擊力%', 'stat.defp': '防禦力%', 'stat.er': '元素充能效率',
  'stat.cr': '爆擊率', 'stat.cd': '爆擊傷害',
  # ---- 動態文字 ----
  'noGuarantee': '無保底（參考）', 'noGuarantee1': '無保底', 'noGuarantee2': '（參考）',
  'none': '（無）', 'optional': '可留空', 'auto': '自動',
  'tier': ['第七檔', '第八檔', '第九檔', '第十檔'],
  'tierShort': ['七', '八', '九', '十'],
  'inf.empty': '未填，初始值以平均 {v} 計',
  'inf.bad': '此數值無法由單次值組成，請檢查',
  'inf.known': '共 {ks} 次（初始+{ups}），初始可能為{tiers}檔，自動取 {v}',
  'or': ' 或 ',
  'warn.dup': '四個詞條類型重複了。',
  'warn.total': '四個數值的命中次數合計對不上 {total} 次（{n} 詞條聖遺物），請檢查數值或初始詞條數。',
  'incomplete': '—（未填完）',
  'conds.none': '沒有條件：所有結果都會保留。',
  'and': '且',
  'c.hits': '強化命中', 'c.sum': '合計 ≥', 'c.times': '次',
  'c.score': '收益總和 ≥', 'c.fillTitle': '填入目前收益', 'c.fill': '＝目前收益',
  'c.fillAlert': '請先填完四個詞條的目前數值',
  'c.value': '詞條數值', 'delete': '刪除',
  'best': '最佳選法（成功率 × 平均收益最高）：<b>{pair}</b>　成功率 {p}，成功時平均收益 {m}，乘積 {e}',
  'impossible': '在目前條件下，任何選法都不可能達成保留條件。',
  'col.pair': '保底選擇', 'col.p': '成功率', 'col.tries': '平均嘗試次數', 'col.mean': '成功時平均收益',
  'col.ev': '成功率 × 平均收益', 'col.all': '整體平均收益', 'col.trig': '保底觸發率',
  'axis.notZero': '（未從 0 開始）',
  'chart.pPct': '成功率 (%)',
  'ds.ok': '達標', 'ds.fail': '未達標',
  'ax.comboMean': '該組合平均收益', 'ax.prob': '機率 (%)',
  'tip.combo': '機率 {p}%　平均收益 {m}',
  'ds.sel': '選中組合', 'ds.all': '此選法整體', 'ds.succ': '達標時',
  'hist.sel': '選中：<b>{c}</b>，長條是它達標時的分數分佈（總和 100%），虛線是此選法整體。再點一次取消。',
  'hist.selNone': '選中的組合沒有任何達標結果，',
  'hist.selNone2': '顯示此選法整體。',
  'hist.all': '已經成功（達標）時的分數分佈，總和 100%，每格寬 {s}。點選左圖或下表的組合可單獨查看。',
  'hist.never': '此選法不可能達標。',
  'ax.score': '收益分數（格的下界）', 'ax.succProb': '達標時機率 (%)',
  'cc.combo': '強化命中組合（保底後）', 'cc.p': '組合機率', 'cc.ok': '其中達標', 'cc.mean': '達標時平均收益',
  'cc.share': '佔全部成功', 'cc.trig': '來自保底調整', 'cc.none': '沒有任何達標組合。',
  'ref.cur': '目前收益', 'ref.init': '初始收益',
  'io.json': '已匯出 JSON。', 'io.csv': '已匯出比較表 CSV。',
  'io.imported': '已匯入「{f}」，結果已重新計算。', 'io.fail': '匯入失敗：', 'io.invalid': '找不到有效的四個詞條設定',
  'csv.hits': '{s}命中', 'csv.okProb': '其中達標機率',
  'file.json': '重塑模擬', 'file.csv': '重塑比較表', 'file.combo': '重塑組合表',
  # ---- 多選比較 ----
  'cmp.col': '比較', 'cmp.title': '勾選以加入比較（最多 3 組）',
  'hint.multi': '勾選「比較」欄可同時比較最多 3 種選法，組合細節會疊在同一張圖上；也可以按住 Ctrl／⌘ 點圖表柱加入或移除。',
  'hist.multi': '各選法已經成功（達標）時的分數分佈，各自總和 100%，每格寬 {s}。',
  'hist.multiNever': '{p} 不可能達標，未畫出。',
  'cc.pair': '選法', 'vs': ' vs ',
}

EN = {
  'title': 'Artifact Reshape Simulator',
  'desc': 'Genshin Impact Sanctifying Elixir reshape: exact success rate and expected gain for every guarantee choice',
  'lede': 'Sanctifying Elixir: pick two substats and a guaranteed hit count. This tool enumerates every upgrade outcome and roll tier to compute the exact success rate and gain of each choice (no random simulation).',
  'lang': 'Language',
  'btnExport': 'Export settings & results (JSON)',
  'btnImport': 'Import JSON',
  'btnCsv': 'Export comparison (CSV)',
  'sec1': 'Artifact',
  'initCount': 'Initial substats',
  'init4': '4 substats (5 upgrades on reshape)',
  'init3': '3 substats (4 upgrades on reshape)',
  'guarantee': 'Guaranteed hits',
  'times': '{n}',
  'th.sub': 'Substat', 'th.value': 'Current value', 'th.w': 'Weight', 'th.init': 'Initial value', 'th.infer': 'Inferred',
  'hint.score': 'Score = Σ weight × value ÷ that substat\'s average roll. A weight-1 substat gains +1 on average per hit. "Initial value" is the value kept after reshaping; "Auto" infers it from the current value, or uses the average if the current value is empty.',
  'curScore': 'Current score: ', 'initScore': 'Initial score after reshape: ',
  'sec2': 'Keep conditions (worst acceptable)',
  'add.hits': '+ Hit count', 'add.score': '+ Total score', 'add.value': '+ Substat value',
  'hint.conds': 'AND binds tighter than OR: A AND B OR C = (A AND B) OR C. Hit counts include only reshape upgrades, not initial values. With no conditions, everything is kept.',
  'sec3': 'Compare choices',
  'show': 'Show',
  'm.mean': 'Mean gain on success', 'm.p': 'Success rate',
  'baseline': 'Show no-guarantee reference',
  'hint.sort': 'Sorted by success rate × mean gain on success, highest first. Click a table row or bar for details.',
  'sec4': 'Combination details: ',
  'h.combo': 'Hit combinations',
  'hint.combo': 'Each point is one upgrade hit combination (after guarantee). X: mean score of that combination; Y: probability. Click to see its score distribution.',
  'h.hist': 'Score distribution on success',
  'hint.hist0': 'Exact distribution including random roll tiers.',
  'showFail': 'Also list combinations that fail',
  'btnComboCsv': 'Export combinations (CSV)',
  'footer': 'Model: each upgrade lands on one of the four substats with equal chance, and each roll is tier 7–10 with equal chance. The guarantee applies after the result: hits are moved at random from unchosen substats to the chosen ones (1/2 each).',
  'stat.hp': 'HP', 'stat.atk': 'ATK', 'stat.def': 'DEF', 'stat.em': 'Elemental Mastery',
  'stat.hpp': 'HP%', 'stat.atkp': 'ATK%', 'stat.defp': 'DEF%', 'stat.er': 'Energy Recharge',
  'stat.cr': 'CRIT Rate', 'stat.cd': 'CRIT DMG',
  'noGuarantee': 'No guarantee (reference)', 'noGuarantee1': 'No guarantee', 'noGuarantee2': '(reference)',
  'none': '(none)', 'optional': 'optional', 'auto': 'Auto',
  'tier': ['Tier 7', 'Tier 8', 'Tier 9', 'Tier 10'],
  'tierShort': ['7', '8', '9', '10'],
  'inf.empty': 'Empty: initial value uses the average {v}',
  'inf.bad': 'This value can\'t be made from single rolls; please check',
  'inf.known': '{ks} rolls (initial + {ups}); initial tier could be {tiers}; auto uses {v}',
  'or': ' or ',
  'warn.dup': 'Two substats have the same type.',
  'warn.total': 'The four values don\'t add up to {total} rolls (a {n}-substat artifact). Check the values or the initial substat count.',
  'incomplete': '— (incomplete)',
  'conds.none': 'No conditions: every result is kept.',
  'and': 'AND',
  'c.hits': 'Upgrade hits', 'c.sum': 'total ≥', 'c.times': '',
  'c.score': 'Total score ≥', 'c.fillTitle': 'Fill in the current score', 'c.fill': '= current',
  'c.fillAlert': 'Please fill in all four current values first',
  'c.value': 'Substat value', 'delete': 'Delete',
  'best': 'Best choice (highest success rate × mean gain): <b>{pair}</b>  success rate {p}, mean gain on success {m}, product {e}',
  'impossible': 'Under the current conditions, no choice can meet the keep conditions.',
  'col.pair': 'Guarantee', 'col.p': 'Success rate', 'col.tries': 'Avg. attempts', 'col.mean': 'Mean gain on success',
  'col.ev': 'Success rate × mean gain', 'col.all': 'Overall mean gain', 'col.trig': 'Guarantee triggered',
  'axis.notZero': ' (not from 0)',
  'chart.pPct': 'Success rate (%)',
  'ds.ok': 'Success', 'ds.fail': 'Fail',
  'ax.comboMean': 'Mean score of combination', 'ax.prob': 'Probability (%)',
  'tip.combo': 'Probability {p}%  mean score {m}',
  'ds.sel': 'Selected combination', 'ds.all': 'This choice overall', 'ds.succ': 'On success',
  'hist.sel': 'Selected: <b>{c}</b>. Bars show its score distribution on success (sums to 100%); the dashed line is this choice overall. Click again to clear.',
  'hist.selNone': 'The selected combination never succeeds; ',
  'hist.selNone2': 'showing this choice overall.',
  'hist.all': 'Score distribution given success (sums to 100%), bin width {s}. Click a combination on the left or in the table below to view it alone.',
  'hist.never': 'This choice can never succeed.',
  'ax.score': 'Score (bin lower bound)', 'ax.succProb': 'Probability on success (%)',
  'cc.combo': 'Upgrade hits (after guarantee)', 'cc.p': 'Probability', 'cc.ok': 'Of which success', 'cc.mean': 'Mean gain on success',
  'cc.share': 'Share of all successes', 'cc.trig': 'From guarantee', 'cc.none': 'No successful combinations.',
  'ref.cur': 'Current score', 'ref.init': 'Initial score',
  'io.json': 'Exported JSON.', 'io.csv': 'Exported comparison CSV.',
  'io.imported': 'Imported "{f}"; results recalculated.', 'io.fail': 'Import failed: ', 'io.invalid': 'No valid set of four substats found',
  'csv.hits': '{s} hits', 'csv.okProb': 'Success probability',
  'file.json': 'reshape-sim', 'file.csv': 'reshape-compare', 'file.combo': 'reshape-combos',
  'cmp.col': 'Compare', 'cmp.title': 'Check to compare (up to 3)',
  'hint.multi': 'Check the Compare column to compare up to 3 choices; the details below overlay them on the same charts. You can also Ctrl/⌘-click a bar to add or remove it.',
  'hist.multi': 'Score distribution given success for each choice (each sums to 100%), bin width {s}.',
  'hist.multiNever': '{p} can never succeed and is not shown.',
  'cc.pair': 'Choice', 'vs': ' vs ',
}

assert set(HANT) == set(EN), set(HANT) ^ set(EN)

cc = opencc.OpenCC('tw2sp')
def to_hans(v):
    if isinstance(v, list):
        return [to_hans(x) for x in v]
    s = cc.convert(v).replace('爆击', '暴击').replace('「', '“').replace('」', '”')
    return s
HANS = {k: to_hans(v) for k, v in HANT.items()}

js = """// 介面文字（簡中／繁中／英文）。由 gen_i18n.py 產生：簡中是繁中經 OpenCC 轉換後套用陸服遊戲用語。
(function () {
  'use strict';
  const DICT = %s;
  const LANGS = [
    { id: 'zh-Hans', name: '简体中文' },
    { id: 'zh-Hant', name: '繁體中文' },
    { id: 'en', name: 'English' },
  ];
  let lang = 'zh-Hans';
  try {
    const saved = localStorage.getItem('reshape-lang');
    if (saved && DICT[saved]) lang = saved;
  } catch (e) { /* 忽略 */ }

  // t('key', {n: 2})：取目前語言的文字並代入 {n}
  function t(key, vars) {
    let s = DICT[lang][key];
    if (s == null) s = DICT['zh-Hant'][key];
    if (s == null) return key;
    if (vars && typeof s === 'string') s = s.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  }
  // 套用到有 data-i18n / data-i18n-title 的靜態元素
  function apply(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(e => {
      const k = e.getAttribute('data-i18n');
      const n = e.getAttribute('data-n');
      e.textContent = t(k, n != null ? { n } : null);
    });
    document.documentElement.lang = lang;
    document.title = t('title');
    const d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', t('desc'));
  }
  function setLang(l) {
    if (!DICT[l]) return;
    lang = l;
    try { localStorage.setItem('reshape-lang', l); } catch (e) { /* 忽略 */ }
    apply();
  }
  window.I18N = { t, apply, setLang, get lang() { return lang; }, LANGS };
})();
""" % json.dumps({'zh-Hans': HANS, 'zh-Hant': HANT, 'en': EN}, ensure_ascii=False, indent=2)

open(sys.argv[1], 'w', encoding='utf-8').write(js)
print('ok', len(HANT), 'keys')
