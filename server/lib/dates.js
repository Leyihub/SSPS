// 日期工具：只比较日期（锁定规则 9），时间一律按 IMIP 当地时间（WITA，UTC+8）的字面值处理。
const DAY = 86400000;
const WK = ['日', '一', '二', '三', '四', '五', '六'];

/** 'YYYY-MM-DD'（或带时间的字符串）→ 日序号（自 1970-01-01 起的整数天） */
export function dn(isoStr) {
  const m = String(isoStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) throw new Error('日期格式不对：' + isoStr);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
}
/** 日序号 → 'YYYY-MM-DD' */
export const iso = (n) => new Date(n * DAY).toISOString().slice(0, 10);
/** 日序号 → 星期几（日一二三四五六） */
export const wk = (n) => WK[new Date(n * DAY).getUTCDay()];
/** 日序号 → 'MM/DD' */
export const md = (n) => iso(n).slice(5).replace('-', '/');

/** 'YYYY-MM-DD HH:mm' 或 'YYYY-MM-DD' → 毫秒（按 UTC 字面值，只用于求差） */
export function ts(s) {
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) throw new Error('时间格式不对：' + s);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
}
/** 两个时间之间的天数，保留 2 位小数；任一为空返回 null */
export function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round(((ts(b) - ts(a)) / DAY) * 100) / 100;
}
/** 是否只有日期、没有时刻（迁移来的纯日期按 00:00 存，也算） */
export function isDateOnly(s) {
  const m = String(s).match(/^\d{4}-\d{1,2}-\d{1,2}(?:[ T](\d{1,2}):(\d{2}))?/);
  return !m || m[1] === undefined || (m[1] === '0' || m[1] === '00') && m[2] === '00';
}
