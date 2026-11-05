// 靠船计划与库存导入（A17–A19、A30）：权限、表头校验、分类计数、整批切换、去重、与日历/预测联动。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ImportsService } from '../modules/imports/imports.service';
import { VoyageService } from '../modules/voyage/voyage.service';
import { CapacityService } from '../modules/capacity/capacity.service';
import { MemoryMasterStore } from '../adapters/memory/memory-master-store';
import { MemoryVoyageStore } from '../adapters/memory/memory-voyage-store';
import { MemoryImportStore } from '../adapters/memory/memory-import-store';
import { MemoryDirectory } from '../adapters/memory/memory-directory';
import { LiveSnapshot } from '../adapters/memory/live-snapshot';
import { seedMaster } from '../adapters/memory/seed';
import type { Actor } from '../domain/voyage';
import { buildXlsx } from './helpers/xlsx-writer';

const biz: Actor = { userId: 'b', name: '业务甲', role: '业务员', dept: '大宗采购部' };
const logi: Actor = { userId: 'l', name: '物流甲', role: '物流管理员', dept: '仓储物流部' };

const mk = () => {
  const master = new MemoryMasterStore(seedMaster()), vstore = new MemoryVoyageStore(), istore = new MemoryImportStore(), dir = new MemoryDirectory();
  const svc = new ImportsService(istore, master, vstore, dir), voyages = new VoyageService(vstore, dir);
  svc.clock = () => new Date('2026-11-05T08:30:00Z');
  const snap = new LiveSnapshot(master, vstore, istore, () => '2026-11-05');
  return { svc, voyages, vstore, istore, snap };
};
const plan = (o: any) => ({ 码头: '北区', 泊位: 'F1', 船名: 'MV A', 船长: 190, 船舶类型: '散货船', 物资名称: '镍矿', 吨位: 50000, 从属单位: '德信', 预计到港日期: '2026-11-06 08:00', 预计靠泊时间: '2026-11-07 08:00', 预计卸完时间: '2026-11-10 08:00', 备注: '', ...o });
const file = [
  plan({ 船名: 'MV KEEP' }),                                                  // active，池内
  plan({ 船名: 'MV OFF', 泊位: 'L1' }),                                       // active，池外
  plan({ 船名: 'MV OLD', 预计靠泊时间: '2026-10-20 08:00', 预计卸完时间: '2026-11-01 08:00' }),   // 已卸完 → history
  plan({ 船名: 'MV BAD', 预计卸完时间: '' }),                                  // 缺日期 → anomaly
  plan({ 船名: 'MV FAR', 预计靠泊时间: '2027-03-01 08:00', 预计卸完时间: '2027-03-05 08:00' }),   // 超 90 天 → anomaly
  plan({ 船名: 'MV LATE', 泊位: 'F2', 预计靠泊时间: '2026-11-12 00:00', 预计卸完时间: '2026-11-14 00:00' }),
];
const err = async (p: Promise<unknown>, http: number, re?: RegExp) => assert.rejects(p, (e: any) => { assert.equal(e.httpStatus, http, e.message); if (re) assert.match(e.message, re); return true; });

test('靠船计划导入：分类计数、覆盖日、批次号；异常行进数据质量清单；当前批次进入预测快照', async () => {
  const { svc, snap, vstore } = mk();
  const r = await svc.importBerthPlan({ fileName: '靠船计划-1105.xlsx', rows: file }, logi);
  assert.equal(r.batch.batchNo, 'BP-20261105-01');
  assert.deepEqual([r.summary.total, r.summary.active, r.summary.history, r.summary.anomaly, r.summary.offPool], [6, 3, 1, 2, 1]);
  assert.equal(r.coverTo, '2026-11-12');
  const s = await snap.load();
  assert.deepEqual(s.planRows.map((x) => x.vessel).sort(), ['MV KEEP', 'MV LATE', 'MV OFF']);
  assert.deepEqual([s.berthPlanBatch!.batchNo, s.berthPlanBatch!.coverTo, s.berthPlanBatch!.source], ['BP-20261105-01', '2026-11-12', '手动上传']);
  const issues = await vstore.issues();
  assert.equal(issues.length, 2); assert.ok(issues.every((i) => i.type === '靠船计划日期异常' && i.owner === '物流甲'));
});

test('靠船计划：只有物流管理员/系统管理员能导入；缺列、空文件、日期格式错误整批拒绝，不产生批次', async () => {
  const { svc, istore } = mk();
  await err(svc.importBerthPlan({ fileName: 'a', rows: file }, biz), 403);
  await err(svc.importBerthPlan({ fileName: 'a', rows: [] }, logi), 422, /没有数据行/);
  await err(svc.importBerthPlan({ fileName: 'a', rows: file.map(({ 预计卸完时间, ...r }) => r) }, logi), 422, /缺少必要的列：预计卸完时间/);
  await err(svc.importBerthPlan({ fileName: 'a', rows: file, planDate: '11/05' }, logi), 422, /YYYY-MM-DD/);
  assert.equal((await istore.berthBatches()).length, 0);
});

test('靠船计划：新批次整体替换当前批次，旧批次保留可查；同一天批次号递增；同一文件 token 不重复导入', async () => {
  const { svc, snap } = mk();
  await svc.importBerthPlan({ fileName: 'a', rows: file, fileToken: 'tok-1', source: '飞书云空间' }, null);
  await err(svc.importBerthPlan({ fileName: 'a', rows: file, fileToken: 'tok-1' }, null), 409, /已经导入过/);
  const r2 = await svc.importBerthPlan({ fileName: 'b', rows: [plan({ 船名: 'MV ONLY' })] }, logi);
  assert.equal(r2.batch.batchNo, 'BP-20261105-02');
  assert.deepEqual((await snap.load()).planRows.map((x) => x.vessel), ['MV ONLY']);
  const bs = await svc.berthBatches();
  assert.deepEqual(bs.map((b) => [b.batchNo, b.isCurrent, b.source]), [['BP-20261105-02', true, '手动上传'], ['BP-20261105-01', false, '飞书云空间']]);
  assert.equal((await svc.berthBatchRows('BP-20261105-01')).length, 6);
  assert.deepEqual((await svc.berthBatchRows('BP-20261105-01', 'anomaly')).map((r) => r.vessel).sort(), ['MV BAD', 'MV FAR']);
  await err(svc.berthBatchRows('BP-0'), 404);
});

test('靠船计划：按船名关联已有航次（忽略空格和大小写），取消的航次不关联', async () => {
  const { svc, voyages, istore } = mk();
  const a = await voyages.create({ biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', vessel: 'mv keep', cargo: [{ name: 'x', tons: 1 }] } as any, biz);
  await svc.importBerthPlan({ fileName: 'a', rows: file }, logi);
  const rows = await istore.berthRows('BP-20261105-01');
  assert.equal(rows!.find((r) => r.vessel === 'MV KEEP')!.matchVoyage, a.voyage.id);
  assert.equal(rows!.find((r) => r.vessel === 'MV LATE')!.matchVoyage, null);
});

test('导入后日历有数据：覆盖期内显示泊位占用，覆盖期外仍是无数据（不是 0）', async () => {
  const { svc, snap } = mk();
  const cap = new CapacityService(snap);
  let cal: any = await cap.calendar(50000, 20);
  assert.ok(cal.days.slice(0, 15).every((d: any) => d.state !== 'ok'), '导入前全是无数据');
  await svc.importBerthPlan({ fileName: 'a', rows: file }, logi);
  cal = await cap.calendar(50000, 20);
  const okDays = cal.days.filter((x: any) => x.state === 'ok').length;
  assert.ok(okDays > 0 && okDays < 15, '覆盖期内有数据，期外无数据：' + okDays);
  assert.ok(cal.days.filter((x: any) => x.state !== 'ok').every((x: any) => x.cmr === undefined || x.cmr === null), '无数据的天不带比率');
});

const inv = (name: string, date: string, stock: any, o: any = {}) => ({ 导入日期: '2026-11-04', 库存日期: date, 品名: name, 物料类型: '铁矿', 日耗: 1000, 库存: stock, 可用天数: 20, ...o });
test('库存导入：生成物料摘要，错误值行单独记录，当前批次进入预测快照；列表不带序列', async () => {
  const { svc, snap } = mk();
  const rows = [inv('烧结石灰石', '2026-11-05', 30000), inv('烧结石灰石', '2026-11-06', 29000), inv('烧结石灰石', '2026-11-07', '#VALUE!'), inv('焦煤', '2026-11-05', 8000, { 物料类型: '焦煤', 可用天数: 8 })];
  await err(svc.importInventory({ fileName: 'i', rows }, biz), 403);
  await err(svc.importInventory({ fileName: 'i', rows: rows.map(({ 日耗, ...r }) => r) }, logi), 422, /日耗/);
  const r = await svc.importInventory({ fileName: '库存消耗模拟.xlsx', rows }, logi);
  assert.equal(r.batch.batchNo, 'IV-20261104-01'); assert.deepEqual([r.summary.items, r.summary.errorRows], [2, 1]);
  const list = await svc.inventory();
  assert.deepEqual(list.items.map((i) => [i.name, i.days, i.errorCount]), [['烧结石灰石', 20, 1], ['焦煤', 8, 0]]);
  assert.equal(JSON.stringify(list).includes('series'), false); assert.equal(list.errorRows.length, 1);
  const s = await snap.load(); assert.equal(s.inventory.batchNo, 'IV-20261104-01'); assert.equal(s.inventory.items[0].series.length, 2);
  await err(svc.importInventory({ fileName: 'i', rows: [inv('X', '2026-11-05', '#VALUE!')] }, logi), 422, /没有可用的库存行/);
  assert.equal((await svc.importInventory({ fileName: 'i2', rows: [inv('焦煤', '2026-11-05', 5000)] }, logi)).batch.batchNo, 'IV-20261104-02');
  assert.deepEqual((await snap.load()).inventory.items.map((i) => i.name), ['焦煤']);
});

test('上传 .xlsx：解析成行再导入；非 xlsx、空文件、损坏文件都是 422', async () => {
  const { svc } = mk();
  const head = Object.keys(file[0]), grid = [head, ...file.map((r: any) => head.map((h) => (r[h] === '' ? null : r[h])))];
  const buf = buildXlsx({ 靠船计划: grid as any });
  const up = svc.parseUpload({ originalname: '靠船计划.xlsx', buffer: buf });
  const r = await svc.importBerthPlan(up, logi);
  assert.deepEqual([r.summary.total, r.summary.active, r.summary.anomaly], [6, 3, 2]);
  assert.throws(() => svc.parseUpload({ originalname: 'a.xls', buffer: buf }), (e: any) => e.httpStatus === 422 && /xlsx/.test(e.message));
  assert.throws(() => svc.parseUpload(undefined), (e: any) => e.httpStatus === 422);
  assert.throws(() => svc.parseUpload({ originalname: 'a.xlsx', buffer: Buffer.from('not a zip file at all, just text') }), (e: any) => e.httpStatus === 422 && /读取 Excel 失败/.test(e.message));
});

test('库存趋势：基准曲线与加入方案到货后的曲线都来自引擎；未知物料 404', async () => {
  const { svc } = mk();
  const rows = [inv('焦煤', '2026-11-05', 5000, { 日耗: 1000 }), inv('焦煤', '2026-11-06', 4000, { 日耗: 1000 }), inv('焦煤', '2026-11-07', 3000, { 日耗: 1000 }), inv('焦煤', '2026-11-08', 2000, { 日耗: 1000 }), inv('焦煤', '2026-11-09', 1000, { 日耗: 1000 }), inv('焦煤', '2026-11-10', 0, { 日耗: 1000 })];
  await svc.importInventory({ fileName: 'i', rows }, logi);
  const today = Math.floor(Date.UTC(2026, 10, 5) / 86400000);
  const r = await svc.inventoryTrend('焦煤', [{ d: today + 3, tons: 30000 }], today + 8);
  assert.equal(r.today, today); assert.equal(r.so, today + 5); assert.equal(r.base[0][0], today); assert.equal(r.base.length, 9);
  assert.ok(r.lines[0].pts.find((p) => p[0] === today + 3)![1] > r.base.find((p) => p[0] === today + 3)![1], '到货后库存更高');
  await err(svc.inventoryTrend('没有', [], today + 3), 404);
});

test('泊位对不上的行（泊位号无法识别）进数据质量清单「泊位未匹配」；池外泊位是正常情况，不报', async () => {
  const { svc, vstore } = mk();
  await svc.importBerthPlan({ fileName: 'x.xlsx', rows: [plan({ 船名: 'MV OK' }), plan({ 船名: 'MV OFF', 泊位: 'L1' }), plan({ 船名: 'MV BAD', 泊位: '待定' })] }, logi);
  const issues = (await vstore.issues()).filter((i) => i.type === '泊位未匹配');
  assert.equal(issues.length, 1); assert.match(issues[0].object, /MV BAD/); assert.match(issues[0].note, /待定/);
});

test('库存过期提醒：导入之后相关在途航次改了到港时间才提醒；不相关物料、导入之前的修改不算；重新导入后提醒消失', async () => {
  const { svc, voyages } = mk();
  const mkV = (t: string, name: string, vessel: string) => { voyages.clock = () => new Date(t); return voyages.create({ biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', planDischS: '2026-11-10', planDischE: '2026-11-12', eta: '2026-11-11 08:00', vessel, cargo: [{ name, tons: 1000 }] } as any, biz); };
  const coal = (await mkV('2026-11-05T07:00:00Z', '焦煤（印尼）', 'MV COAL')).voyage, ore = (await mkV('2026-11-05T07:10:00Z', '镍矿', 'MV ORE')).voyage;
  voyages.clock = () => new Date('2026-11-05T07:30:00Z'); await voyages.reviseEta(coal.id, '2026-11-11 20:00', '船代', biz);      // 导入之前的修改
  const rows = [inv('焦煤', '2026-11-05', 8000, { 物料类型: '焦煤', 可用天数: 8 })];
  await svc.importInventory({ fileName: 'i.xlsx', rows }, logi);                                                               // 08:30 导入
  assert.equal((await svc.inventory()).stale.stale, false);
  voyages.clock = () => new Date('2026-11-05T09:30:00Z'); await voyages.reviseEta(ore.id, '2026-11-11 20:00', '船代', biz);
  assert.equal((await svc.inventory()).stale.stale, false, '镍矿不在库存表里，不相关');
  await voyages.reviseEta(coal.id, '2026-11-12 08:00', '船代', biz);
  const st = (await svc.inventory()).stale;
  assert.equal(st.stale, true); assert.equal(st.since, '2026-11-05 08:30');
  assert.deepEqual(st.changes.map((c) => [c.voyageId, c.item, c.field]), [[coal.id, '焦煤', 'ETA']]);
  svc.clock = () => new Date('2026-11-05T10:30:00Z'); await svc.importInventory({ fileName: 'i2.xlsx', rows }, logi);
  assert.equal((await svc.inventory()).stale.stale, false, '重新导入后不再提醒');
});
