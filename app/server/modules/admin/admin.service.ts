import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { DIRECTORY_PORT, HEALTH_PORT, SYNC_LOG } from '../../ports/tokens';
import type { DirectoryPort } from '../../ports/directory.port';
import type { HealthPort, SyncLogPort } from '../../ports/sync-log.port';
import type { Actor } from '../../domain/voyage';

@Injectable()
export class AdminService {
  constructor(@Inject(SYNC_LOG) private readonly logs: SyncLogPort, @Inject(HEALTH_PORT) private readonly health: HealthPort, @Inject(DIRECTORY_PORT) private readonly dir: DirectoryPort) {}
  actor(ctx: { userId?: string; userName?: string; roles?: string[] }) { return this.dir.resolve(ctx || {}); }
  private guard(a: Actor) { if (a.role !== '系统管理员') throw new BusinessException(ResponseCode.FORBIDDEN, '只有系统管理员可以查看', HttpStatus.FORBIDDEN); }

  /** A28：运行日志 */
  async syncLogs(a: Actor, failOnly = false) { this.guard(a); return this.logs.list({ failOnly }); }
  /** A28：连通性自检。只返回检查项和状态，不返回密钥或底层报错原文 */
  async healthCheck(a: Actor) { this.guard(a); return { at: new Date().toISOString().slice(0, 16).replace('T', ' '), checks: await this.health.checks() }; }
}
