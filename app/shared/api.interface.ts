/* 前后端共享的类型写在这里 */

// 固定取值（状态、类型等）在这里定义一次，前后端都从这里导入，不另写取值数组或守卫：
// export const RECORD_TYPES = ['meeting', 'memo'] as const;
// export type RecordType = (typeof RECORD_TYPES)[number];
// export const isRecordType = (v: string): v is RecordType =>
//   (RECORD_TYPES as readonly string[]).includes(v);
// export const RECORD_TYPE_LABELS: Record<RecordType, string> = { meeting: '会议', memo: '备忘' };

// ---------- SSPS 业务取值（前后端共用，只在这里定义一次） ----------
export const BIZ_TYPES = ['大宗采购船', '成品销售船', '物资备件船'] as const;
export type BizType = (typeof BIZ_TYPES)[number];
export const PLAN_LABELS = ['A', 'B'] as const;          // 只出 Plan A / Plan B（锁定规则 5）
export type PlanLabel = (typeof PLAN_LABELS)[number];

// ---------- 接口响应形状（前端用；后端领域类型在 server/domain，字段名一致） ----------
export const STATUSES = ['待宣船', '未到装港', '装港等泊', '装港装货', '航行中', '卸港等泊', '卸港卸货', '已结束'] as const;
export const STATUS_CANCELLED = '已结束（取消）';
export const ROLES = ['业务员', '部门主管', '物流管理员', '系统管理员'] as const;
export const ETA_BASIS_LIST = ['船讯网', '船代', '电话'] as const;
export const FLAG_LIST = ['取消', '延期', '移泊', '改港'] as const;
export const LOCAL_PORT = 'BAHODOPI';

export interface MeResult { userId: string; name: string; role: (typeof ROLES)[number]; dept: string | null; today: string }

export interface VoyageListItem {
  id: string; biz: BizType; attr: string; no: string; vessel: string | null; load: string; disch: string; status: string; side: '装' | '卸';
  localPlan: string | null; localAct: string | null; eta: string | null; etaUpdated: string | null; owner: string; dept: string; flags: string[];
  focus: boolean; readonly: boolean; tons: number; pooled: boolean; missingDeparture: boolean; etaStale: boolean;
}
export interface VoyageListResult { total: number; page: number; pageSize: number; items: VoyageListItem[]; counts: { biz: Record<string, number>; status: Record<string, number> }; owners: string[] }

export interface VoyageFull {
  id: string; biz: BizType; attr: string; no: string; vessel: string | null; carrier: string; shipVoy: string;
  load: string; disch: string; disch2: string | null; finalPort: string | null;
  laycanS: string | null; laycanE: string | null; planLoadArr: string | null; actLoadArr: string | null; loadBerth: string | null; planLoadDep: string | null; actLoadDep: string | null;
  planDischS: string | null; planDischE: string | null; eta: string | null; etaUpdated: string | null; actDischArr: string | null; dischBerth: string | null; dischDep: string | null;
  planBerths: string[]; actBerths: string[]; flags: string[]; owner: string; dept: string; focus: boolean; review: string; source: string; readonly: boolean; remark: string; status: string;
}
export interface CargoLineRow {
  no: string; voyage: string; contract: string; ea: string; big: string; kind: string; name: string; alias: string; unit: string; dept2: string; party: string;
  tons: number; loadTons: number | null; dry: number | null; over: string; exec: string;
}
export interface EtaRevisionRow { voyage: string; node: string; old: string | null; nw: string; basis: string; by: string; at: string }
export interface ChangeLogRow { voyage: string; field: string; old: string | null; nw: string | null; by: string; at: string; masked?: boolean }
export interface VoyageDetail {
  voyage: VoyageFull; cargo: CargoLineRow[]; settlement: Record<string, string | number | boolean | null> | null; salesExt: { way: string | null; contract: string | null } | null;
  etaRevisions: EtaRevisionRow[]; changeLog: ChangeLogRow[];
  can: { edit: boolean; ops: boolean; money: boolean; sales: boolean; seeMoney: boolean };
}

export interface PortRowDto { en: string; cn: string; alias: string[]; country: string; region: string; kind: string; isLocal: boolean; status: string }
export interface BerthDto { code: string; terminal: string; capacity: number; status: string; category?: string; basis?: string; note?: string }
export interface VesselDto { id: string; name: string; alias: string[]; mmsi: string | null; imo: string | null; type: string; dwt: number | null; length: number | null; tier: string | null }
export interface RouteRuleDto { id: string; load: string; disch: string; biz: BizType[]; exp: number | null; expMax: number | null; samples: number; p50: number | null; p80: number | null; basis: string; effP50: number | null; effP80: number | null; status?: string }
export interface DataIssueDto { id: string; object: string; type: string; field?: string; note: string; owner: string; status: string }
export interface BerthBatchDto { batchNo: string; planDate: string; source: string; fileName: string; total: number; active: number; history: number; anomaly: number; coverTo: string | null; validation: string | null; status: string; isCurrent: boolean; importedBy: string; importedAt: string }
export interface InventoryItemDto { name: string; type: string; stock: number; daily: number; days: number; daysEstimated: boolean; validUntil: number | null; errorCount: number }
