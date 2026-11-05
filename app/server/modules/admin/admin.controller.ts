import { Controller, Get, Post, Query, Req } from '@nestjs/common';
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
  /** W16：补偿重放。系统管理员手动触发；定时触发见 jobs.automation.ts */
  @Post('admin/replay') async replay(@Req() req: Request) { return this.svc.replay(await this.svc.actor(req.userContext as any)); }
  /** A26：重写兼容表 T09a/T09b。系统管理员手动触发；定时触发见 jobs.automation.ts */
  @Post('admin/compat/refresh') async compatRefresh(@Req() req: Request) { return this.compat.refresh(await this.svc.actor(req.userContext as any)); }
}
