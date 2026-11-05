// 数据质量扫描（W34 B1）：缺 MMSI、ETA 超期未更新的自动生成与自动关闭；内存和真实仓储各跑一遍
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { VoyageService } from '../modules/voyage/voyage.service';
import { IssueScanService } from '../modules/voyage/issue-scan.service';
import { MemoryVoyageStore } from '../adapters/memory/memory-voyage-store';
import { MemoryMasterStore } from '../adapters/memory/memory-master-store';
import { seedMaster } from '../adapters/memory/seed';
import type { Actor } from '../domain/voyage';
import { realVoyageEnv } from './helpers/real-env';

const lin: Actor = { userId: 'u-lin', name: '林海川', role: '业务员', dept: '大宗采购部' }, admin: Actor = { userId: 'a', name: '管理员', role: '系统管理员', dept: null };
const closers: Array<() => Promise<unknown>> = []; after(async () => { for (const c of closers) await c(); });
const body = { biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', vessel: 'MV TEST', planDischS: '2026-11-10', planDischE: '2026-11-12', eta: '2026-11-11 08:00', cargo: [{ name: '镍矿', tons: 1000 }] };

for (const mode of ['memory', 'drizzle'] as const) {
  const mk = async () => {
    let store: any, master: any;
    if (mode === 'drizzle') { const e = await realVoyageEnv({ 'u-lin': { name: '林海川', feishuId: 'fs_lin' } }); store = e.store; master = e.master; closers.push(e.close); }
    else { store = new MemoryVoyageStore(); master = new MemoryMasterStore(seedMaster()); await master.saveVessel({ name: 'MV TEST', alias: [], mmsi: null, imo: null, type: '散货船', dwt: null, length: null, tier: null }); }
    const svc = new VoyageService(store, { resolve: async () => lin } as any), scan = new IssueScanService(store, master, { resolve: async () => admin } as any);
    svc.clock = () => new Date('2026-11-05T08:30:00Z');
    return { store, master, svc, scan };
  };
  const open = async (store: any, type: string) => (await store.issues()).filter((i: any) => i.type === type && i.status !== '已关闭');

  test(`${mode} · 缺 MMSI：生成一次不重复；补了 MMSI 后下一次扫描自动关闭`, async () => {
    const { store, master, svc, scan } = await mk();
    const { voyage } = await svc.create({ ...body } as any, lin);
    assert.deepEqual(await scan.scan(admin), { created: 1, closed: 0, open: 1 });
    assert.equal((await scan.scan(null)).created, 0, '重复扫描不重复生成');
    const [i] = await open(store, '缺 MMSI'); assert.equal(i.object, voyage.id); assert.equal(i.owner, '林海川'); assert.match(i.note, /MV TEST/);
    const v = (await master.vessels()).find((x: any) => x.name === 'MV TEST'); await master.saveVessel({ ...v, mmsi: '412345678' });
    assert.deepEqual(await scan.scan(null), { created: 0, closed: 1, open: 0 });
    const closed = (await store.issues()).find((x: any) => x.id === i.id); assert.equal(closed.status, '已关闭'); assert.equal(closed.closedBy, '系统');
  });

  test(`${mode} · ETA 超期未更新：超过阈值才生成；修订 ETA 后自动关闭；已抵港和已结束的不算`, async () => {
    const { store, master, svc, scan } = await mk();
    const v = (await master.vessels()).find((x: any) => x.name === 'MV TEST'); await master.saveVessel({ ...v, mmsi: '412345678' });   // 只看 ETA，不要 MMSI 干扰
    const { voyage } = await svc.create({ ...body } as any, lin);                                         // etaUpdated = 2026-11-05
    scan.clock = () => new Date('2026-11-08T08:30:00Z'); assert.equal((await scan.scan(admin)).open, 0, '刚好 3 天不算超期（超过才算）');
    scan.clock = () => new Date('2026-11-09T08:30:00Z'); assert.deepEqual(await scan.scan(admin), { created: 1, closed: 0, open: 1 });
    assert.equal((await open(store, 'ETA 超期未更新')).length, 1);
    svc.clock = () => new Date('2026-11-09T09:00:00Z'); await svc.reviseEta(voyage.id, '2026-11-12 08:00', '船代', lin);
    assert.deepEqual(await scan.scan(admin), { created: 0, closed: 1, open: 0 });
    // 已抵卸港：即使 ETA 很久没更新也不算
    scan.clock = () => new Date('2026-12-20T00:00:00Z'); await svc.milestone(voyage.id, 'actLoadArr', '2026-11-06 08:00', lin).catch(() => 0);
    await store.update(voyage.id, { actDischArr: '2026-11-12 10:00' }); assert.equal((await scan.scan(admin)).open, 0);
  });

  test(`${mode} · 只有系统管理员或定时任务能触发扫描`, async () => {
    const { scan } = await mk();
    await assert.rejects(scan.scan(lin), (e: any) => e.httpStatus === 403);
  });
}
