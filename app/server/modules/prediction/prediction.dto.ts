import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { BIZ_TYPES, PLAN_LABELS } from '@shared/api.interface';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PredictDto {
  @IsIn(BIZ_TYPES as readonly string[]) biz!: string;
  @Type(() => Number) @IsNumber() @Min(1) tons!: number;
  @IsString() load!: string;                              // 装港英文标准名
  @IsString() disch!: string;                             // 卸港英文标准名
  @Matches(ISO_DATE, { message: '窗口始必须是 YYYY-MM-DD' }) winStart!: string;
  @Matches(ISO_DATE, { message: '窗口止必须是 YYYY-MM-DD' }) winEnd!: string;
  @IsOptional() @Transform(({ obj, key, value }) => (obj[key] === '' ? undefined : value)) @IsString() item?: string;     // 库存品名
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(14) buffer?: number;                                              // 缓冲天数
}

export class AdoptDto {
  @IsIn(PLAN_LABELS as readonly string[]) label!: string;
}

export class AnnounceDto {
  @IsIn(PLAN_LABELS as readonly string[]) label!: string;
}

export class ParseDto {
  @IsString() text!: string;
  @IsOptional() overrides?: { biz?: string; item?: string; tons?: number; load?: string; disch?: string; b?: string };
}
