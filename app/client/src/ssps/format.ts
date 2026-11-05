// 日期与数字的展示格式化（口径沿用原型 assets/common.js）。后端日期时间一律是 'YYYY-MM-DD HH:mm' 字面值，不做时区换算。
const DAY = 86400000;
export const fmt = (n: number | null | undefined) => (n == null || (n as unknown) === '' ? '—' : Number(n).toLocaleString('en-US'));
export const pct = (x: number) => Math.round(x * 1000) / 10 + '%';
export const dayNum = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
export const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const md = (s?: string | null) => (s ? s.slice(5, 10).replace('-', '/') : '—');
export const mdh = (s?: string | null) => (s ? s.slice(5, 10).replace('-', '/') + (s.length > 10 && s.slice(11, 16) !== '00:00' ? ' ' + s.slice(11, 16) : '') : '—');
export const mdCn = (s?: string | null) => { if (!s) return '—'; const p = s.slice(0, 10).split('-'); return Number(p[1]) + '月' + Number(p[2]) + '日'; };
export const wk = (s: string) => '周' + '日一二三四五六'[new Date(dayNum(s) * DAY).getUTCDay()];
export const dt = (s?: string | null) => (s ? s.slice(0, 16) : '—');
/** 两个日期时间相差的天数（保留 2 位），任一为空返回 null */
export const daysBetween = (a?: string | null, b?: string | null) => (a && b ? Math.round((new Date(b.replace(' ', 'T')).getTime() - new Date(a.replace(' ', 'T')).getTime()) / DAY * 100) / 100 : null);
/** 状态 → 色标类名（样式在 ssps.css 的 .s0–.s7、.sx） */
export const STATUS_ORDER = ['待宣船', '未到装港', '装港等泊', '装港装货', '航行中', '卸港等泊', '卸港卸货', '已结束'];
export const stCls = (s: string) => (s === '已结束（取消）' ? 'sx' : 's' + STATUS_ORDER.indexOf(s));
export const bizShort = (b: string) => b.replace('采购船', '').replace('销售船', '').replace('备件船', '备件');
export function downloadCsv(name: string, rows: Array<Array<string | number | null | undefined>>) {
  const text = '﻿' + rows.map((r) => r.map((x) => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click();
}
