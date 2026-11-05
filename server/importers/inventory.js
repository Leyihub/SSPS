// 库存消耗模拟表导入（A30）。表头：导入日期、库存日期、品名、物料类型、日耗、库存、可用天数（按列名取，不按列序）。
// 「库存」列是错误值（#VALUE! 等）的行标记为错误行：保存进 D12（是否错误值），但不参与断料计算。
import { dn } from '../lib/dates.js';
import { parseDateTime, parseNumber } from './common.js';

const isErr = (v) => typeof v === 'string' && /^#|计算错误/.test(v.trim());

/**
 * @param {object[]} rows 表格原始行
 * @param {{ today: string }} opt
 * @returns {{ items: object[], errorRows: object[], summary: object }}
 *   item：{ name, type, stock, daily, days, daysEstimated, series:[[日序号,库存,日耗]], validUntil, errorCount }
 *   series 只含有效点（错误行不进）；validUntil = 有效数据覆盖到的最后一天，页面应显示「模拟覆盖至」，不要把覆盖期之外说成「不断料」
 */
export function buildInventory(rows, opt) {
  const T = dn(opt.today), by = new Map(), errorRows = []; let imp = null, bad = 0;
  rows.forEach((r, i) => {
    const name = String(r['品名'] ?? '').trim(), date = parseDateTime(r['库存日期']);
    if (!imp && r['导入日期']) imp = parseDateTime(r['导入日期'])?.slice(0, 10) || null;
    if (!name || !date) { bad++; return; }
    const stock = parseNumber(r['库存']), daily = parseNumber(r['日耗']), avail = parseNumber(r['可用天数']);
    const it = by.get(name) || { name, type: String(r['物料类型'] ?? '其他').trim() || '其他', rows: [], errorCount: 0 };
    by.set(name, it);
    if (!stock || isErr(r['库存'])) { it.errorCount++; errorRows.push({ line: i + 1, name, date: date.slice(0, 10), raw: String(r['库存']) }); return; }
    it.rows.push({ d: dn(date), s: stock.value, dl: daily ? daily.value : null, av: avail ? avail.value : null });
  });
  const items = [...by.values()].filter((it) => it.rows.length).map((it) => {
    it.rows.sort((a, b) => a.d - b.d);
    let last = (it.rows.find((x) => x.dl) || { dl: 1 }).dl || 1;
    const series = it.rows.map((x) => { if (x.dl) last = x.dl; return [x.d, x.s, x.dl || last]; });
    const at = it.rows.find((x) => x.d >= T) || it.rows[0], atS = series.find((x) => x[0] === at.d);
    const fromTable = Number.isFinite(at.av);                                       // 当前库存的可用天数显示原表值（2026-11-05 确认）
    return { name: it.name, type: it.type, stock: at.s, daily: atS[2], days: fromTable ? Math.floor(at.av) : Math.floor(at.s / atS[2]), daysEstimated: !fromTable,
      series, validUntil: series[series.length - 1][0], errorCount: it.errorCount };
  });
  return { items, errorRows, summary: { importDate: imp, rows: rows.length, items: items.length, errorRows: errorRows.length, skipped: bad } };
}
