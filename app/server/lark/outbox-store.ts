// 写队列的持久化（D10 write_queue）：outbox 的 store 接口落到应用库，重启不丢、补偿任务可以扫描。
import { and, asc, eq } from 'drizzle-orm';
import { writeQueue } from '../database/schema';
import type { Db } from '../adapters/drizzle/db';

export interface OutboxRecord { key: string; kind: string; payload: unknown; table?: string; operation?: 'create' | 'update' | 'delete'; status: 'pending' | 'written' | 'done' | 'failed'; attempts: number; result: unknown; error?: string }

export function createDrizzleOutboxStore(db: Db) {
  const toRec = (r: typeof writeQueue.$inferSelect): OutboxRecord => ({ key: r.idempotencyKey, kind: r.kind, payload: r.payload, table: r.targetTable, operation: r.operation as OutboxRecord['operation'], status: r.status as OutboxRecord['status'], attempts: r.attempts, result: r.result, error: r.lastError ?? undefined });
  return {
    get: async (key: string) => { const [r] = await db.select().from(writeQueue).where(eq(writeQueue.idempotencyKey, key)); return r ? toRec(r) : null; },
    put: async (rec: OutboxRecord) => {
      const v = { kind: rec.kind, targetTable: rec.table || rec.kind, operation: rec.operation || 'create', payload: rec.payload as any, status: rec.status, result: (rec.result ?? null) as any, attempts: rec.attempts, lastError: rec.error ? rec.error.slice(0, 500) : null };
      await db.insert(writeQueue).values({ idempotencyKey: rec.key, ...v }).onConflictDoUpdate({ target: writeQueue.idempotencyKey, set: { ...v, updatedAt: new Date() } });
    },
    list: async (status: string, limit = 200) => (await db.select().from(writeQueue).where(and(eq(writeQueue.status, status))).orderBy(asc(writeQueue.createdAt)).limit(limit)).map(toRec),
  };
}
