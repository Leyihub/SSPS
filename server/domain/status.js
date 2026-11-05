// 船舶状态推导（docs/schema/status-rules.md）：从上往下判定，命中即止，三类船共用。
import { daysBetween } from '../lib/dates.js';

export const STATUS = ['待宣船', '未到装港', '装港等泊', '装港装货', '航行中', '卸港等泊', '卸港卸货', '已结束'];
export const STATUS_CANCELLED = '已结束（取消）';   // 不是第 9 个选项：状态 = 已结束 且 异常标记含「取消」时显示
export const BIZ = { BULK: '大宗采购船', PRODUCT: '成品销售船', SPARE: '物资备件船' };
export const LOCAL_PORT = 'BAHODOPI';

/**
 * @param {object} v 航次。用到的字段：
 *   biz, flags[], vessel(已关联船舶即真值), actLoadArr, loadBerth, actLoadDep, actDischArr, dischBerth, dischDep
 */
export function deriveStatus(v) {
  const prod = v.biz === BIZ.PRODUCT;
  if ((v.flags || []).includes('取消')) return STATUS_CANCELLED;                    // 1
  if (v.dischDep || (prod && v.dischBerth)) return '已结束';                         // 2
  if (v.dischBerth) return '卸港卸货';                                               // 3
  if (v.actDischArr) return '卸港等泊';                                              // 4
  if (v.actLoadDep) return '航行中';                                                 // 5
  if (v.loadBerth || (v.biz === BIZ.BULK && v.actLoadArr)) return '装港装货';        // 6（大宗常不记录装港靠泊）
  if (v.actLoadArr) return '装港等泊';                                               // 7
  if (v.vessel) return '未到装港';                                                   // 8
  return '待宣船';                                                                   // 9
}

/** 本港侧：装港是本港 = 装，否则 = 卸 */
export const sideOf = (v) => (v.load === LOCAL_PORT ? '装' : '卸');

/** 公式字段（多维表格里是公式，应用里同样算一份用于展示和校验） */
export function deriveFields(v, cargoLines = []) {
  const side = sideOf(v);
  const total = cargoLines.reduce((a, c) => a + (Number(c.tons) || 0), 0) || v.tons || 0;
  return {
    status: deriveStatus(v),
    side,
    total,
    pooled: cargoLines.length >= 2,
    overdue: v.laycanE && v.actLoadArr ? v.actLoadArr > v.laycanE : false,
    voyageDays: daysBetween(v.actLoadDep, v.actDischArr),                                    // 实际航程（天）：航程规则的学习样本
    waitDays: side === '卸' ? daysBetween(v.actDischArr, v.dischBerth) : daysBetween(v.actLoadArr, v.loadBerth),
    workDays: side === '卸' ? daysBetween(v.dischBerth, v.dischDep) : daysBetween(v.loadBerth, v.actLoadDep),
  };
}
