// 领域数据的形状（引擎、服务、端口共用）。字段名对照 docs/schema 和 docs/schema/seed。
export type BizType = '大宗采购船' | '成品销售船' | '物资备件船';

export interface Berth { code: string; terminal: string; capacity: number; status: '启用' | '停用'; category?: string; basis?: string; note?: string }
export interface PlanRow { berth: string | null; inPool: boolean; start: string; end: string; eta: string; vessel: string; cargo: string; tons: number | null; matchVoyage?: string | null }
export interface VoyageLite { id: string; flags: string[]; winStart: string; winEnd: string; totalTons: number; vessel: string | null; load: string; disch: string; biz: BizType; localSide: '装' | '卸'; status: string }
export interface RouteRuleRow { id: string; load: string; disch: string; biz: BizType[]; exp: number | null; expMax: number | null; samples: number; p50: number | null; p80: number | null; tier?: string | null; status?: string }
export interface InventoryItem { name: string; type: string; stock: number; daily: number; days: number; daysEstimated?: boolean; series: Array<[number, number, number]>; validUntil?: number; errorCount?: number }

/** 一次预测/日历计算所需的全部数据快照（从应用库和镜像表读出） */
export interface Snapshot {
  today: string;                                           // YYYY-MM-DD
  berths: Berth[];
  planRows: PlanRow[];                                     // 靠船计划当前批次的 active 行
  berthPlanBatch: { batchNo: string; planDate: string; source: string; coverTo: string | null } | null;
  voyages: VoyageLite[];
  routeRules: RouteRuleRow[];
  inventory: { batchNo: string | null; items: InventoryItem[] };
  ports: Array<{ en: string; cn: string; alias?: string[]; isLocal: boolean }>;
}
