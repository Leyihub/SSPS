// 预测服务（A20–A24、A29）：用内存数据端口跑通整条主线，不连飞书和数据库。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { PredictionService } from '../modules/prediction/prediction.service';
import { CapacityService } from '../modules/capacity/capacity.service';
import { MemorySnapshot } from '../adapters/memory/memory-snapshot';
import { MemoryPredictionStore } from '../adapters/memory/memory-prediction-store';
import { MemoryVoyageStore } from '../adapters/memory/memory-voyage-store';
import { MemoryDirectory } from '../adapters/memory/memory-directory';
import { VoyageService } from '../modules/voyage/voyage.service';
import { seedSnapshot } from '../adapters/memory/seed';
import { createEngine, announce, announceFromProvenance } from '../engine';
import { buildRule } from '../domain/routeRules';
import { BusinessException } from '../common/interfaces/exception.interface';

// 用原型的示例数据组一份快照（有靠船计划、航次、库存），和引擎测试用同一份
const proto = path.join(__dirname, '../../../prototype');
const ctx: any = { window: {}, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
for (const f of ['mock-data.js']) vm.runInContext('var window=this.window;' + fs.readFileSync(path.join(proto, f), 'utf8'), ctx);
const M = ctx.window.MOCK;
const snapshot = () => ({ today: M.today, berths: M.berths, planRows: M.berthPlanRows, berthPlanBatch: { batchNo: M.batch.batchNo, planDate: M.batch.planDate, source: M.batch.source, coverTo: null },
  voyages: M.voyages, routeRules: M.routeRules, inventory: { batchNo: 'IV-1', items: M.inventory.items }, ports: M.ports });
const mk = () => {
  const snap = new MemorySnapshot(snapshot() as any), store = new MemoryPredictionStore(), vstore = new MemoryVoyageStore(), voyages = new VoyageService(vstore, new MemoryDirectory());
  return { snap, store, vstore, voyages, svc: new PredictionService(snap, store, voyages), cap: new CapacityService(snap) };
};
const user = { userId: 'u1', userName: '林海川' };
const dto = (o: any = {}) => ({ biz: '大宗采购船', tons: 50000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-11-08', winEnd: '2026-11-18', ...o });

test('预测：返回方案并把运行记录、S1 溯源存下来；运行编号按日递增', async () => {
  const { svc, store } = mk();
  const a: any = await svc.predict(dto(), user), b: any = await svc.predict(dto(), user);
  assert.equal(a.status, 'ok'); assert.deepEqual([a.runNo, b.runNo], ['PR-20261104-0001', 'PR-20261104-0002']);
  assert.equal(a.result.plans.length, 2); assert.ok(Array.isArray(a.result.pool.ids), 'Set 已转成数组');
  const saved = await store.get(a.runNo);
  assert.equal(saved!.plans.length, 2); assert.equal(saved!.run.run_mode, '近'); assert.equal(saved!.run.run_by, '林海川');
  const p: any = saved!.plans[0]; assert.equal(p.label, 'A'); assert.equal(p.provenance.metric.value, a.result.plans[0].c.metric);
  assert.equal(JSON.stringify(a.result).includes('"series"'), false, '库存序列不随结果返回');
});

test('预测：缺航程规则、无候选、入参错误、未知物料各有明确的返回', async () => {
  const { svc } = mk();
  assert.equal(((await svc.predict(dto({ load: 'SURABAYA' }), user)) as any).status, 'no_rule');
  assert.equal(((await svc.predict(dto({ winStart: '2026-11-17', winEnd: '2026-11-19' }), user)) as any).status, 'no_candidate');
  await assert.rejects(svc.predict(dto({ tons: 900000 }), user), (e: any) => e instanceof BusinessException && /无匹配泊位/.test(e.message));
  await assert.rejects(svc.predict(dto({ item: '不存在的物料' }), user), (e: any) => e instanceof BusinessException);
});

test('预测：带库存物料时走库存流程，方案里带库存状态', async () => {
  const { svc } = mk();
  const r: any = await svc.predict(dto({ load: 'QINHUANGDAO', winStart: '2026-11-04', winEnd: '2026-12-10', item: '烧结石灰石' }), user);
  assert.equal(r.status, 'ok'); assert.equal(r.result.stock.item.name, '烧结石灰石'); assert.ok(r.result.plans[0].stock);
  assert.equal(JSON.stringify(r.result.stock).includes('series'), false);
});

test('宣船文案：只引用已保存方案的数值；与引擎直接生成的文案逐片段一致；数据后来变了文案也不变', async () => {
  const { svc, snap } = mk();
  const r: any = await svc.predict(dto(), user);
  const a = await svc.announce(r.runNo, 'A', user);
  const name = (en: string) => { const p = M.ports.find((q: any) => q.en === en); return p ? p.cn.replace(/（.*?）/g, '') : en; };
  const S = snapshot() as any;
  const eng = createEngine({ today: S.today, berths: S.berths, planRows: S.planRows, voyages: S.voyages, routeRules: S.routeRules.map((x: any) => buildRule(x)), batchNo: S.berthPlanBatch.batchNo });
  const res = eng.predict({ ...dto() }); const direct = announce(res, res.plans[0], name);
  assert.deepEqual(a.parts, direct); assert.ok(a.text.includes('以上数值由规则计算得出，文案未改写。'));
  snap.set({ ...snapshot(), planRows: [], routeRules: [] } as any);                    // 数据变了
  assert.deepEqual((await svc.announce(r.runNo, 'A', user)).parts, direct);
});

test('宣船文案：成品船、库存、低可信、告急场景下，从溯源生成的文案与引擎直接生成的一致', async () => {
  const { svc } = mk();
  const name = (en: string) => { const p = M.ports.find((q: any) => q.en === en); return p ? p.cn.replace(/（.*?）/g, '') : en; };
  const S = snapshot() as any;
  const eng = createEngine({ today: S.today, berths: S.berths, planRows: S.planRows, voyages: S.voyages, routeRules: S.routeRules.map((x: any) => buildRule(x)), batchNo: S.berthPlanBatch.batchNo });
  const cases: any[] = [dto({ biz: '成品销售船', tons: 28000, load: 'BAHODOPI', disch: 'HAIPHONG', winStart: '2026-11-08', winEnd: '2026-11-20' }),
    dto({ winStart: '2026-11-12', winEnd: '2026-11-23' }), dto({ load: 'TANGSHAN', tons: 30000, winStart: '2026-11-04', winEnd: '2026-11-30', item: '高硅块' }),
    dto({ load: 'QINHUANGDAO', winStart: '2026-11-04', winEnd: '2026-12-10', item: '烧结石灰石' })];
  for (const c of cases) {
    const r: any = await svc.predict(c, user); assert.equal(r.status, 'ok');
    const item = c.item ? M.inventory.items.find((x: any) => x.name === c.item) : undefined;
    const res = eng.predict({ ...c, item, pathBy: item ? 'end' : undefined });
    for (const pl of res.plans.filter(Boolean)) assert.deepEqual((await svc.announce(r.runNo, pl.label, user)).parts, announce(res, pl, name), c.biz + ' ' + (c.item || '') + ' ' + pl.label);
  }
});

test('采纳方案：没选航次 → 新建待宣船航次，窗口写进计划抵卸港；同一方案不能采纳两次', async () => {
  const { svc, store, vstore } = mk(); const r: any = await svc.predict(dto(), user);
  const a: any = await svc.adopt(r.runNo, 'A', user);
  assert.equal(a.created, true); assert.equal(a.voyage.status, '待宣船'); assert.equal(a.voyage.owner, '林海川');
  const plan = r.result.plans[0];
  assert.equal(a.voyage.planDischS.slice(0, 10), (await store.get(r.runNo))!.plans[0].window_from);
  assert.equal((await vstore.cargo(a.voyage.id))[0].tons, 50000);
  const saved: any = (await store.get(r.runNo))!.plans.find((p: any) => p.label === 'A');
  assert.equal(saved.adopted, true); assert.equal(saved.adopted_voyage, a.voyage.id); assert.ok(plan);
  await assert.rejects(svc.adopt(r.runNo, 'A', user), (e: any) => e.httpStatus === 409);
  await assert.rejects(svc.adopt('PR-X', 'A', user), (e: any) => e instanceof BusinessException && e.httpStatus === 404);
  await assert.rejects(svc.adopt(r.runNo, 'C', user), (e: any) => e.httpStatus === 404);
});

test('采纳方案：写回已有待宣船航次；装卸港不一致、非待宣船、非本人航次都拒绝', async () => {
  const { svc, voyages } = mk(); const r: any = await svc.predict(dto(), user);
  const mine = await voyages.create({ biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', cargo: [{ name: '镍矿', tons: 50000 }] } as any, { userId: 'u1', name: '林海川', role: '业务员', dept: '大宗采购部' });
  const wrongPort = await voyages.create({ biz: '大宗采购船', load: 'TAGANITO', disch: 'BAHODOPI', cargo: [{ name: '镍矿', tons: 1 }] } as any, { userId: 'u1', name: '林海川', role: '业务员', dept: '大宗采购部' });
  const named = await voyages.create({ biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', vessel: 'MV X', cargo: [{ name: '镍矿', tons: 1 }] } as any, { userId: 'u1', name: '林海川', role: '业务员', dept: '大宗采购部' });
  await assert.rejects(svc.adopt(r.runNo, 'A', user, wrongPort.voyage.id), (e: any) => e.httpStatus === 422);
  await assert.rejects(svc.adopt(r.runNo, 'A', user, named.voyage.id), (e: any) => e.httpStatus === 422);
  await assert.rejects(svc.adopt(r.runNo, 'A', { userId: 'u9', userName: '外人' }, mine.voyage.id), (e: any) => e.httpStatus === 403);
  const a: any = await svc.adopt(r.runNo, 'A', user, mine.voyage.id);
  assert.equal(a.created, false); assert.equal(a.voyage.id, mine.voyage.id); assert.ok(a.voyage.planDischS);
});

test('自然语言解析：只返回解析结果，不含预测数值；手工修改优先', async () => {
  const { svc } = mk();
  const p: any = await svc.parse('烧结石灰石 秦皇岛→德信 5万吨 2026年12月10日前');
  assert.deepEqual([p.biz, p.item.name, p.tons, p.load, p.disch], ['大宗采购船', '烧结石灰石', 50000, 'QINHUANGDAO', 'BAHODOPI']);
  assert.equal(JSON.stringify(p).includes('series'), false);
  const q: any = await svc.parse('废钢 新村港→德信 1万吨', { tons: 20000, item: '废钢' });
  assert.equal(q.tons, 20000);
});

test('容量日历：默认数据下无靠船计划 → 全部是无数据，绝不返回 0%；有数据时与引擎一致', async () => {
  const seed = new MemorySnapshot(seedSnapshot('2026-11-05'));
  const empty = await new CapacityService(seed).calendar(50000, 30);
  assert.equal(empty.pool.n, 11); assert.ok(empty.days.every((d: any) => d.state === 'nodata'));
  const { cap } = mk(); const c: any = await cap.calendar(50000, 30);
  assert.equal(c.days.length, 30); assert.equal(c.pool.total, M.berths.length);
  assert.deepEqual(c.days.slice(0, 16).map((d: any) => d.mode), Array(16).fill('cmr'));
  const day: any = await cap.day('2026-11-07', 50000);
  assert.equal(day.berths.length, M.berths.length); assert.ok(day.berths.some((b: any) => b.state === 'occ'));
  await assert.rejects(cap.day('2026-11-01', 50000), (e: any) => e instanceof BusinessException);
});
