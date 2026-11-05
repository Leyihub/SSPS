// 航次领域模型（T04 航次主表、T05 货物明细、T06 大宗卸船结算、T07 成品销售扩展）。字段名对照 docs/schema 与原型 mock-data。
import { BIZ, LOCAL_PORT } from './status';

export type Role = '业务员' | '部门主管' | '物流管理员' | '系统管理员';
export type Dept = '大宗采购部' | '商务海运部' | '仓储物流部';
export interface Actor { userId: string; name: string; role: Role; dept: Dept | null }

export const FLAGS = ['取消', '延期', '移泊', '改港'] as const;
export const ETA_BASIS = ['船讯网', '船代', '电话'] as const;

export interface Voyage {
  id: string; biz: string; attr: string; no: string; vessel: string | null; carrier: string; shipVoy: string;
  load: string; disch: string; disch2: string | null; finalPort: string | null;
  laycanS: string | null; laycanE: string | null;
  planLoadArr: string | null; actLoadArr: string | null; loadBerth: string | null; planLoadDep: string | null; actLoadDep: string | null;
  planDischS: string | null; planDischE: string | null; eta: string | null; etaUpdated: string | null;
  actDischArr: string | null; dischBerth: string | null; dischDep: string | null;
  planBerths: string[]; actBerths: string[]; flags: string[];
  owner: string; ownerId?: string; dept: string; focus: boolean; review: string; source: string; readonly: boolean; remark: string;
  status?: string;
}
export interface CargoLine {
  no: string; voyage: string; contract: string; ea: string; big: string; kind: string; name: string; alias: string; unit: string; dept2: string; party: string;
  tons: number; loadTons: number | null; dry: number | null; over: string; inspector?: string; exec: string;
}
export type Settlement = Record<string, string | number | boolean | null>;
export const SALES_WAYS = ['CFR', 'FOB'] as const;
export interface SalesExt { way: string | null; contract: string | null }          // 租船方式（CFR / FOB）、海运合同号（T07）

/** 航次基础字段里允许修改的（不含状态、负责人转移走单独规则、只读标记由系统写入） */
export const VOYAGE_EDITABLE: Record<string, string> = {
  biz: '业务类型', attr: '业务属性', no: '船次号', vessel: '船舶', carrier: '承运方', shipVoy: '船方航次号',
  load: '装港', disch: '卸港', disch2: '第二卸港', finalPort: '最终目的港',
  laycanS: '受载期始', laycanE: '受载期止', planLoadArr: '计划抵装港', actLoadArr: '实际抵装港', loadBerth: '装港靠泊', planLoadDep: '计划离装港', actLoadDep: '实际离装港',
  planDischS: '计划抵卸港窗口始', planDischE: '计划抵卸港窗口止', actDischArr: '实际抵卸港', dischBerth: '卸港靠泊', dischDep: '卸港离港',
  planBerths: '计划泊位', actBerths: '实际泊位', focus: '重点关注', review: '审核状态', remark: '备注',
};
export const MILESTONE_FIELDS = ['actLoadArr', 'loadBerth', 'actLoadDep', 'actDischArr', 'dischBerth', 'dischDep'] as const;

// T06 字段分组：作业数据（大宗采购部 + 仓储物流部）与费用结算（仅大宗采购部），键名对照原型
export const OPS_KEYS = ['terms', 'rate', 'allowDays', 'turn', 'gauge', 'g1', 'g2', 'g3', 'truck', 'belt', 'weigh', 'other', 'carTurn', 'x1Cars', 'crossTruck', 'crossBelt', 'beltOff3', 'beltOff4', 'sendDay', 'backDay', 'noHandover', 'rain', 'issue'] as const;
export const MONEY_KEYS = ['demRate', 'demCur', 'demUsd', 'fx', 'portUnit', 'portFee', 'loadFee'] as const;
/** 结算字段的取值类型：数字 / 日期（YYYY-MM-DD）/ 勾选 / 文本；币种只能 IDR 或 USD */
export const BOOL_KEYS = new Set(['noHandover', 'rain']);
export const DATE_KEYS_SETTLE = new Set(['sendDay', 'backDay']);
export const TEXT_KEYS = new Set(['terms', 'issue', 'demCur']);
export const MONEY_LABEL: Record<string, string> = { demRate: '滞期费率', demCur: '币种', demUsd: '滞期费 / 速遣费', fx: '汇率', portUnit: '港务费单价', portFee: '港务费', loadFee: '装卸费' };

/** 本港侧 */
export const sideOfVoyage = (v: Pick<Voyage, 'load'>) => (v.load === LOCAL_PORT ? '装' : '卸');
/** 本港侧日期：有实际取实际，否则取计划（列表按它排序和筛选） */
export function localDate(v: Voyage): { plan: string | null; act: string | null } {
  return sideOfVoyage(v) === '装' ? { plan: v.laycanS, act: v.actLoadArr } : { plan: v.planDischS, act: v.actDischArr };
}
export const isBulk = (v: Pick<Voyage, 'biz'>) => v.biz === BIZ.BULK;
export const isProduct = (v: Pick<Voyage, 'biz'>) => v.biz === BIZ.PRODUCT;
