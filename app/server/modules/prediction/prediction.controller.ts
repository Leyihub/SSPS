import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { PredictionService } from './prediction.service';
import { AdoptDto, AnnounceDto, ParseDto, PredictDto, StockPlanDto } from './prediction.dto';

@Controller('api/predictions')
@NeedLogin()
export class PredictionController {
  constructor(private readonly svc: PredictionService) {}

  @Post() predict(@Body() dto: PredictDto, @Req() req: Request) { return this.svc.predict(dto, req.userContext); }
  @Post('stock-plan') stockPlan(@Body() dto: StockPlanDto) { return this.svc.stockPlan(dto); }
  @Post('parse') parse(@Body() dto: ParseDto) { return this.svc.parse(dto.text, dto.overrides); }
  @Get(':runNo') detail(@Param('runNo') runNo: string) { return this.svc.detail(runNo); }
  @Post(':runNo/adopt') adopt(@Param('runNo') runNo: string, @Body() dto: AdoptDto, @Req() req: Request, @Headers('x-idempotency-key') key?: string) { return this.svc.adopt(runNo, dto.label, req.userContext, dto.voyageId, key); }
  @Post(':runNo/announcement') announce(@Param('runNo') runNo: string, @Body() dto: AnnounceDto, @Req() req: Request) { return this.svc.announce(runNo, dto.label, req.userContext); }
}
