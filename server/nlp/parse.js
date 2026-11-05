// 自然语言提问解析（A29）：关键词规则，识别船型、物料、货量、航线、到港截止日。
// 只解析、不生成任何预测数值；数值全部由规则引擎计算（锁定规则 10、11：不做开放问答）。
import { dn } from '../lib/dates.js';

const DAY = 86400000;
const CN = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const cn2n = (s) => {
  if (/^[\d.]+$/.test(s)) return parseFloat(s);
  if (s === '十') return 10;
  const m = s.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0);
  return s.length === 1 && CN[s] !== undefined ? CN[s] : NaN;
};
const KW = {
  '大宗采购船': ['大宗', '矿', '煤', '焦', '石灰石', '灰石', '精粉', '粉矿', '块矿', '喷吹', '废钢', '生铁', '铁皮', '原料', '燃料', '辅料', '采购', '散货', '塔精', '巴混', '凌美'],
  '成品销售船': ['成品', '线材', '热卷', '方坯', '板坯', '钢卷', '出口', '销售', '装船', '外贸', '发货', '客户', '螺纹'],
  '物资备件船': ['备件', '物资', '设备', '配件', '备品', '工程', '杂货'],
};
const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {object} ctx
 *   today: 'YYYY-MM-DD'
 *   ports: [{ en, cn, alias?[], isLocal }]
 *   items: 库存物料项 [{ name, type, ... }]（品名词表从库存表动态读取）
 *   horizonDays: 只看未来多少天，默认 60
 */
export function createParser(ctx) {
  const T = dn(ctx.today), HORIZON = T + (ctx.horizonDays ?? 60);
  const [TY, TM] = ctx.today.split('-').map(Number);
  const LOCAL = (ctx.ports.find((p) => p.isLocal) || { en: 'BAHODOPI' }).en;
  const items = ctx.items || [];

  // 月日 → 日序号。月份早于当前月份的算明年（跨年；原型曾写死年份，已改为相对今天）
  const yearOf = (m) => (m < TM ? TY + 1 : TY);
  const dnOf = (m, d) => dn(yearOf(m) + '-' + pad(m) + '-' + pad(d));
  const monthEnd = (m) => Math.round(Date.UTC(yearOf(m), m, 0) / DAY);

  // 物料：优先按品名匹配（取最长命中，避免「焦煤」截胡「1/3焦煤」）；只说了类型（铁矿 / 焦煤）时用该类型的「总库存」
  function detectItem(t) {
    const hit = items.filter((i) => t.includes(i.name.replace('总库存', '')) && !i.name.endsWith('总库存')).sort((a, b) => b.name.length - a.name.length);
    if (hit.length) return { item: hit[0], alt: [] };
    const alts = items.filter((i) => !i.name.endsWith('总库存') && ['石灰石', '精粉', '喷吹煤', '气煤', '主焦煤', '块'].some((k) => t.includes(k) && i.name.includes(k)));
    if (alts.length) return { item: alts[0], alt: alts.slice(1, 5), ambiguous: true };
    for (const ty of ['铁矿', '焦煤']) if (t.includes(ty)) { const tot = items.find((i) => i.type === ty && i.name.endsWith('总库存')); if (tot) return { item: tot, alt: [] }; }
    if (t.includes('辅料')) return { item: null, alt: items.filter((i) => i.type === '辅料'), ambiguous: true };
    return { item: null, alt: [] };
  }
  function detectBiz(t, itemFound) {
    const score = {}; let best = null, top = 0, tie = false;
    Object.keys(KW).forEach((k) => { score[k] = KW[k].filter((w) => t.includes(w)).length; });
    if (itemFound) score['大宗采购船'] += 2;
    Object.keys(score).forEach((k) => { if (score[k] > top) { top = score[k]; best = k; tie = false; } else if (score[k] === top && top > 0) tie = true; });
    return tie ? null : best;
  }
  function detectTons(t) {
    let m = t.match(/([\d.]+|[一二两三四五六七八九十]+)\s*万\s*([一二三四五六七八九])?\s*(?:吨|t|T)?/);
    if (m) { const b = cn2n(m[1]); if (!isNaN(b)) return Math.round((b + (m[2] ? CN[m[2]] / 10 : 0)) * 10000); }
    m = t.match(/(\d+(?:\.\d+)?)\s*千\s*吨/); if (m) return Math.round(parseFloat(m[1]) * 1000);
    m = t.match(/(\d{3,6})\s*(?:吨|t\b|T\b|mt|MT)/); if (m) return parseInt(m[1], 10);
    return null;
  }
  const ALIAS = [];
  ctx.ports.forEach((p) => {
    const names = [p.en.toLowerCase(), p.cn.replace(/（.*?）/g, '')].concat((p.alias || []).map((a) => a.toLowerCase()));
    if (p.isLocal) names.push('imip', '本港', '园区', '德信');
    names.forEach((n) => ALIAS.push([n, p.en]));
  });
  function detectPorts(t) {
    const low = t.toLowerCase(), hits = [];
    ALIAS.forEach(([n, en]) => { const i = low.indexOf(n); if (i >= 0 && !hits.find((h) => h.en === en)) hits.push({ en, i }); });
    return hits.sort((a, b) => a.i - b.i).map((h) => h.en);
  }
  function detectWindow(t) {
    const fwd = (s) => /^\s*(前|之前|以前|以内|内|到港|到|截止)/.test(s);
    const dow = new Date(T * DAY).getUTCDay(), mon0 = T - ((dow + 6) % 7);          // 本周一
    let m;
    m = t.match(/(\d{1,2})\s*[月/]\s*(\d{1,2})\s*[日号]?\s*(?:到|至|-|~|—|–)\s*(?:(\d{1,2})\s*[月/])?\s*(\d{1,2})\s*[日号]?/);
    if (m) { const m1 = +m[1], m2 = m[3] ? +m[3] : m1; return { a: dnOf(m1, +m[2]), b: dnOf(m2, +m[4]), range: true }; }
    let mon = null, part = null;
    m = t.match(/(\d{1,2})月(上旬|中旬|下旬|初|中|底)/); if (m) { mon = +m[1]; part = m[2]; }
    else if ((m = t.match(/(下个?月|本月|这个月|月)(初|中|底)/))) { mon = /下/.test(m[1]) ? (TM === 12 ? 1 : TM + 1) : TM; part = m[2]; }
    if (mon) { const r = { 初: [1, 7], 上旬: [1, 10], 中: [12, 18], 中旬: [11, 20], 底: [25, 31], 下旬: [21, 31] }[part]; return { a: dnOf(mon, r[0]), b: Math.min(dnOf(mon, r[1]), monthEnd(mon)), range: true }; }
    m = t.match(/(下下|下|本|这)?\s*(?:个)?(?:周|星期|礼拜)([一二三四五六日天])\s*(前|之前|以前)?/);
    if (m) {
      const k = '一二三四五六日天'.indexOf(m[2]), kk = k >= 6 ? 7 : k + 1;
      let d = mon0 + (m[1] === '下' ? 7 : m[1] === '下下' ? 14 : 0) + kk - 1; if (!m[1] && d < T) d += 7;
      return m[3] ? { a: T, b: d, deadline: true } : { a: d - 1, b: d + 1, d };
    }
    m = t.match(/(下下|下|本|这)(?:个)?(?:周|星期)(?![一二三四五六日天])/);
    if (m) { const mon1 = mon0 + (m[1] === '下' ? 7 : m[1] === '下下' ? 14 : 0); return { a: Math.max(mon1, T), b: mon1 + 6, range: true }; }
    m = t.match(/(\d+|[一二两三四五六七八九十]+)\s*天\s*(后|内|之内|以内)/);
    if (m) { const n = cn2n(m[1]); if (!isNaN(n)) return m[2] === '后' ? { a: T + n - 1, b: T + n + 1 } : { a: T, b: T + n, deadline: true }; }
    m = t.match(/(?:(\d{4})\s*年)?\s*(\d{1,2})\s*[月/]\s*(\d{1,2})\s*[日号]?/);
    if (m) { const d = dnOf(+m[2], +m[3]); const tail = t.slice(t.indexOf(m[0]) + m[0].length); return fwd(tail) || /截止|最晚|之前|前/.test(t) ? { a: T, b: d, deadline: true } : { a: d - 1, b: d + 1, d }; }
    m = t.match(/(\d{1,2})\s*[日号]/);
    if (m) { let d = dnOf(TM, +m[1]); if (d < T) d = dnOf(TM === 12 ? 1 : TM + 1, +m[1]); return fwd(t.slice(t.indexOf(m[0]) + m[0].length)) || /截止|最晚|前/.test(t) ? { a: T, b: d, deadline: true } : { a: d - 1, b: d + 1, d }; }
    return null;
  }

  /** @param ov 用户在解析结果里手工改的值：{ biz, item, tons, load, disch, b } */
  function parse(text, ov = {}) {
    const t = String(text).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248));
    const f = detectItem(t);
    const r = { text, item: ov.item !== undefined ? ov.item : f.item, alt: f.alt || [], ambiguous: !!f.ambiguous && ov.item === undefined, notes: [] };
    r.biz = ov.biz || detectBiz(t, !!r.item);
    r.tons = ov.tons || detectTons(t);
    const others = detectPorts(t).filter((p) => p !== LOCAL);
    if (r.biz === '成品销售船') { r.load = LOCAL; r.disch = ov.disch || others[0] || null; } else { r.load = ov.load || others[0] || null; r.disch = LOCAL; }
    let w = detectWindow(t);
    if (w && r.item && w.d !== undefined) w = { a: T, b: w.d, deadline: true };       // 问库存物料时，单个日期理解为「到港截止日」
    r.hasWin = !!w; r.userDeadline = !!(w && (w.deadline || w.b));
    if (w) { r.a = Math.max(w.a, T); r.b = Math.min(w.b, HORIZON); r.outside = r.b < r.a || w.b > HORIZON; } else { r.a = T; r.b = null; }   // 超出未来 60 天也标记（原型只在截止日早于今天时标记）
    if (ov.b != null) { r.b = ov.b; r.userDeadline = true; if (!w || r.a > r.b) r.a = T; r.outside = r.b < r.a || r.b > HORIZON; }
    return r;
  }
  return { parse, detectTons, detectWindow, detectItem, detectPorts, detectBiz };
}
