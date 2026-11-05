// 主数据（T01 港口、T02 泊位、T03 船舶、T08 航程规则）的行形状。泊位和航程规则的形状在 types.ts。
export interface PortRow { code: string; en: string; cn: string; alias: string[]; country: string; region: string; kind: '内港' | '外港'; isLocal: boolean; status: '启用' | '停用' }
export interface VesselRow { id: string; name: string; alias: string[]; mmsi: string | null; imo: string | null; type: string; dwt: number | null; length: number | null; tier: string | null }

export const COUNTRIES = ['印度尼西亚', '中国', '菲律宾', '越南', '其他'];
export const VESSEL_TYPES = ['散货船', '拖驳组合', '集装箱船', '杂货船', '其他'];
export const TERMINALS = ['北区码头', '拉博塔码头'];

const norm = (s: string) => String(s || '').toUpperCase().replace(/[\s\-_.]/g, '');
/** 港口模糊匹配：英文名、中文名、别名，大小写和空格不敏感 */
export const portMatches = (p: PortRow, q: string) => [p.en, p.cn, ...p.alias].some((x) => norm(x).includes(norm(q)));
export const vesselMatches = (v: VesselRow, q: string) => [v.name, ...v.alias, v.mmsi || '', v.imo || ''].some((x) => x && norm(x).includes(norm(q)));
export const vesselKeys = (v: Pick<VesselRow, 'name' | 'alias'>) => [v.name, ...v.alias].map(norm).filter(Boolean);
