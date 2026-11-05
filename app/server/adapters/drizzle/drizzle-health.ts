import { count, sql } from 'drizzle-orm';
import { mBerth, mPort, mRouteRule, mVoyage } from '../../database/schema';
import type { HealthCheck, HealthPort } from '../../ports/sync-log.port';
import type { Db } from './db';

/** 连通性自检（真实库）：应用数据库、飞书凭证是否配置、镜像表是否有数据。只返回结论，不返回密钥或底层报错原文 */
export class DrizzleHealth implements HealthPort {
  constructor(private readonly db: Db, private readonly env: Record<string, string | undefined> = process.env) {}
  async checks(): Promise<HealthCheck[]> {
    const out: HealthCheck[] = [];
    try { await this.db.execute(sql`select 1`); out.push({ name: '应用数据库', status: '正常', detail: '可以连接并读取' }); }
    catch { out.push({ name: '应用数据库', status: '异常', detail: '连接或查询失败，请查看服务端日志' }); return out; }
    for (const [name, table] of [['镜像表 m_port（港口）', mPort], ['镜像表 m_berth（泊位）', mBerth], ['镜像表 m_route_rule（航程规则）', mRouteRule], ['镜像表 m_voyage（航次）', mVoyage]] as const) {
      try { const [r] = await this.db.select({ n: count() }).from(table as any); out.push({ name, status: Number(r.n) ? '正常' : '提醒', detail: Number(r.n) ? `${r.n} 行` : '0 行（同步任务还没有数据，或确实为空）' }); }
      catch { out.push({ name, status: '异常', detail: '读取失败：镜像表不存在或同步任务未建立' }); }
    }
    const has = (k: string) => !!this.env[k];
    out.push({ name: '飞书应用凭证', status: has('LARK_APP_ID') && has('LARK_APP_SECRET') ? '正常' : '提醒', detail: has('LARK_APP_ID') && has('LARK_APP_SECRET') ? '环境变量已配置（有效性未检测）' : '环境变量 LARK_APP_ID / LARK_APP_SECRET 未配置' });
    out.push({ name: '多维表格配置', status: has('BITABLE_APP_TOKEN') && has('BITABLE_TABLE_IDS') ? '正常' : '提醒', detail: has('BITABLE_APP_TOKEN') && has('BITABLE_TABLE_IDS') ? '环境变量已配置' : '环境变量 BITABLE_APP_TOKEN / BITABLE_TABLE_IDS 未配置' });
    out.push({ name: '云空间靠船计划文件夹', status: has('DRIVE_FOLDER_TOKEN_BERTH_PLAN') ? '正常' : '提醒', detail: has('DRIVE_FOLDER_TOKEN_BERTH_PLAN') ? '环境变量已配置' : '环境变量 DRIVE_FOLDER_TOKEN_BERTH_PLAN 未配置（云空间拉取待接入）' });
    return out;
  }
}
