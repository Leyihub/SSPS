// 港口、船舶、泊位的「记录 ID ↔ 业务名」对照。镜像表里的关联字段存的是飞书记录 ID（见 docs/schema/mirror-samples.md），
// 读的时候要翻成英文标准名、船名、泊位编码；写飞书时反过来翻成记录 ID。
import { mBerth, mPort, mVessel } from '../../database/schema';
import type { Db } from './db';

export interface Dict {
  portByRid: Map<string, string>; ridByPort: Map<string, string>;
  vesselByRid: Map<string, string>; ridByVessel: Map<string, string>;
  berthByRid: Map<string, string>; ridByBerth: Map<string, string>;
}
const up = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();

export async function loadDict(db: Db): Promise<Dict> {
  const [ports, vessels, berths] = await Promise.all([db.select({ r: mPort.baseRecordId, n: mPort.englishStandardName }).from(mPort), db.select({ r: mVessel.baseRecordId, n: mVessel.standardShipName }).from(mVessel), db.select({ r: mBerth.baseRecordId, n: mBerth.berthCode }).from(mBerth)]);
  const d: Dict = { portByRid: new Map(), ridByPort: new Map(), vesselByRid: new Map(), ridByVessel: new Map(), berthByRid: new Map(), ridByBerth: new Map() };
  for (const p of ports) if (p.r && p.n) { d.portByRid.set(p.r, p.n); d.ridByPort.set(up(p.n), p.r); }
  for (const v of vessels) if (v.r && v.n) { d.vesselByRid.set(v.r, v.n); d.ridByVessel.set(up(v.n), v.r); }
  for (const b of berths) if (b.r && b.n) { d.berthByRid.set(b.r, b.n); d.ridByBerth.set(up(b.n), b.r); }
  return d;
}
export const key = up;
/** jsonb 关联列 { link_record_ids: [...] | null } → 记录 ID 数组 */
export const linkIds = (j: unknown): string[] => { const a = (j as any)?.link_record_ids; return Array.isArray(a) ? a : []; };
export const linkJson = (ids: string[]) => ({ link_record_ids: ids.length ? ids : null });
