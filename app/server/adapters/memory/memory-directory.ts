import type { Actor } from '../../domain/voyage';
import type { DirectoryPort } from '../../ports/directory.port';

/** 内存实现：本地开发和测试用。未登记的用户按 fallback 身份 */
export class MemoryDirectory implements DirectoryPort {
  constructor(private users: Record<string, Omit<Actor, 'userId'>> = {}, private fallback: Omit<Actor, 'userId' | 'name'> = { role: '业务员', dept: '大宗采购部' }) {}
  set(userId: string, a: Omit<Actor, 'userId'>) { this.users[userId] = a; }
  async resolve(ctx: { userId?: string; userName?: string }): Promise<Actor> {
    const id = ctx.userId || 'dev-user', u = this.users[id];
    return u ? { userId: id, ...u } : { userId: id, name: ctx.userName || id, ...this.fallback };
  }
}
