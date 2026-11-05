// 真实仓储的测试环境：PGlite（真实建库 SQL + 镜像表）+ 假的飞书多维表格。镜像表由飞书同步填充，所以这里预置时同时写飞书和镜像。
import { createOutbox } from '../../lark/outbox';
import { createDrizzleOutboxStore } from '../../lark/outbox-store';
import { mBerth, mPort, mRouteRule } from '../../database/schema';
import { seedMaster } from '../../adapters/memory/seed';
import { DrizzleMasterStore } from '../../adapters/drizzle/drizzle-master-store';
import { DrizzleVoyageStore } from '../../adapters/drizzle/drizzle-voyage-store';
import { MemoryUserLookup } from '../../adapters/memory/memory-user-lookup';
import { F } from '../../lark/fieldmap';
import { FakeBase } from './fake-base';
import { testDb } from './pg';

export async function realMasterEnv(seed = true) {
  const t = await testDb(), fake = new FakeBase(), outbox = createOutbox(createDrizzleOutboxStore(t.db as any));
  const master = new DrizzleMasterStore(t.db as any, fake, outbox);
  if (seed) {
    const s = seedMaster(), ridPort = new Map<string, string>();
    for (const p of s.ports) {
      const rid = fake.seed('T01', { [F.T01.code]: p.code || '', [F.T01.cn]: p.cn, [F.T01.en]: p.en, [F.T01.alias]: p.alias.join('\n'), [F.T01.country]: p.country, [F.T01.kind]: p.kind, [F.T01.isLocal]: p.isLocal, [F.T01.status]: p.status }); ridPort.set(p.en, rid);
      await t.db.insert(mPort).values({ baseRecordId: rid, portCode: p.code || null, chineseName: p.cn, englishStandardName: p.en, alias: p.alias.join('\n') || null, country: p.country, region: null, nature: p.kind, isLocalPort: p.isLocal, status: p.status });
    }
    for (const b of s.berths) {
      const rid = fake.seed('T02', { [F.T02.code]: b.code, [F.T02.terminal]: b.terminal, [F.T02.capacity]: b.capacity, [F.T02.status]: b.status });
      await t.db.insert(mBerth).values({ baseRecordId: rid, berthCode: b.code, wharf: b.terminal, capacityTonnage: b.capacity, status: b.status, basisVersion: b.basis ?? null });
    }
    let n = 0;
    for (const r of s.routeRules) {
      const rid = fake.seed('T08', { [F.T08.load]: [ridPort.get(r.load)!], [F.T08.disch]: [ridPort.get(r.disch)!], [F.T08.biz]: r.biz, [F.T08.exp]: r.exp, [F.T08.expMax]: r.expMax, [F.T08.status]: r.status ?? '启用' });
      await t.db.insert(mRouteRule).values({ baseRecordId: rid, ruleNo: ++n, loadPort: ridPort.get(r.load)!, dischargePort: ridPort.get(r.disch)!, applicableBusinessType: r.biz as string[], experienceVoyageDay: String(r.exp), experienceVoyageMaxDay: String(r.expMax), sampleCount: 0, appStatus: r.status ?? '启用' });
    }
  }
  return { ...t, fake, outbox, master };
}

/** 航次的真实仓储环境：在主数据环境上再建航次仓储，并预置测试要用的船舶（航次的船舶必须在主数据里） */
export async function realVoyageEnv(users: Record<string, { name: string; feishuId?: string }> = {}, vessels: string[] = ['MV TEST', 'MV X']) {
  const env = await realMasterEnv();
  for (const name of vessels) await env.master.saveVessel({ name, alias: [], mmsi: null, imo: null, type: '散货船', dwt: null, length: null, tier: null });
  const lookup = new MemoryUserLookup(users), store = new DrizzleVoyageStore(env.db as any, env.fake, env.outbox, lookup);
  return { ...env, store, lookup };
}
