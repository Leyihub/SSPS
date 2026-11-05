// 测试用内存 Postgres（PGlite）：用仓库里真实的建库 SQL（去掉平台专有的 RLS、角色）建表，所以也顺带检验了 001 的 DDL。
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../database/schema';

const SQL = path.join(__dirname, '../../../db/001-ssps-core.sql');

export async function testDb() {
  const pg = new PGlite();
  await pg.exec('CREATE TYPE user_profile AS (user_id varchar); CREATE TYPE file_attachment AS (bucket_id text, file_path text);');
  const sql = fs.readFileSync(SQL, 'utf8').split('\n').filter((l) => !/^(ALTER TABLE .* ENABLE ROW LEVEL SECURITY|DROP POLICY|CREATE POLICY)/.test(l)).join('\n');
  await pg.exec(sql);
  for (const extra of EXTRA_DDL) await pg.exec(extra);
  for (const t of [schema.mPort, schema.mBerth, schema.mVessel, schema.mVoyage, schema.mCargo, schema.mBulkSettle, schema.mSalesExt, schema.mRouteRule]) await pg.exec(mirrorDdl(t));
  return { pg, db: drizzle(pg, { schema }), close: () => pg.close() };
}
/** 之后的迁移（004…）也要在这里按顺序建好，测试才和线上库一致 */
export const EXTRA_DDL: string[] = [fs.readFileSync(path.join(__dirname, '../../../db/004-import-columns.sql'), 'utf8')];

/** 镜像表（由飞书同步任务在线上建）：测试里按 schema.ts 的列定义建同样结构的表（列类型、唯一键）；不建 RLS */
function mirrorDdl(table: any): string {
  const cfg = getTableConfig(table);
  const cols = cfg.columns.map((c: any) => {
    let def = `"${c.name}" ${c.getSQLType()}`;
    if (c.name === 'id') def += ' PRIMARY KEY DEFAULT gen_random_uuid()';
    else if (c.name === 'base_record_id') def += ' UNIQUE';
    else if (c.name === '_created_at' || c.name === '_updated_at') def += ' NOT NULL DEFAULT now()';
    return def;
  });
  return `CREATE TABLE IF NOT EXISTS "${cfg.name}" (${cols.join(', ')});`;
}
