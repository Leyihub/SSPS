import { Body, Controller, Get, Headers, Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
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

@Controller('api/berth-plans')
@NeedLogin()
export class BerthPlanController {
  constructor(private readonly svc: ImportsService) {}
  @Post('import') async import(@Body() dto: ImportDto, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.importBerthPlan(dto, await this.svc.actor(req.userContext as any), key); }
  @Post('import-file') @UseInterceptors(UPLOAD) async importFile(@UploadedFile() file: Upload, @Body('planDate') planDate: string | undefined, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.importBerthPlan({ ...this.svc.parseUpload(file), planDate: planDate || undefined }, await this.svc.actor(req.userContext as any), key); }
  @Get('batches') batches() { return this.svc.berthBatches(); }
  @Get('batches/:batchNo/rows') rows(@Param('batchNo') batchNo: string, @Query('status') status?: string) { return this.svc.berthBatchRows(batchNo, status); }
}

@Controller('api/inventory')
@NeedLogin()
export class InventoryController {
  constructor(private readonly svc: ImportsService) {}
  @Get() list() { return this.svc.inventory(); }
  @Get('batches') batches() { return this.svc.inventoryBatches(); }
  @Post('import-file') @UseInterceptors(UPLOAD) async importFile(@UploadedFile() file: Upload, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.importInventory(this.svc.parseUpload(file), await this.svc.actor(req.userContext as any), key); }
  @Post('import') async import(@Body() dto: ImportDto, @Req() req: Request, @Headers(KEY) key?: string) { return this.svc.importInventory(dto, await this.svc.actor(req.userContext as any), key); }
}
