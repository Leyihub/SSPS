import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { AdminService } from './admin.service';

@Controller('api')
@NeedLogin()
export class AdminController {
  constructor(private readonly svc: AdminService) {}
  @Get('admin/sync-logs') async logs(@Query('failOnly') failOnly: string | undefined, @Req() req: Request) { return this.svc.syncLogs(await this.svc.actor(req.userContext as any), failOnly === '1' || failOnly === 'true'); }
  @Get('health') async health(@Req() req: Request) { return this.svc.healthCheck(await this.svc.actor(req.userContext as any)); }
}
