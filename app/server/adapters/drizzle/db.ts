// Drizzle 适配器共用：数据库句柄类型与小工具。运行时句柄由平台注入（DRIZZLE_DATABASE，禁止自建连接）；测试里用 PGlite。
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type Db = PgDatabase<PgQueryResultHKT, any>;
export const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));
/** 'YYYY-MM-DD HH:mm' 字面值 ↔ 数据库时间戳：按 IMIP 当地时间（UTC+8）解释，读出时再按同一偏移还原，页面上看到的永远是录入时的字面值 */
export const TZ_OFFSET_HOURS = 8;
export const toTs = (s: string | null | undefined): Date | null => (s ? new Date(Date.parse(s.replace(' ', 'T').slice(0, 16) + ':00Z') - TZ_OFFSET_HOURS * 3600000) : null);
export const fromTs = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const t = (d instanceof Date ? d : new Date(d)).getTime() + TZ_OFFSET_HOURS * 3600000;
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
};
