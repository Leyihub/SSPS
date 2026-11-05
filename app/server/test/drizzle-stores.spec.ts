// Drizzle 适配器的契约测试：用 PGlite（内存 Postgres）+ 真实建库 SQL，验证写读往返、并发、唯一约束、事务。
import test from 'node:test';
import assert from 'node:assert/strict';
import { PredictionService } from '../modules/prediction/prediction.service';
import { VoyageService } from '../modules/voyage/voyage.service';
import { MemorySnapshot } from '../adapters/memory/memory-snapshot';
import { MemoryVoyageStore } from '../adapters/memory/memory-voyage-store';
import { MemoryDirectory } from '../adapters/memory/memory-directory';
import { DrizzlePredictionStore } from '../adapters/drizzle/drizzle-prediction-store';
import { protoSnapshot } from './helpers/proto-snapshot';
import { testDb } from './helpers/pg';

const user = { userId: 'u1', userName: '林海川' };
const dto = (o: any = {}) => ({ biz: '大宗采购船', tons: 50000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-11-08', winEnd: '2026-11-18', ...o });

test('预测仓储（Drizzle）：运行编号并发不重复；保存—读取往返一致；采纳、宣船文案落库；占位行不可见', async () => {
  const { db, close } = await testDb();
  const store = new DrizzlePredictionStore(db as any), vstore = new MemoryVoyageStore(), voyages = new VoyageService(vstore, new MemoryDirectory());
  const svc = new PredictionService(new MemorySnapshot(protoSnapshot() as any), store, voyages);
  const nos = await Promise.all(Array.from({ length: 12 }, () => store.nextRunNo('2026-11-04')));
  assert.equal(new Set(nos).size, 12, '并发 12 个编号互不相同');
  assert.equal(await store.get(nos[0]), null, '只占位没保存的运行不可见');

  const a: any = await svc.predict(dto(), user);
  assert.match(a.runNo, /^PR-20261104-\d{4}$/);
  const saved = (await store.get(a.runNo))!;
  assert.equal(saved.plans.length, 2); assert.equal(saved.run.run_by, '林海川'); assert.equal((saved.run as any).run_mode, '近');
  const pa: any = saved.plans[0];
  assert.equal(pa.label, 'A'); assert.equal(pa.provenance.metric.value, a.result.plans[0].c.metric, '溯源 JSON 原样取回');
  assert.equal(typeof pa.cmr_min, 'number'); assert.match(pa.window_from, /^\d{4}-\d{2}-\d{2}$/);

  const ann: any = await svc.announce(a.runNo, 'A', user);
  const adopted: any = await svc.adopt(a.runNo, 'A', user);
  assert.equal(adopted.created, true);
  const again = (await store.get(a.runNo))!;
  assert.equal(again.announcements.length, 1); assert.equal(again.announcements[0].text, ann.text); assert.deepEqual(again.announcements[0].parts, ann.parts);
  assert.equal((again.plans[0] as any).adopted, true); assert.equal((again.plans[0] as any).adopted_voyage, adopted.voyage.id); assert.equal((again.plans[1] as any).adopted, false);
  await assert.rejects(svc.adopt(a.runNo, 'A', user), (e: any) => e.httpStatus === 409);
  await close();
});

// ---------------- 导入仓储与运行日志 ----------------
import { ImportsService } from '../modules/imports/imports.service';
import { MemoryMasterStore } from '../adapters/memory/memory-master-store';
import { LiveSnapshot } from '../adapters/memory/live-snapshot';
import { seedMaster } from '../adapters/memory/seed';
import { DrizzleImportStore } from '../adapters/drizzle/drizzle-import-store';
import { DrizzleSyncLog } from '../adapters/drizzle/drizzle-sync-log';
import type { Actor } from '../domain/voyage';

const logi: Actor = { userId: 'l', name: '物流甲', role: '物流管理员', dept: '仓储物流部' };
const plan = (o: any) => ({ 码头: '北区码头', 泊位: 'F1', 船名: 'MV A', 船长: 190, 船舶类型: '散货船', 物资名称: '镍矿', 吨位: 50000, 从属单位: '德信', 预计到港日期: '2026-11-06 08:00', 预计靠泊时间: '2026-11-07 08:00', 预计卸完时间: '2026-11-10 08:00', 备注: '', ...o });
const file = [plan({ 船名: 'MV KEEP' }), plan({ 船名: 'MV OFF', 泊位: 'L1' }), plan({ 船名: 'MV OLD', 预计靠泊时间: '2026-10-20 08:00', 预计卸完时间: '2026-11-01 08:00' }), plan({ 船名: 'MV BAD', 预计卸完时间: '' }), plan({ 船名: 'MV LATE', 泊位: 'F2', 预计靠泊时间: '2026-11-12 00:00', 预计卸完时间: '2026-11-14 00:00' })];
const inv = (name: string, date: string, stock: any, o: any = {}) => ({ 导入日期: '2026-11-04', 库存日期: date, 品名: name, 物料类型: '铁矿', 日耗: 1000, 库存: stock, 可用天数: 20, ...o });

async function importsEnv() {
  const t = await testDb(), store = new DrizzleImportStore(t.db as any), log = new DrizzleSyncLog(t.db as any);
  const master = new MemoryMasterStore(seedMaster()), vstore = new MemoryVoyageStore(), dir = new MemoryDirectory();
  const svc = new ImportsService(store, master, vstore, dir, log); svc.clock = () => new Date('2026-11-05T08:30:00Z');
  return { ...t, store, log, svc, master, vstore, snap: new LiveSnapshot(master, vstore, store, () => '2026-11-05') };
}

test('靠船计划仓储（Drizzle）：分类计数、时间字面值往返、当前批次整批切换、旧批次保留、文件 token 去重、幂等键', async () => {
  const { svc, store, snap, close } = await importsEnv();
  const r = await svc.importBerthPlan({ fileName: 'a.xlsx', rows: file, fileToken: 'tok-1', source: '飞书云空间' }, null, 'k1');
  assert.deepEqual([r.summary.total, r.summary.active, r.summary.history, r.summary.anomaly, r.summary.offPool], [5, 3, 1, 1, 1]);
  const same = await svc.importBerthPlan({ fileName: 'a.xlsx', rows: file, source: '飞书云空间' }, null, 'k1');   // 网络重试：同一个幂等键，没带文件 token
  assert.equal(same.batch.batchNo, r.batch.batchNo, '同一幂等键只导入一次，拿到第一次的结果');
  assert.equal((await store.berthBatches()).length, 1);
  await assert.rejects(svc.importBerthPlan({ fileName: 'a.xlsx', rows: file, fileToken: 'tok-1' }, null), (e: any) => e.httpStatus === 409);

  const rows = (await svc.berthBatchRows(r.batch.batchNo)) as any[];
  assert.equal(rows.length, 5); const keep = rows.find((x) => x.vessel === 'MV KEEP');
  assert.deepEqual([keep.start, keep.end, keep.eta, keep.terminal, keep.loa, keep.inPool], ['2026-11-07 08:00', '2026-11-10 08:00', '2026-11-06 08:00', '北区码头', 190, true], '时间按字面值往返，不被时区改写');
  assert.deepEqual((await snap.load()).planRows.map((x) => x.vessel).sort(), ['MV KEEP', 'MV LATE', 'MV OFF']);

  const r2 = await svc.importBerthPlan({ fileName: 'b.xlsx', rows: [plan({ 船名: 'MV ONLY' })] }, logi);
  assert.equal(r2.batch.batchNo, 'BP-20261105-02');
  assert.deepEqual((await snap.load()).planRows.map((x) => x.vessel), ['MV ONLY']);
  assert.deepEqual((await store.berthBatches()).map((b) => [b.batchNo, b.isCurrent]), [['BP-20261105-02', true], ['BP-20261105-01', false]]);
  assert.equal(((await svc.berthBatchRows('BP-20261105-01')) as any[]).length, 5, '旧批次保留可查');
  await close();
});

test('靠船计划仓储（Drizzle）：整批在事务里，写到一半失败 → 没有半截批次，当前批次不变', async () => {
  const { svc, store, snap, close } = await importsEnv();
  await svc.importBerthPlan({ fileName: 'a.xlsx', rows: [plan({ 船名: 'MV GOOD' })] }, logi);
  const batches = await store.berthBatches(), dup = { ...batches[0], isCurrent: undefined } as any; delete dup.isCurrent;
  await assert.rejects(store.saveBerthBatch(dup, [{ line: 1, status: 'active', terminal: '', berthRaw: 'F1', berth: 'F1', inPool: true, vessel: 'MV Z', loa: null, shipType: '', cargo: '', tons: 1, owner: '', eta: '2026-11-06 08:00', start: '2026-11-07 08:00', end: '2026-11-08 08:00', matchVoyage: null, raw: {} }]));
  assert.equal((await store.berthBatches()).length, 1, '批次号重复被拒绝，没有留下半截数据');
  assert.deepEqual((await snap.load()).planRows.map((x) => x.vessel), ['MV GOOD']);
  await close();
});

test('库存仓储（Drizzle）：摘要和序列往返一致，错误值行单独存，当前批次切换；趋势接口可用', async () => {
  const { svc, store, snap, close } = await importsEnv();
  const rows = [inv('焦煤', '2026-11-05', 5000, { 物料类型: '焦煤', 可用天数: 5 }), inv('焦煤', '2026-11-06', 4000, { 物料类型: '焦煤' }), inv('焦煤', '2026-11-07', '#VALUE!', { 物料类型: '焦煤' }), inv('铁矿A', '2026-11-05', 90000)];
  const r = await svc.importInventory({ fileName: 'i.xlsx', rows }, logi);
  assert.equal(r.batch.batchNo, 'IV-20261104-01'); assert.deepEqual([r.summary.items, r.summary.errorRows], [2, 1]);
  const cur = await store.currentInventory();
  assert.deepEqual(cur.items.map((i) => [i.name, i.stock, i.daily, i.days, i.series.length]), [['焦煤', 5000, 1000, 5, 2], ['铁矿A', 90000, 1000, 20, 1]]);
  assert.deepEqual(cur.errorRows.map((e) => [e.name, e.date, e.raw]), [['焦煤', '2026-11-07', '#VALUE!']]);
  assert.equal(cur.batch!.importedBy, '物流甲'); assert.equal(cur.batch!.items, 2);
  const s = await snap.load(); assert.equal(s.inventory.batchNo, 'IV-20261104-01'); assert.equal(s.inventory.items[0].series[0][1], 5000);
  const tr = await svc.inventoryTrend('焦煤', [], Math.floor(Date.UTC(2026, 10, 12) / 86400000));
  assert.equal(tr.base[0][1], 5000);
  await svc.importInventory({ fileName: 'i2.xlsx', rows: [inv('焦煤', '2026-11-05', 100)] }, logi);
  assert.deepEqual((await store.currentInventory()).items.map((i) => i.name), ['焦煤']);
  assert.deepEqual((await store.inventoryBatches()).map((b) => [b.batchNo, b.isCurrent]), [['IV-20261104-02', true], ['IV-20261104-01', false]]);
  await close();
});

test('运行日志（Drizzle）：导入成功和失败都记，失败可筛，错误信息截断', async () => {
  const { svc, log, close } = await importsEnv();
  await svc.importBerthPlan({ fileName: 'a.xlsx', rows: [plan({})] }, logi);
  await assert.rejects(svc.importBerthPlan({ fileName: 'bad.xlsx', rows: [{ 船名: 'x' }] }, logi));
  const all = await log.list();
  assert.deepEqual(all.map((x) => [x.type, x.ok]).sort(), [['手动上传靠船计划', '失败'], ['手动上传靠船计划', '成功']]);
  assert.deepEqual((await log.list({ failOnly: true })).map((x) => x.ok), ['失败']);
  await log.add({ type: 't', start: '2026-11-05 08:00', end: '2026-11-05 08:01', n: 1, ok: '失败', err: 'x'.repeat(900) });
  assert.equal((await log.list({ failOnly: true })).find((x) => x.type === 't')!.err.length, 500);
  await close();
});

import { DrizzleHealth } from '../adapters/drizzle/drizzle-health';
test('自检（Drizzle）：数据库可连、镜像表不存在时报异常而不是崩；环境变量未配置如实提醒，不泄露值', async () => {
  const { db, close } = await testDb();
  const h = await new DrizzleHealth(db as any, {}).checks();
  assert.equal(h[0].status, '正常'); assert.equal(h[1].status, '异常', '测试库没有镜像表');
  assert.ok(h.some((c) => c.name === '飞书应用凭证' && c.status === '提醒'));
  const h2 = await new DrizzleHealth(db as any, { LARK_APP_ID: 'cli_x', LARK_APP_SECRET: 'SECRET-VALUE' }).checks();
  assert.ok(h2.some((c) => c.name === '飞书应用凭证' && c.status === '正常'));
  assert.equal(JSON.stringify(h2).includes('SECRET-VALUE'), false);
  await close();
});

import { createOutbox } from '../lark/outbox';
import { createDrizzleOutboxStore } from '../lark/outbox-store';
test('写队列持久化（Drizzle）：成功落 done；飞书失败记 failed 且可用同一个键重试；飞书写成功后续失败→written，补偿重放不再写飞书', async () => {
  const { db, close } = await testDb();
  const store = createDrizzleOutboxStore(db as any), outbox = createOutbox(store);
  let lark = 0, after = 0;
  const ok = await outbox.execute('k-ok', { kind: 'voyage.create', table: 'T04', payload: { a: 1 }, writeLark: async () => { lark++; return { recordId: 'rec1' }; }, afterWrite: async () => { after++; } });
  assert.deepEqual([ok.result, ok.replayed, lark, after], [{ recordId: 'rec1' }, false, 1, 1]);
  const again = await outbox.execute('k-ok', { kind: 'voyage.create', payload: { a: 1 }, writeLark: async () => { lark++; return null; } });
  assert.deepEqual([again.replayed, lark], [true, 1], '重复提交不再写飞书');

  let fail = true;
  const w = { kind: 'voyage.update', table: 'T04', operation: 'update' as const, payload: { b: 2 }, writeLark: async () => { if (fail) throw new Error('飞书错误 1254001'); return { ok: true }; } };
  await assert.rejects(outbox.execute('k-fail', w), /1254001/);
  assert.equal((await store.get('k-fail'))!.status, 'failed'); assert.equal((await store.get('k-fail'))!.attempts, 1);
  fail = false;
  assert.equal((await outbox.execute('k-fail', w)).replayed, false); assert.equal((await store.get('k-fail'))!.status, 'done'); assert.equal((await store.get('k-fail'))!.attempts, 2);

  await assert.rejects(outbox.execute('k-half', { kind: 'voyage.create', table: 'T04', payload: { c: 3 }, writeLark: async () => { lark++; return { recordId: 'rec9' }; }, afterWrite: async () => { throw new Error('回写镜像失败'); } }), /回写镜像失败/);
  const half = await store.get('k-half'); assert.equal(half!.status, 'written'); assert.deepEqual(half!.result, { recordId: 'rec9' });
  const before = lark; let replayed = 0;
  const n = await outbox.replayWritten({ 'voyage.create': async (result: any) => { replayed++; assert.equal(result.recordId, 'rec9'); } });
  assert.deepEqual([n, replayed, lark], [1, 1, before], '补偿只补后续步骤，不再写飞书');
  assert.equal((await store.get('k-half'))!.status, 'done');
  await close();
});
