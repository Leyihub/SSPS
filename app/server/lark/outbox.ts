// 写入一致性（docs/implementation-plan.md 骨架 3 补充）：
// 每个写请求带幂等键，同一键重复提交只执行一次；飞书写成功、后续步骤失败时留待补偿，由后台重放，不重复写飞书。
// store 是持久化接口（真实实现是应用库 D10 write_queue；这里给内存实现，用于测试）。
export function createMemoryStore() {
  const m = new Map();
  return { get: async (k) => m.get(k) || null, put: async (rec) => { m.set(rec.key, { ...rec }); }, list: async (status) => [...m.values()].filter((r) => r.status === status) };
}

/**
 * 记录状态：pending（已登记，飞书还没写成）→ written（飞书写成功，拿到结果）→ done（后续步骤也完成）；failed（飞书写失败）。
 * @param store 持久化接口
 */
export function createOutbox(store) {
  return {
    /**
     * @param key 幂等键（前端生成的 UUID）
     * @param writeLark 写飞书：返回结果（如新记录 ID）
     * @param afterWrite 后续步骤（回写镜像、写变更日志…），必须是可重复执行的
     */
    async execute(key, { kind, payload, writeLark, afterWrite, table = '', operation = 'create' }: { kind: string; payload: any; writeLark: (p: any) => Promise<any>; afterWrite?: (result: any, p: any) => Promise<unknown>; table?: string; operation?: 'create' | 'update' | 'delete' }) {
      let rec = await store.get(key);
      if (rec && rec.status === 'done') return { result: rec.result, replayed: true };              // 重复提交：直接返回上次结果
      if (!rec) { rec = { key, kind, payload, table, operation, status: 'pending', attempts: 0, result: null }; await store.put(rec); }
      if (rec.status === 'pending' || rec.status === 'failed') {
        rec.attempts++;
        try { rec.result = await writeLark(payload); rec.status = 'written'; await store.put(rec); }
        catch (e) { rec.status = 'failed'; rec.error = String(e.message || e); await store.put(rec); throw e; }
      }
      // written：飞书已写成功，只需（重新）完成后续步骤，绝不再写飞书
      if (afterWrite) await afterWrite(rec.result, payload);
      rec.status = 'done'; await store.put(rec);
      return { result: rec.result, replayed: false };
    },
    /** 各状态的积压数量（pending/failed 多半是飞书写失败，等用户重试；written 是等补偿的） */
    async backlog() {
      const out: Record<string, number> = {};
      for (const st of ['pending', 'failed', 'written']) out[st] = (await store.list(st)).length;
      return out;
    },
    /** 后台补偿：把「飞书已写成功但后续步骤没做完」的记录补完（崩溃恢复） */
    async replayWritten(afterByKind) {
      let n = 0;
      for (const rec of await store.list('written')) {
        const after = afterByKind[rec.kind]; if (!after) continue;
        try { await after(rec.result, rec.payload); } catch { continue; }     // 单条失败不影响其他，留待下一轮
        rec.status = 'done'; await store.put(rec); n++;
      }
      return n;
    },
  };
}

/**
 * 镜像行版本防覆盖：同步事件带的更新时间早于已回写的版本时丢弃，避免延迟的同步事件把刚回写的新值覆盖回旧值。
 * @returns true 表示应当应用这次同步事件
 */
export const shouldApplySync = (current, incomingUpdatedAt) => !current || !current.updatedAt || new Date(incomingUpdatedAt) >= new Date(current.updatedAt);
