import { Controller, Get, Query } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { CapacityService } from './capacity.service';
import { CalendarQueryDto, DayQueryDto } from './capacity.dto';

const DEFAULT_TONS = 50000;     // 港口日历默认 5 万吨档（锁定规则 3）

@Controller('api/capacity')
@NeedLogin()
export class CapacityController {
  constructor(private readonly svc: CapacityService) {}
  @Get('calendar') calendar(@Query() q: CalendarQueryDto) { return this.svc.calendar(q.tons ?? DEFAULT_TONS, q.days ?? 30); }
  @Get('day') day(@Query() q: DayQueryDto) { return this.svc.day(q.date, q.tons ?? DEFAULT_TONS); }
}
