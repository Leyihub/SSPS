import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';

export class CalendarQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) tons?: number;            // 货量档，默认 5 万吨
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) days?: number;      // 天数，默认 30
}
export class DayQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '日期必须是 YYYY-MM-DD' }) date!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) tons?: number;
}
