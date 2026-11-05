import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { isInternalCall } from '../../common/internal-token';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { MasterService } from './master.service';

const KEY = 'x-idempotency-key';

@Controller('api')
@NeedLogin()
export class MasterController {
  constructor(private readonly svc: MasterService) {}
  private who(req: Request) { return this.svc.actor(req.userContext as any); }

  @Get('me') async me(@Req() req: Request) { return this.svc.me(await this.who(req)); }

  @Get('ports') ports(@Query('q') q?: string) { return this.svc.ports(q); }
  @Post('ports') async addPort(@Body() b: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.addPort(b, await this.who(req), key); }
  @Patch('ports/:en') async patchPort(@Param('en') en: string, @Body() b: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.patchPort(en, b, await this.who(req), key); }

  @Get('berths') berths() { return this.svc.berths(); }
  @Post('berths') async addBerth(@Body() b: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.addBerth(b, await this.who(req), key); }
  @Patch('berths/:code') async patchBerth(@Param('code') code: string, @Body() b: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.patchBerth(code, b, await this.who(req), key); }

  @Get('vessels') vessels(@Query('q') q?: string) { return this.svc.vessels(q); }
  @Post('vessels') async addVessel(@Body() b: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.addVessel(b, await this.who(req), key); }
  @Patch('vessels/:id') async patchVessel(@Param('id') id: string, @Body() b: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.patchVessel(id, b, await this.who(req), key); }

  @Get('route-rules') routeRules() { return this.svc.routeRules(); }
  @Post('route-rules') async addRule(@Body() b: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.addRouteRule(b, await this.who(req), key); }
  @Patch('route-rules/:id') async patchRule(@Param('id') id: string, @Body() b: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.patchRouteRule(id, b, await this.who(req), key); }
  /** A06：重算航程规则。系统管理员，或定时任务带内部令牌（x-internal-token） */
  @Post('route-rules/recompute') async recompute(@Req() req: Request, @Headers('x-internal-token') token?: string) { return this.svc.recomputeRouteRules(isInternalCall(token) ? null : await this.who(req)); }
}
