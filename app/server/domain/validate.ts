// 实际时间节点时序校验（docs/schema/status-rules.md 配套校验）。
// 规则：后一节点早于前一节点即拒绝保存，但只校验「本次改动的节点和它前后相邻的节点」；
// 历史数据里已有的倒置只作为警告（进 D08），不拦截无关的保存；
// 纯日期（迁移来的 00:00）与带时刻的节点在同一天时不算倒置。
import { dn, isDateOnly, ts } from '../lib/dates';

export const CHAIN = [
  ['actLoadArr', '实际抵装港'], ['loadBerth', '装港靠泊'], ['actLoadDep', '实际离装港'],
  ['actDischArr', '实际抵卸港'], ['dischBerth', '卸港靠泊'], ['dischDep', '卸港离港'],
];

/** a 是否严格早于 b 的反面——即「b 早于 a」（倒置）。同一天且任一方只有日期 → 不算倒置 */
export function inverted(a, b) {
  if (dn(a) === dn(b) && (isDateOnly(a) || isDateOnly(b))) return false;
  return ts(b) < ts(a);
}

/**
 * @param {object} next 保存后的航次
 * @param {object|null} prev 保存前的航次；null 表示新建或迁移（所有节点都算「本次改动」）
 * @returns {{errors: string[], warnings: Array<{code: string, text: string}>}}
 *   errors 非空 → 拒绝保存；warnings → 写入 D08 数据质量问题
 */
export function validateChain(next, prev = null) {
  const errors = [], warnings = [];
  const filled = CHAIN.filter(([k]) => next[k]);
  const changed = (k) => !prev || prev[k] !== next[k];
  for (let i = 1; i < filled.length; i++) {
    const [ka, la] = filled[i - 1], [kb, lb] = filled[i];
    if (!inverted(next[ka], next[kb])) continue;
    const text = '「' + lb + '」（' + next[kb] + '）不能早于「' + la + '」（' + next[ka] + '）';
    if (changed(ka) || changed(kb)) errors.push(text);
    else warnings.push({ code: 'CHAIN_INVERTED', text: '历史数据已有时序倒置：' + text });
  }
  // 软告警：已抵卸港但缺实际离装港，列入待补清单（这是航程学习的关键样本）
  if (next.actDischArr && !next.actLoadDep && !(next.flags || []).includes('取消')) {
    warnings.push({ code: 'MISSING_NODE', text: '已有「实际抵卸港」但缺「实际离装港」，请补录（航程样本）' });
  }
  return { errors, warnings };
}

/** 待补节点（工作台待办用） */
export const missingDeparture = (v) => !!(v.actDischArr && !v.actLoadDep && !(v.flags || []).includes('取消'));
