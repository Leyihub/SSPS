// 兼容表 T09a / T09b（A26）：列与 base-plan 一致、行内容、就地覆盖不清空、待刷新标记、权限
import test from 'node:test';
import assert from 'node:assert/strict';
import { CompatService } from '../modules/admin/compat.service';
import { VoyageService } from '../modules/voyage/voyage.service';
import { MemoryVoyageStore } from '../adapters/memory/memory-voyage-store';
import { MemoryMasterStore } from '../adapters/memory/memory-master-store';
import { MemoryDirectory } from '../adapters/memory/memory-directory';
import { MemorySyncLog } from '../adapters/memory/memory-sync-log';
import { seedMaster } from '../adapters/memory/seed';
import { COLS_A, COLS_B } from '../domain/compat-columns';
import type { Actor } from '../domain/voyage';
import { FakeBase, FIELDS } from './helpers/fake-base';

const lin: Actor = { userId: 'u-lin', name: '林海川', role: '业务员', dept: '大宗采购部' }, sale: Actor = { userId: 'u-s', name: '商务甲', role: '业务员', dept: '商务海运部' }, admin: Actor = { userId: 'a', name: '管理员', role: '系统管理员', dept: null };

async function env() {
  const store = new MemoryVoyageStore(), master = new MemoryMasterStore(seedMaster()), fake = new FakeBase(), log = new MemorySyncLog();
  await master.saveVessel({ name: 'MV BULK', alias: [], mmsi: '412000001', imo: '9000001', type: '散货船', dwt: null, length: null, tier: null });
  const svc = new VoyageService(store, new MemoryDirectory()); svc.clock = () => new Date('2026-11-05T08:30:00Z');
  const compat = new CompatService(store, master, fake, svc, log); compat.clock = () => new Date('2026-11-05T08:30:00Z');
  return { store, master, fake, svc, compat, log };
}
const bulk = { biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', vessel: 'MV BULK', planDischS: '2026-11-04', planDischE: '2026-11-06', laycanS: '2026-10-20', laycanE: '2026-10-22' };

test('列名和顺序与 base-plan.json 的 T09a（33 列）、T09b（87 列）完全一致', () => {
  assert.deepEqual([...COLS_A], Object.keys(FIELDS.T09a)); assert.deepEqual([...COLS_B], Object.keys(FIELDS.T09b));
  assert.equal(COLS_A.length, 33); assert.equal(COLS_B.length, 87);
});

test('刷新：大宗拼船两行进 T09b、成品和备件进 T09a；每行都带全部列；船舶 MMSI/IMO 来自主数据；耗时与在港按日期推导', async () => {
  const { svc, fake, compat, log } = await env();
  const { voyage: v } = await svc.create({ ...bulk, cargo: [{ name: '镍矿', tons: 30000, contract: 'C-1', big: '矿产' }, { name: '煤', tons: 20000 }] } as any, lin);
  await svc.milestone(v.id, 'actLoadArr', '2026-10-21 08:00', lin); await svc.milestone(v.id, 'actLoadDep', '2026-10-22 08:00', lin);
  await svc.milestone(v.id, 'actDischArr', '2026-11-04 08:00', lin); await svc.milestone(v.id, 'dischBerth', '2026-11-04 20:00', lin);
  await svc.patchSettlement(v.id, { rate: 8000, demUsd: -500, noHandover: true, rain: true }, lin);
  const p = (await svc.create({ biz: '成品销售船', load: 'BAHODOPI', disch: 'SINGAPORE', laycanS: '2026-11-08', laycanE: '2026-11-10', cargo: [{ name: '镍铁', tons: 8000, contract: 'S-9' }] } as any, sale)).voyage;
  await svc.patchSalesExt(p.id, { way: 'FOB', contract: 'SEA-7' }, sale);
  await svc.create({ biz: '物资备件船', load: 'SURIGAO', disch: 'BAHODOPI', cargo: [{ name: '备件', tons: 100 }] } as any, lin);
  const r = await compat.refresh(admin);
  assert.deepEqual([r.a, r.b], [2, 2]); assert.equal(fake.count('T09a'), 2); assert.equal(fake.count('T09b'), 2);
  const b = fake.all('T09b').map((x) => x.fields), first = b.find((f) => f['货物名称Nama.barang'] === '镍矿')!;
  assert.equal(first['MMSI'], '412000001'); assert.equal(first['IMO'], '9000001'); assert.equal(first['合同号Nomor.kontrak'], 'C-1');
  assert.equal(first['拼船情况Situasi.berbagi.perahu'], '拼船（2）'); assert.equal(first['总船重量Berat.Kapal'], '50000');
  assert.equal(first['等泊用时/小时'], '12.00'); assert.equal(first['等泊用时/天Tunggu/Hari'], '0.50'); assert.equal(first['卸率/吨Discharge Rate'], '8000');
  assert.equal(first['速遣费Dispatch'], '500'); assert.equal(first['滞期费Demurrage'], ''); assert.equal(first['交接状态1Status.serahterima.1'], '不用交接'); assert.equal(first['小雨保函Garansi.Hujan'], '是');
  assert.equal(first['今日在港'], '是', '靠泊日期 ≤ 今天且还没离港'); assert.equal(first['到港日'], '2026-11-04'); assert.equal(first['业务类型Tipe.Bisnis'], '大宗采购船');
  const a = fake.all('T09a').map((x) => x.fields), prod = a.find((f) => f['业务类型'] === '成品销售船')!;
  assert.equal(prod['租船方式'], 'FOB'); assert.equal(prod['海运合同号'], 'SEA-7'); assert.equal(prod['销售合同号'], 'S-9'); assert.equal(prod['货量（吨）'], '8000'); assert.equal(prod['装港'], 'BAHODOPI');
  assert.equal(a.find((f) => f['业务类型'] === '物资备件船')!['业务员'], '林海川');
  assert.deepEqual((await log.list())[0].type, '兼容表刷新');
});

test('整表重写不清空：行数变少时前面的行就地覆盖、多余的删除；行数变多时新增；记录 ID 不变', async () => {
  const { svc, fake, compat, store } = await env();
  const { voyage: v } = await svc.create({ ...bulk, cargo: [{ name: '甲', tons: 1 }, { name: '乙', tons: 2 }] } as any, lin);
  await compat.refresh(null); const ids = fake.all('T09b').map((x) => x.record_id); assert.equal(ids.length, 2);
  const lines = await store.cargo(v.id); await svc.deleteCargo(v.id, lines[1].no, lin);
  fake.log.length = 0; await compat.refresh(null);
  assert.deepEqual(fake.all('T09b').map((x) => x.record_id), [ids[0]]); assert.deepEqual(fake.log.map((l) => l.op + ':' + l.table), ['update:T09b', 'remove:T09b'], 'T09a 为空，不产生写入');
  await svc.addCargo(v.id, { name: '丙', tons: 3 }, lin); await svc.addCargo(v.id, { name: '丁', tons: 4 }, lin);
  await compat.refresh(null); assert.equal(fake.count('T09b'), 3); assert.equal(fake.all('T09b')[0].record_id, ids[0]);
});

test('待刷新标记：航次保存后置位，onlyIfDirty 在没有标记时直接跳过；刷新失败时标记保留', async () => {
  const { svc, fake, compat } = await env();
  assert.equal(compat.dirty, false); await svc.create({ ...bulk, cargo: [{ name: '甲', tons: 1 }] } as any, lin); assert.equal(compat.dirty, true);
  assert.equal((await compat.refresh(null, true)).skipped, false); assert.equal(compat.dirty, false);
  assert.equal((await compat.refresh(null, true)).skipped, true);
  await svc.create({ ...bulk, cargo: [{ name: '乙', tons: 1 }] } as any, lin); fake.failNext = '飞书错误 1254001';
  await assert.rejects(compat.refresh(null, true), /1254001/); assert.equal(compat.dirty, true, '失败后标记保留，下次还会刷');
});

test('权限：只有系统管理员或定时任务；没有飞书配置时 503', async () => {
  const { compat, store, master, svc } = await env();
  await assert.rejects(compat.refresh(lin), (e: any) => e.httpStatus === 403);
  const none = new CompatService(store, master, null, svc);
  await assert.rejects(none.refresh(admin), (e: any) => e.httpStatus === 503);
});
