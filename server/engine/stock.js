// 库存消耗模拟（断料计划）。序列项为 [日序号, 库存吨, 日耗吨]；序列已包含已排定到货，
// 所以断料日 = 模拟库存首次降到 0 的那一天。物料项：{ name, type, stock, daily, series }。
import { CONFIG } from '../config.js';

export const stockAt = (it, d) => {
  const S = it.series;
  if (!S.length) return it.stock;
  if (d <= S[0][0]) return S[0][1];
  let v = S[0][1];
  for (const x of S) { if (x[0] <= d) v = x[1]; else break; }
  return v;
};
export const dailyAt = (it, d) => {
  const S = it.series;
  if (!S.length) return it.daily;
  let v = S[0][2];
  for (const x of S) { if (x[0] <= d) v = x[2]; else break; }
  return v || it.daily || 1;
};
/** 模拟库存首次降到 0 的日期（没有返回 null）。库存为 null（错误值行）的点不参与判断 */
export const stockout = (it) => {
  const x = it.series.find((q) => q[1] != null && q[1] <= 0);
  return x ? x[0] : null;
};

/**
 * 断料日（2026-11-05 确认）：首次降到 0 的缺口若按最快航程已赶不上、且之后被已排定到货补回，
 * 只提示这个短缺口，排船目标改用补回后的下一次断料日。minLead = 缓冲天数 + P80 航程。
 */
export function stockoutPlan(it, minLead, today) {
  const s = it.series, i = s.findIndex((q) => q[1] != null && q[1] <= 0);
  if (i < 0) return { so: null };
  const so1 = s[i][0];
  if (so1 - minLead >= today) return { so: so1 };
  const j = s.findIndex((q, k) => k > i && q[1] != null && q[1] > 0);
  if (j < 0) return { so: so1 };
  const k = s.findIndex((q, n) => n > j && q[1] != null && q[1] <= 0);
  return { so: k < 0 ? null : s[k][0], gap: { from: so1, to: s[j][0] - 1 } };
}

/** 把一船新货算进去后的库存曲线（原序列里的已排定到货按相邻日差回推，保留） */
export function project(it, arrivals, until, today) {
  const S = it.series, out = [];
  let prev = S.length ? S[0][1] : it.stock;
  for (let d = today; d <= until; d++) {
    const base = stockAt(it, d), basePrev = stockAt(it, d - 1), dl = dailyAt(it, d);
    const sched = d > today ? Math.max(0, base - basePrev + (basePrev > 0 ? dl : 0)) : 0;
    let s = d === today ? base : Math.max(0, prev - dl + sched);
    arrivals.forEach((a) => { if (a.d === d) s += a.tons; });
    out.push([d, s]); prev = s;
  }
  return out;
}

/** 沿用德龙版分档：>25 天充裕、15–25 天偏紧、<15 天危险 */
export const stockLevel = (days) => (days >= CONFIG.STOCK_SAFE_DAYS ? '充裕' : days >= CONFIG.STOCK_WARN_DAYS ? '偏紧' : '危险');
