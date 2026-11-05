import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { DIRECTORY_PORT, HEALTH_PORT, MASTER_STORE, SYNC_LOG, VOYAGE_STORE } from '../../ports/tokens';
import type { DirectoryPort } from '../../ports/directory.port';
import type { HealthPort, SyncLogPort } from '../../ports/sync-log.port';
import type { Actor } from '../../domain/voyage';

type Handlers = Record<string, (result: any, payload: any) => Promise<unknown>>;
type Outbox = { backlog(): Promise<Record<string, number>>; replayWritten(h: Handlers): Promise<number> };
const handlersOf = (s: unknown): Handlers => ((s as { replayHandlers?: () => Handlers }).replayHandlers?.() ?? {});

@Injectable()
export class AdminService {
  constructor(
    @Inject(SYNC_LOG) private readonly logs: SyncLogPort, @Inject(HEALTH_PORT) private readonly health: HealthPort, @Inject(DIRECTORY_PORT) private readonly dir: DirectoryPort,
    @Inject('SSPS_OUTBOX') private readonly outbox: Outbox | null, @Inject(MASTER_STORE) private readonly master: unknown, @Inject(VOYAGE_STORE) private readonly voyage: unknown,
  ) {}
  actor(ctx: { userId?: string; userName?: string; roles?: string[] }) { return this.dir.resolve(ctx || {}); }
  private guard(a: Actor) { if (a.role !== '系统管理员') throw new BusinessException(ResponseCode.FORBIDDEN, '只有系统管理员可以查看', HttpStatus.FORBIDDEN); }

  /** A28：运行日志 */
  async syncLogs(a: Actor, failOnly = false) { this.guard(a); return this.logs.list({ failOnly }); }
  /** A28：连通性自检。只返回检查项和状态，不返回密钥或底层报错原文 */
  async healthCheck(a: Actor) { this.guard(a); return { at: new Date().toISOString().slice(0, 16).replace('T', ' '), checks: await this.health.checks() }; }

  /**
   * W16 补偿：把「飞书已写成功、回写镜像没做完」的记录补完（不会再写飞书）。系统管理员手动触发，或定时任务带内部令牌触发。
   * 没有写队列（内存模式）时直接返回 enabled=false。pending/failed 是飞书写失败的，等用户用同一个幂等键重试，这里只汇报数量。
   */
  async replay(a: Actor | null) {
    if (a) this.guard(a);
    if (!this.outbox) return { enabled: false, replayed: 0, backlog: {} };
    const replayed = await this.outbox.replayWritten({ ...handlersOf(this.master), ...handlersOf(this.voyage) });
    return { enabled: true, replayed, backlog: await this.outbox.backlog() };
  }
}
