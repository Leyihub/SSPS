// IMIP 靠船计划导入（A17 / A18 的解析与校验部分）。
// 规则（2026-11-05 Leyinet 确认）：每批全部原始行照存应用库快照（D04）；只有通过下面检查的行才写入 T10、参与 CMR：
//   缺日期 / 卸完早于靠泊 → 日期异常（进数据质量清单，不进 CMR）
//   预计卸完早于导入当天 → 已卸完的历史行，不进 T10
//   预计到港、靠泊、卸完任一项与导入日相差超过 90 天 → 日期异常
//   池内泊位上的船不论从属单位一律计入占用；船舶类型按 T04 枚举归一（销售成品船 = 成品销售船）
import { CONFIG } from '../config';
import { dn } from '../lib/dates';
import { parseDateTime, parseNumber, normalizeBerth } from './common';

/** 规范字段 → 可能的表头写法。IMIP 原始文件列名以真实文件为准，这里只做容错匹配，认不出来的列原样保留在 raw 里 */
export const HEADER_ALIASES = {
  terminal: ['码头'], berth: ['泊位'], vessel: ['船名'], loa: ['船长', '船长/吃水', '船长（米）'], shipType: ['船舶类型', '船型'],
  cargo: ['物资名称', '物资', '货物'], tons: ['吨位', '货量'], owner: ['从属单位', '所属单位'],
  eta: ['预计到港日期', '预计到港', '预计到港时间'], etb: ['预计靠泊时间', '预计靠泊'], etd: ['预计卸完时间', '预计卸完'], remark: ['备注'],
};
const SHIP_TYPE = { '销售成品船': '成品销售船' };

function pick(row, names) { for (const n of names) if (row[n] !== undefined && row[n] !== null && row[n] !== '') return row[n]; return undefined; }

/**
 * @param {object[]} rows 表格原始行（表头 → 值）
 * @param {object} opt { importDate:'YYYY-MM-DD', poolCodes:[...], windowDays? }
 * @returns {{ rows: object[], summary: object, coverTo: string|null }}
 *   每行带 status：active（进 T10）/ history（已卸完，只存快照）/ anomaly（日期异常，进 D08）
 */
export function normalizeBerthPlan(rows, opt) {
  const W = opt.windowDays ?? CONFIG.IMPORT_WINDOW_DAYS, today = dn(opt.importDate);
  const out = rows.map((raw, idx) => {
    const g = (k) => pick(raw, HEADER_ALIASES[k]);
    const eta = parseDateTime(g('eta')), etb = parseDateTime(g('etb')), etd = parseDateTime(g('etd'));
    const b = normalizeBerth(g('berth'), opt.poolCodes);
    const shipType = String(g('shipType') ?? '').trim();
    const r = {
      line: idx + 1, terminal: String(g('terminal') ?? '').trim(), berthRaw: b.raw, berth: b.codes[0] || null, inPool: b.inPool,
      vessel: String(g('vessel') ?? '').trim(), loa: parseNumber(g('loa'))?.value ?? null, shipType: SHIP_TYPE[shipType] || shipType,
      cargo: String(g('cargo') ?? '').trim(), tons: parseNumber(g('tons'))?.value ?? null, owner: String(g('owner') ?? '').trim(),
      eta, start: etb, end: etd, remark: String(g('remark') ?? '').trim(), raw,
    };
    const bad = (code, text) => Object.assign(r, { status: 'anomaly', issue: { code, text } });
    if (!eta || !etb || !etd) return bad('DATE_MISSING', '预计到港 / 靠泊 / 卸完缺失或无法解析');
    if (dn(etd) < dn(etb)) return bad('DATE_INVERTED', '预计卸完早于预计靠泊');
    if (dn(etd) < today) return Object.assign(r, { status: 'history' });                       // 已卸完的历史行：只存快照
    for (const [k, v] of [['预计到港', eta], ['预计靠泊', etb], ['预计卸完', etd]]) {
      if (Math.abs(dn(v) - today) > W) return bad('DATE_OUT_OF_RANGE', k + ' ' + v.slice(0, 10) + ' 与导入日相差超过 ' + W + ' 天');
    }
    return Object.assign(r, { status: 'active' });
  });
  const count = (s) => out.filter((r) => r.status === s).length, active = out.filter((r) => r.status === 'active');
  const coverTo = active.length ? active.reduce((m, r) => (dn(r.start) > dn(m) ? r.start : m), active[0].start).slice(0, 10) : null;
  return {
    rows: out, coverTo,
    summary: { total: out.length, active: count('active'), history: count('history'), anomaly: count('anomaly'), offPool: active.filter((r) => !r.inPool).length,
      unmatchedBerth: active.filter((r) => !r.berth).length, anomalies: out.filter((r) => r.status === 'anomaly').map((r) => ({ line: r.line, vessel: r.vessel, ...r.issue })) },
  };
}

/** 进入 T10 / 引擎的行：只有 active，字段对齐引擎入参 */
export const toEngineRows = (res) => res.rows.filter((r) => r.status === 'active').map((r) => ({
  berth: r.berth, inPool: r.inPool, start: r.start.slice(0, 10), end: r.end.slice(0, 10), eta: r.eta.slice(0, 10), vessel: r.vessel, cargo: r.cargo, tons: r.tons,
}));
