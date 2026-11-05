// 幂等键：同一个键重复提交只执行一次，重复请求直接拿到第一次的结果。落在 D10 write_queue（idempotency_key 唯一、result 存结果）。
import { eq } from 'drizzle-orm';
import { writeQueue } from '../../database/schema';
import type { Db } from './db';

export async function once<T>(db: Db, key: string | undefined, kind: string, table: string, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const got = await db.insert(writeQueue).values({ idempotencyKey: key, kind, targetTable: table, operation: 'create', payload: {}, status: 'pending' }).onConflictDoNothing().returning({ id: writeQueue.id });
  if (!got.length) {
    const [row] = await db.select().from(writeQueue).where(eq(writeQueue.idempotencyKey, key));
    if (row?.status === 'done') return row.result as T;
    throw new Error('相同的请求正在处理中，请稍后再试');
  }
  try {
    const result = await fn();
    await db.update(writeQueue).set({ status: 'done', result: result as any }).where(eq(writeQueue.id, got[0].id));
    return result;
  } catch (e) {
    await db.delete(writeQueue).where(eq(writeQueue.id, got[0].id));        // 失败不占着键，允许用同一个键重试
    throw e;
  }
}
