// 导入与迁移共用的清洗小工具（纯函数）。
import { iso } from '../lib/dates.js';

const pad = (n) => String(n).padStart(2, '0');
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Excel 序列号 / Date / 字符串 → 'YYYY-MM-DD HH:mm'（按字面值，不做时区换算）；无法解析返回 null */
export function parseDateTime(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getUTCFullYear() + '-' + pad(v.getUTCMonth() + 1) + '-' + pad(v.getUTCDate()) + ' ' + pad(v.getUTCHours()) + ':' + pad(v.getUTCMinutes());
  if (typeof v === 'number') {
    if (!(v > 20000 && v < 80000)) return null;                       // 约 1954–2119 年，之外当作不是日期
    const d = new Date(EXCEL_EPOCH + Math.round(v * 86400000));
    return parseDateTime(d);
  }
  const m = String(v).trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return y + '-' + pad(mo) + '-' + pad(d) + ' ' + pad(h) + ':' + pad(mi);
}

/** 数值化：「$8,010.11」「12,000吨/天」「Rp35,000,000/天」「180车」「10%」→ { value, unit, currency }；「计算错误」「/」「-」→ null */
export function parseNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v, unit: null, currency: null } : null;
  const s = String(v).trim();
  if (!s || /^[-/－]+$/.test(s) || /计算错误|#VALUE|#N\/A|#REF|#DIV/i.test(s)) return null;
  const m = s.match(/(-?[\d,]*\.?\d+)/);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const currency = /^\s*\$|USD/i.test(s) ? 'USD' : /Rp|IDR/i.test(s) ? 'IDR' : null;
  const unit = /%/.test(s) ? '%' : /吨\s*\/\s*天/.test(s) ? '吨/天' : /\/\s*天/.test(s) ? '/天' : /车/.test(s) ? '车' : /吨/.test(s) ? '吨' : null;
  return { value, unit, currency };
}

/** 「3.17日发出」「2.8日签回」这类无年份日期，按给定年份补全；返回 'YYYY-MM-DD' 或 null */
export function parseShortDate(v, year) {
  const m = String(v ?? '').match(/(\d{1,2})[.月/](\d{1,2})/);
  if (!m) return null;
  const mo = +m[1], d = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return year + '-' + pad(mo) + '-' + pad(d);
}

/** 泊位原文 → 泊位编码列表。「F1」「LN17/LN18」「LabotaT 4号码头」「L12A」；不在德信池的保留原文（inPool=false） */
export function normalizeBerth(raw, poolCodes) {
  const text = String(raw ?? '').trim();
  const pool = new Set(poolCodes);
  if (!text) return { raw: text, codes: [], inPool: false };
  const codes = [];
  for (const part of text.split(/[/、,，+&]/)) {
    const p = part.trim().toUpperCase().replace(/\s+/g, '');
    let m = p.match(/^(LN|L|F)0*(\d+)[A-Z]?$/);
    if (m) { codes.push(m[1] + m[2]); continue; }
    m = part.match(/Labota\s*T?\s*(\d+)\s*号?码头/i);
    if (m) codes.push('L' + m[1]);
  }
  const uniq = [...new Set(codes)];
  const inPoolCodes = uniq.filter((c) => pool.has(c));
  return { raw: text, codes: inPoolCodes.length ? inPoolCodes : uniq, inPool: inPoolCodes.length > 0 };
}

export { iso };
