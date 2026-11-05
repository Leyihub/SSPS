import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';
import { LARK_DRIVE } from '../../ports/tokens';
import { ImportsService } from '../imports/imports.service';
import { MasterService } from '../master/master.service';
import { IssueScanService } from '../voyage/issue-scan.service';
import { AdminService } from './admin.service';
import { CompatService } from './compat.service';

/**
 * 定时任务（W31）。用平台的自动化触发器：应用启动时 @BindTrigger 自动向 trigger-server 注册，到点由平台调用，不走 HTTP、不需要令牌。
 * 触发器写法 `名称[cron 表达式]`（格式取自 @lark-apaas/nestjs-trigger 的文档示例 cron1[0 15 * * Fri]，时区待真实环境确认，见 docs/handoff/scheduled-jobs.md）。
 * 每个任务自己吞掉异常（只记日志）：单次失败不能影响下一次；导入、兼容表这类会写 D09 运行日志的，失败原因在日志里。
 */
@Automation()
@Injectable()
export class JobsAutomation {
  private readonly log = new Logger('Jobs');
  constructor(
    private readonly imports: ImportsService, private readonly master: MasterService, private readonly scanner: IssueScanService,
    private readonly admin: AdminService, private readonly compat: CompatService,
    @Optional() @Inject(LARK_DRIVE) private readonly drive?: { listFolder(t: string): Promise<any>; download(t: string): Promise<Buffer> } | null,
  ) {}

  private async run<T>(name: string, fn: () => Promise<T>) {
    try { const r = await fn(); this.log.log(`${name} 完成：${JSON.stringify(r)}`); return r; }
    catch (e: any) { this.log.warn(`${name} 失败：${String(e?.message ?? e).slice(0, 300)}`); return null; }
  }

  @BindTrigger('cronPullBerthPlan[*/30 * * * *]', { actionName: 'PullBerthPlan', actionDesc: '每 30 分钟从云空间拉取新的靠船计划' })
  pullBerthPlan() { return this.run('拉取靠船计划', () => this.imports.pullFromDrive(this.drive as any, null)); }

  @BindTrigger('cronReplay[*/5 * * * *]', { actionName: 'ReplayWrites', actionDesc: '每 5 分钟补偿「飞书已写成功、镜像回写没做完」的记录' })
  replay() { return this.run('补偿重放', () => this.admin.replay(null)); }

  @BindTrigger('cronCompatDirty[*/10 * * * *]', { actionName: 'RefreshCompatIncremental', actionDesc: '每 10 分钟：航次保存过才刷新兼容表' })
  compatIncremental() { return this.run('兼容表增量刷新', () => this.compat.refresh(null, true)); }

  @BindTrigger('cronCompatFull[50 15 * * *]', { actionName: 'RefreshCompatFull', actionDesc: '每日 15:50 全量重写兼容表 T09a/T09b' })
  compatFull() { return this.run('兼容表全量刷新', () => this.compat.refresh(null, false)); }

  @BindTrigger('cronRecomputeRoutes[0 3 * * *]', { actionName: 'RecomputeRouteRules', actionDesc: '每日 03:00 重算航程规则的样本数与 P50/P80' })
  recomputeRoutes() { return this.run('航程重算', () => this.master.recomputeRouteRules(null)); }

  @BindTrigger('cronIssueScan[0 8 * * *]', { actionName: 'ScanDataIssues', actionDesc: '每日 08:00 扫描数据质量问题（缺 MMSI、ETA 超期未更新）' })
  issueScan() { return this.run('数据质量扫描', () => this.scanner.scan(null)); }
}
