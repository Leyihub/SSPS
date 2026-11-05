import { timingSafeEqual } from 'crypto';
import { Controller, Get, Headers, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { AdminService } from './admin.service';
import { CompatService } from './compat.service';

@Controller('api')
@NeedLogin()
export class AdminController {
  constructor(private readonly svc: AdminService, private readonly compat: CompatService) {}
  @Get('admin/sync-logs') async logs(@Query('failOnly') failOnly: string | undefined, @Req() req: Request) { return this.svc.syncLogs(await this.svc.actor(req.userContext as any), failOnly === '1' || failOnly === 'true'); }
  @Get('health') async health(@Req() req: Request) { return this.svc.healthCheck(await this.svc.actor(req.userContext as any)); }
  /** W16：补偿重放。系统管理员，或定时任务带内部令牌（请求头 x-internal-token = 环境变量 INTERNAL_JOB_TOKEN） */
  @Post('admin/replay') async replay(@Req() req: Request, @Headers('x-internal-token') token?: string) {
    const expect = process.env.INTERNAL_JOB_TOKEN, internal = !!(expect && token && token.length === expect.length && timingSafeEqual(Buffer.from(token), Buffer.from(expect)));
    return this.svc.replay(internal ? null : await this.svc.actor(req.userContext as any));
  }
  /** A26：重写兼容表 T09a/T09b。系统管理员，或定时任务带内部令牌（每日 15:50 全量；onlyIfDirty=1 用于航次保存后的增量触发） */
  @Post('admin/compat/refresh') async compatRefresh(@Req() req: Request, @Query('onlyIfDirty') onlyIfDirty?: string, @Headers('x-internal-token') token?: string) {
    const expect = process.env.INTERNAL_JOB_TOKEN, internal = !!(expect && token && token.length === expect.length && timingSafeEqual(Buffer.from(token), Buffer.from(expect)));
    return this.compat.refresh(internal ? null : await this.svc.actor(req.userContext as any), onlyIfDirty === '1' || onlyIfDirty === 'true');
  }
}
