// 本地开发用的内置数据：真实的 23 个泊位容量（泊位容量表 2026-10-08）和估算版经验航程。
// 没有靠船计划、航次、库存时，预测会如实提示「无数据」，不会编数。真实数据来自应用库和飞书（建库、同步后接入）。
import type { Berth, RouteRuleRow, Snapshot } from '../../domain/types';
import type { PortRow } from '../../domain/master';

const CAP: Record<string, number> = { F1: 18, F2: 10, F3: 5, F4: 7, F5: 5, F7: 3, F8: 1.5, F9: 5, F10: 6, F11: 2.5, L4: 7.5, L6: 7.5, L7: 7.5, L8: 3, L11: 1, L12: 10, LN16: 1, LN17: 1, LN18: 1, LN19: 1, LN20: 1, LN21: 1, LN22: 1 };
export const SEED_BERTHS: Berth[] = Object.entries(CAP).map(([code, w]) => ({ code, terminal: code.startsWith('F') ? '北区码头' : '拉博塔码头', capacity: Math.round(w * 10000), status: '启用', basis: '泊位容量表 2026-10-08' }));

const R = (id: string, load: string, disch: string, biz: RouteRuleRow['biz'], exp: number, expMax: number): RouteRuleRow => ({ id, load, disch, biz, exp, expMax, samples: 0, p50: null, p80: null, status: '启用' });
export const SEED_RULES: RouteRuleRow[] = [
  R('R-001', 'SURIGAO', 'BAHODOPI', ['大宗采购船'], 5, 7), R('R-002', 'TAGANITO', 'BAHODOPI', ['大宗采购船'], 5, 7),
  R('R-003', 'JAKARTA', 'BAHODOPI', ['大宗采购船', '物资备件船'], 6, 8), R('R-004', 'SURABAYA', 'BAHODOPI', ['大宗采购船', '物资备件船'], 5, 7),
  R('R-005', 'SINGAPORE', 'BAHODOPI', ['物资备件船'], 8, 10), R('R-006', 'QINHUANGDAO', 'BAHODOPI', ['大宗采购船'], 14, 18),
  R('R-007', 'TANGSHAN', 'BAHODOPI', ['大宗采购船'], 14, 18), R('R-008', 'TIANJIN', 'BAHODOPI', ['大宗采购船'], 14, 18),
  R('R-009', 'BAHODOPI', 'HAIPHONG', ['成品销售船'], 9, 12), R('R-010', 'BAHODOPI', 'TIANJIN', ['成品销售船'], 14, 18),
];
export const SEED_PORTS: Snapshot['ports'] = [
  { en: 'BAHODOPI', cn: 'IMIP港口', alias: ['巴浩多比', '莫罗瓦利', 'IMIP', '德信本港'], isLocal: true }, { en: 'SURIGAO', cn: '苏里高', isLocal: false }, { en: 'TAGANITO', cn: '塔加尼托', isLocal: false },
  { en: 'JAKARTA', cn: '雅加达', isLocal: false }, { en: 'SURABAYA', cn: '泗水', isLocal: false }, { en: 'SINGAPORE', cn: '新加坡', isLocal: false },
  { en: 'QINHUANGDAO', cn: '秦皇岛', isLocal: false }, { en: 'TANGSHAN', cn: '唐山', alias: ['京唐港'], isLocal: false }, { en: 'TIANJIN', cn: '天津', isLocal: false }, { en: 'HAIPHONG', cn: '海防', isLocal: false },
];
export const seedSnapshot = (today: string): Snapshot => ({ today, berths: SEED_BERTHS, planRows: [], berthPlanBatch: null, voyages: [], routeRules: SEED_RULES, inventory: { batchNo: null, items: [] }, ports: SEED_PORTS });

/** 内置主数据：港口、泊位、航程规则（船舶没有种子，业务员录入） */
const COUNTRY: Record<string, string> = { BAHODOPI: '印度尼西亚', JAKARTA: '印度尼西亚', SURABAYA: '印度尼西亚', SURIGAO: '菲律宾', TAGANITO: '菲律宾', SINGAPORE: '其他', HAIPHONG: '越南' };
export function seedMaster() {
  return {
    ports: SEED_PORTS.map((p): PortRow => ({ code: '', en: p.en, cn: p.cn, alias: p.alias || [], country: COUNTRY[p.en] || '中国', region: '', kind: p.isLocal ? '内港' : '外港', isLocal: p.isLocal, status: '启用' })),
    berths: SEED_BERTHS,
    routeRules: SEED_RULES,
  };
}
