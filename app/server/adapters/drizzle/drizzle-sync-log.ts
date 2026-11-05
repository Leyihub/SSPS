import { desc, ne } from 'drizzle-orm';
import { syncLog } from '../../database/schema';
import type { SyncLogEntry, SyncLogPort } from '../../ports/sync-log.port';
import type { Db } from './db';
import { fromTs, toTs } from './db';

/** 运行日志（D09 sync_log）。错误信息不得含密钥、令牌或金额明细——写入前截断到 500 字 */
export class DrizzleSyncLog implements SyncLogPort {
  constructor(private readonly db: Db) {}
  async add(e: SyncLogEntry) {
    await this.db.insert(syncLog).values({ task: e.type, startedAt: toTs(e.start) ?? new Date(), finishedAt: toTs(e.end), rowsAffected: e.n, result: e.ok, error: e.err ? e.err.slice(0, 500) : null });
  }
  async list(opt: { failOnly?: boolean; limit?: number } = {}): Promise<SyncLogEntry[]> {
    const q = this.db.select().from(syncLog);
    const rows = await (opt.failOnly ? q.where(ne(syncLog.result, '成功')) : q).orderBy(desc(syncLog.startedAt), desc(syncLog.createdAt)).limit(opt.limit ?? 200);
    return rows.map((r) => ({ type: r.task, start: fromTs(r.startedAt) ?? '', end: fromTs(r.finishedAt) ?? '', n: r.rowsAffected ?? 0, ok: (r.result ?? '成功') as SyncLogEntry['ok'], err: r.error ?? '' }));
  }
}
