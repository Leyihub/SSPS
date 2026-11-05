import type { UserLookupPort } from '../../ports/user-lookup.port';

/** 内存/占位实现：查不到姓名就用 ID 本身，不写飞书人员字段 */
export class MemoryUserLookup implements UserLookupPort {
  constructor(private users: Record<string, { name: string; feishuId?: string }> = {}) {}
  async names(ids: string[]) { return Object.fromEntries(ids.map((i) => [i, this.users[i]?.name ?? i])); }
  async feishuUserId(id: string) { return this.users[id]?.feishuId ?? null; }
}
