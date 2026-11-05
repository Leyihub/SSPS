// CMR（泊位余量率，越高越宽松）和同期船数的色阶。30% 是备选方案的底线，其余分界为暂定值（原型建议值，待确认）。
import { dayNum, isoOf } from './format';

export const cmrCls = (v: number) => (v >= 0.5 ? 'c1' : v >= 0.3 ? 'c2' : v >= 0.1 ? 'c3' : 'c4');
export const cmrLab = (v: number) => (v >= 0.5 ? '充裕' : v >= 0.3 ? '适中' : v >= 0.1 ? '偏紧' : '紧张');
export const denCls = (c: number, n: number) => { const r = c / n; return r <= 0.5 ? 'c1' : r <= 0.7 ? 'c2' : r <= 0.9 ? 'c3' : 'c4'; };
export const denLab = (c: number, n: number) => { const r = c / n; return r <= 0.5 ? '宽松' : r <= 0.7 ? '适中' : r <= 0.9 ? '偏密' : '拥挤'; };
export const stockLevel = (d: number): [string, string] => (d >= 25 ? ['ok', '充裕'] : d >= 15 ? ['mid', '偏紧'] : ['bad', '危险']);

/** 引擎输出的日期是「日序号」（自 1970-01-01 起的天数），这里转成展示格式 */
export const nIso = (n: number) => isoOf(n);
export const nMd = (n: number) => isoOf(n).slice(5).replace('-', '/');
export const nMdCn = (n: number) => { const [, m, d] = isoOf(n).split('-'); return Number(m) + '月' + Number(d) + '日'; };
export const nDCn = (n: number) => Number(isoOf(n).slice(8)) + '日';
export const nWk = (n: number) => '周' + '日一二三四五六'[new Date(n * 86400000).getUTCDay()];
export const toDn = (iso: string) => dayNum(iso);
export const wan = (n: number) => n / 10000 + ' 万吨';
