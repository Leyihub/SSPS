import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { FLAGS, ETA_BASIS, MILESTONE_FIELDS } from '../../domain/voyage';
import { BIZ } from '../../domain/status';

export class CargoLineDto {
  @IsOptional() @IsString() contract?: string;
  @IsOptional() @IsString() ea?: string;
  @IsOptional() @IsString() big?: string;
  @IsOptional() @IsString() kind?: string;
  @IsString() name!: string;
  @IsOptional() @IsString() alias?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() dept2?: string;
  @IsOptional() @IsString() party?: string;
  @Type(() => Number) @IsNumber() @Min(0) tons!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) loadTons?: number;
  @IsOptional() @Type(() => Number) @IsNumber() dry?: number;
  @IsOptional() @IsString() over?: string;
  @IsOptional() @IsString() exec?: string;
}

/** 新建航次：基础字段放在同一层，字段是否允许、日期是否合法由服务统一校验（和 PATCH 同一套规则） */
export class CreateVoyageDto {
  @IsIn(Object.values(BIZ)) biz!: string;
  @IsString() load!: string;
  @IsString() disch!: string;
  @IsOptional() @IsString() attr?: string;
  @IsOptional() @IsString() no?: string;
  @IsOptional() @IsString() vessel?: string;
  @IsOptional() @IsString() carrier?: string;
  @IsOptional() @IsString() shipVoy?: string;
  @IsOptional() @IsString() disch2?: string;
  @IsOptional() @IsString() finalPort?: string;
  @IsOptional() @IsString() laycanS?: string;
  @IsOptional() @IsString() laycanE?: string;
  @IsOptional() @IsString() planLoadArr?: string;
  @IsOptional() @IsString() planLoadDep?: string;
  @IsOptional() @IsString() planDischS?: string;
  @IsOptional() @IsString() planDischE?: string;
  @IsOptional() @IsString() eta?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) planBerths?: string[];
  @IsOptional() @IsBoolean() focus?: boolean;
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CargoLineDto) cargo?: CargoLineDto[];
}

export class MilestoneDto {
  @IsIn(MILESTONE_FIELDS as readonly string[]) field!: string;
  @IsString() value!: string;
}

export class EtaDto {
  @IsString() eta!: string;
  @IsIn(ETA_BASIS as readonly string[]) basis!: string;
}

export class FlagDto {
  @IsIn(FLAGS as readonly string[]) flag!: string;
  @IsBoolean() on!: boolean;
}

export class ListQuery {
  @IsOptional() @IsString() biz?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

