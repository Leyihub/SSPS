import { Body, Controller, Get, Headers, HttpStatus, Inject, Optional, Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { LARK_DRIVE } from '../../ports/tokens';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { IsArray, IsObject, IsOptional, IsString, Matches } from 'class-validator';
import { ImportsService } from './imports.service';

const KEY = 'x-idempotency-key';
const UPLOAD = FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } });
type Upload = { originalname: string; buffer: Buffer };

/** Excel 在浏览器里先解析成「表头 → 值」的行再上传；服务端同样支持直接收 .xlsx（见 excel.controller） */
export class ImportDto {
  @IsString() fileName!: string;
  @IsArray() @IsObject({ each: true }) rows!: Array<Record<string, unknown>>;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '计划日期必须是 YYYY-MM-DD' }) planDate?: string;
}

export class TrendDto {
  @IsString() name!: string;
  @IsOptional() @IsArray() @IsObject({ each: true }) marks?: Array<{ d: number; tons: number }>;
  @IsOptional() until?: number;
}

@Controller('api/berth-plans')
@NeedLogin()
export class BerthPlanController {
  constructor(private readonly svc: ImportsService, @Optional() @Inject(LARK_DRIVE) private readonly drive?: { listFolder(t: string): Promise<any>; download(t: string): Promise<Buffer> } | null) {}
  @Post('import') async import(@Body() dto: ImportDto, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.importBerthPlan(dto, await this.svc.actor(req.userContext as any), key); }
  @Post('import-file') @UseInterceptors(UPLOAD) async importFile(@UploadedFile() file: Upload, @Body('planDate') planDate: string | undefined, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.importBerthPlan({ ...this.svc.parseUpload(file), planDate: planDate || undefined }, await this.svc.actor(req.userContext as any), key); }
  /** A18：从云空间文件夹拉取新的靠船计划。系统管理员，或自动化触发器带内部令牌（请求头 x-internal-token = 环境变量 INTERNAL_JOB_TOKEN） */
  @Post('pull') async pull(@Req() req_: Request, @Headers('x-internal-token') token?: string) {
    const expect = process.env.INTERNAL_JOB_TOKEN, internal = !!(expect && token && token.length === expect.length && timingSafeEqual(Buffer.from(token), Buffer.from(expect)));
    if (!internal) { const a = await this.svc.actor(req_.userContext as any); if (a.role !== '系统管理员') throw new BusinessException(ResponseCode.FORBIDDEN, '只有系统管理员或定时任务可以触发拉取', HttpStatus.FORBIDDEN); }
    const folder = process.env.DRIVE_FOLDER_TOKEN_BERTH_PLAN;
    if (!this.drive || !folder) throw new BusinessException(ResponseCode.SERVICE_UNAVAILABLE, '云空间拉取未配置：需要环境变量 LARK_APP_ID、LARK_APP_SECRET、DRIVE_FOLDER_TOKEN_BERTH_PLAN', HttpStatus.SERVICE_UNAVAILABLE);
    return this.svc.pullBerthPlans(this.drive as any, folder, null);
  }
  @Get('batches') batches() { return this.svc.berthBatches(); }
  @Get('batches/:batchNo/rows') rows(@Param('batchNo') batchNo: string, @Query('status') status?: string) { return this.svc.berthBatchRows(batchNo, status); }
}

@Controller('api/inventory')
@NeedLogin()
export class InventoryController {
  constructor(private readonly svc: ImportsService) {}
  @Get() list() { return this.svc.inventory(); }
  @Get('batches') batches() { return this.svc.inventoryBatches(); }
  @Post('trend') trend(@Body() dto: TrendDto) { return this.svc.inventoryTrend(dto.name, dto.marks ?? [], dto.until); }
  @Post('import-file') @UseInterceptors(UPLOAD) async importFile(@UploadedFile() file: Upload, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.importInventory(this.svc.parseUpload(file), await this.svc.actor(req.userContext as any), key); }
  @Post('import') async import(@Body() dto: ImportDto, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.importInventory(dto, await this.svc.actor(req.userContext as any), key); }
}
