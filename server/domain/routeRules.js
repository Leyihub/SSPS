// 航程规则：样本 ≥5 条切统计值，否则用经验值（锁定规则；T08 公式在应用里同样实现）。
import { CONFIG } from '../config.js';
import { BIZ } from './status.js';

/** 分位数（线性插值，等同 Excel PERCENTILE.INC）。P80 口径待确认，见 docs/open-questions.md */
export function percentile(values, p) {
  const a = values.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const idx = (a.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}
const round2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

/**
 * 一条航程规则 → 带「采用口径」和「生效航程」的规则。
 * @param {object} r { id, load, disch, biz[], exp, expMax, samples, p50, p80, tier, ... }
 */
export function buildRule(r, sampleMin = CONFIG.SAMPLE_MIN) {
  const stat = (r.samples || 0) >= sampleMin && r.p50 != null && r.p80 != null;
  return Object.assign({}, r, {
    basis: stat ? '统计值' : '经验值',
    effP50: stat ? r.p50 : r.exp,
    effP80: stat ? r.p80 : r.expMax,
  });
}

/** 一条航次能否作为航程学习样本 */
export function isValidSample(v) {
  if (!v.actLoadDep || !v.actDischArr) return false;
  if ((v.flags || []).includes('取消')) return false;
  if (v.placeholderTime) return false;                 // 迁移标记的疑似占位时间，不进统计（迁移规则第 9 条）
  const d = v.voyageDays;
  return Number.isFinite(d) && d > 0 && d <= CONFIG.SAMPLE_MAX_DAYS;
}

/**
 * 重算航程规则的统计列（每日定时任务 recomputeRouteRules 用）。
 * @param {Array} rules 原始规则（含 load/disch/biz[]）
 * @param {Array} voyages 航次，需带 voyageDays（实际航程）和 load/disch/biz
 * @returns 新规则数组（样本数、统计 P50/P80 已更新，采用口径与生效航程已算好）
 */
export function recomputeRules(rules, voyages) {
  return rules.map((r) => {
    const own = voyages.filter((v) => v.load === r.load && v.disch === r.disch && r.biz.includes(v.biz) && isValidSample(v)).map((v) => v.voyageDays);
    return buildRule(Object.assign({}, r, { samples: own.length, p50: round2(percentile(own, 0.5)), p80: round2(percentile(own, 0.8)) }));
  });
}

/** 查规则：物资备件船先用自己的规则，没有才借用同航线大宗规则（2026-11-05 确认） */
export function findRule(rules, load, disch, biz) {
  const enabled = rules.filter((r) => (r.status || '启用') === '启用');
  const own = enabled.find((r) => r.load === load && r.disch === disch && r.biz.includes(biz));
  if (own || biz !== BIZ.SPARE) return own || null;
  return enabled.find((r) => r.load === load && r.disch === disch && r.biz.includes(BIZ.BULK)) || null;
}
