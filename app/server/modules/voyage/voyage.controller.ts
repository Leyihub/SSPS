import { Body, Controller, Delete, Get, Headers, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import type { Request } from 'express';
import { isInternalCall } from '../../common/internal-token';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { VoyageService } from './voyage.service';
import { IssueScanService } from './issue-scan.service';
import { CargoLineDto, CreateVoyageDto, EtaDto, FlagDto, ListQuery, MilestoneDto } from './voyage.dto';

const KEY = 'x-idempotency-key';

@Controller('api/voyages')
@NeedLogin()
export class VoyageController {
  constructor(private readonly svc: VoyageService) {}
  private who(req: Request) { return this.svc.actor(req.userContext as any); }

  @Get() async list(@Query() q: ListQuery, @Req() req: Request) { return this.svc.list(q, await this.who(req)); }
  @Get(':id') async detail(@Param('id') id: string, @Req() req: Request) { return this.svc.get(id, await this.who(req)); }
  @Post() async create(@Body() dto: CreateVoyageDto, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.create(dto, await this.who(req), key); }
  @Patch(':id') async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.update(id, body, await this.who(req), key); }
  @Post(':id/milestones') async milestone(@Param('id') id: string, @Body() dto: MilestoneDto, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.milestone(id, dto.field, dto.value, await this.who(req), key); }
  @Post(':id/eta') async eta(@Param('id') id: string, @Body() dto: EtaDto, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.reviseEta(id, dto.eta, dto.basis, await this.who(req), key); }
  @Post(':id/flags') async flag(@Param('id') id: string, @Body() dto: FlagDto, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.setFlag(id, dto.flag, dto.on, await this.who(req), key); }

  @Post(':id/cargo-lines') async addCargo(@Param('id') id: string, @Body() dto: CargoLineDto, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.addCargo(id, dto as any, await this.who(req), key); }
  @Patch(':id/cargo-lines/:no') async updateCargo(@Param('id') id: string, @Param('no') no: string, @Body() body: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.updateCargo(id, no, body, await this.who(req), key); }
  @Delete(':id/cargo-lines/:no') async deleteCargo(@Param('id') id: string, @Param('no') no: string, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.deleteCargo(id, no, await this.who(req), key); }

  @Patch(':id/bulk-settlement') async settlement(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.patchSettlement(id, body, await this.who(req), key); }
  @Patch(':id/sales-ext') async sales(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.patchSalesExt(id, body, await this.who(req), key); }
}

@Controller('api/data-issues')
@NeedLogin()
export class DataIssueController {
  constructor(private readonly svc: VoyageService, private readonly scanner: IssueScanService) {}
  /** W34：数据质量扫描（缺 MMSI、ETA 超期未更新；条件消失自动关闭）。系统管理员，或定时任务带 x-internal-token */
  @Post('scan') async scan(@Req() req: Request, @Headers('x-internal-token') token?: string) {
    const internal = isInternalCall(token);
    return this.scanner.scan(internal ? null : await this.svc.actor(req.userContext as any));
  }
  @Get() list(@Query('status') status?: string, @Query('owner') owner?: string, @Query('type') type?: string) { return this.svc.issues({ status, owner, type }); }
  @Patch(':id') async close(@Param('id') id: string, @Body() b: { status?: string }, @Req() req: Request) {
    if (b?.status !== '已关闭' && b?.status !== '处理中') throw new BusinessException(ResponseCode.VALIDATION_ERROR, '问题状态只能改为「处理中」或「已关闭」', HttpStatus.UNPROCESSABLE_ENTITY);
    return this.svc.updateIssue(id, b.status, await this.svc.actor(req.userContext as any));
  }
}
