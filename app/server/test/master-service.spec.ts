// 主数据服务（A01–A06）、数据质量（A25）、动态快照：权限、校验、唯一性、重算、与预测联动。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MasterService } from '../modules/master/master.service';
import { VoyageService } from '../modules/voyage/voyage.service';
import { PredictionService } from '../modules/prediction/prediction.service';
import { MemoryMasterStore } from '../adapters/memory/memory-master-store';
import { MemoryVoyageStore } from '../adapters/memory/memory-voyage-store';
import { MemoryDirectory } from '../adapters/memory/memory-directory';
import { MemoryPredictionStore } from '../adapters/memory/memory-prediction-store';
import { LiveSnapshot } from '../adapters/memory/live-snapshot';
import { seedMaster } from '../adapters/memory/seed';
import type { Actor } from '../domain/voyage';

const A = (id: string, role: Actor['role'], dept: Actor['dept'] = '大宗采购部'): Actor => ({ userId: id, name: id, role, dept });
const biz = A('业务甲', '业务员'), boss = A('主管甲', '部门主管'), logi = A('物流甲', '物流管理员', '仓储物流部'), admin = A('管理员', '系统管理员', null);

const mk = () => {
  const master = new MemoryMasterStore(seedMaster()), vstore = new MemoryVoyageStore(), dir = new MemoryDirectory();
  const svc = new MasterService(master, vstore, dir), voyages = new VoyageService(vstore, dir);
  const snap = new LiveSnapshot(master, vstore, undefined, () => '2026-11-05');
  return { master, vstore, svc, voyages, snap };
};
const err = async (p: Promise<unknown>, http: number, re?: RegExp) => assert.rejects(p, (e: any) => { assert.equal(e.httpStatus, http, e.message); if (re) assert.match(e.message, re); return true; });

test('A01 当前用户：角色和部门', () => { const { svc } = mk(); svc.clock = () => new Date('2026-11-05T01:00:00Z');
  assert.deepEqual(svc.me(boss), { userId: '主管甲', name: '主管甲', role: '部门主管', dept: '大宗采购部', today: '2026-11-05' }); });

test('港口：别名模糊匹配；物流管理员可增改；别名不能与其他港口重复；本港唯一且不能停用', async () => {
  const { svc } = mk();
  assert.deepEqual((await svc.ports('巴浩')).map((p) => p.en), ['BAHODOPI']);
  assert.deepEqual((await svc.ports('qinhuang dao')).map((p) => p.en), ['QINHUANGDAO']);
  await err(svc.addPort({ en: 'DALIAN', cn: '大连' }, biz), 403);
  const p = await svc.addPort({ en: 'dalian', cn: '大连', country: '中国', alias: '大连港，DL' }, logi);
  assert.deepEqual([p.en, p.alias], ['DALIAN', ['大连港', 'DL']]);
  await err(svc.addPort({ en: 'DALIAN', cn: '大连2' }, logi), 409, /已存在/);
  await err(svc.addPort({ en: 'X1', cn: '某港', alias: ['大连港'] }, logi), 409, /别名不能重复/);
  await err(svc.addPort({ en: 'X2', cn: 'x', isLocal: true }, logi), 409, /本港/);
  await err(svc.addPort({ en: '大连', cn: '', country: '火星' }, logi), 422, /英文标准名.*中文名称.*国家/);
  await err(svc.patchPort('BAHODOPI', { status: '停用' }, admin), 422, /本港/);
  await err(svc.patchPort('DALIAN', { en: 'X' }, logi), 422, /不能修改字段/);
  assert.equal((await svc.patchPort('DALIAN', { region: '辽宁' }, logi)).region, '辽宁');
  await err(svc.patchPort('NOPE', { region: 'x' }, logi), 404);
});

test('泊位：23 个真实泊位；新增校验编码、码头、容量；容量改了立刻影响预测池', async () => {
  const { svc, snap } = mk();
  assert.equal((await svc.berths()).length, 23);
  await err(svc.addBerth({ code: 'F1', terminal: '北区码头', capacity: 1 }, logi), 409);
  await err(svc.addBerth({ code: '??', terminal: '南区', capacity: 0 }, logi), 422, /编码.*码头.*容量/);
  await err(svc.patchBerth('F1', { capacity: 50000 }, biz), 403);
  const before = (await snap.load()).berths.find((b) => b.code === 'F8')!.capacity;
  await svc.patchBerth('F8', { capacity: 60000 }, logi);
  assert.equal(before, 15000); assert.equal((await snap.load()).berths.find((b) => b.code === 'F8')!.capacity, 60000);
  await err(svc.patchBerth('F8', { code: 'F9' }, logi), 422);
});

test('船舶：业务员能新增，只有物流/系统能改；船名、别名、IMO、MMSI 不能重复；吨级档按载重吨推', async () => {
  const { svc } = mk();
  const v = await svc.addVessel({ name: 'mv star', alias: 'STAR ONE', dwt: 56000, imo: '9123456', mmsi: '412345678' }, biz);
  assert.deepEqual([v.name, v.tier, v.id], ['MV STAR', '5 万吨', 'V-0001']);
  await err(svc.addVessel({ name: 'Star One' }, biz), 409, /重复/);
  await err(svc.addVessel({ name: 'OTHER', imo: '9123456' }, biz), 409, /IMO/);
  await err(svc.addVessel({ name: 'OTHER', mmsi: '412345678' }, biz), 409, /MMSI/);
  await err(svc.addVessel({ name: '', imo: '12', mmsi: 'abc', type: '飞艇' }, biz), 422, /标准船名.*船型.*MMSI.*IMO/);
  await err(svc.patchVessel(v.id, { dwt: 100000 }, biz), 403);
  assert.equal((await svc.patchVessel(v.id, { dwt: 100000 }, logi)).tier, '10 万吨');
  assert.deepEqual((await svc.vessels('412345')).map((x) => x.name), ['MV STAR']);
});

test('航程规则：主管可维护；校验港口存在、上限≥经验值；同航线同业务类型只能有一条启用；航线不可改', async () => {
  const { svc } = mk();
  assert.equal((await svc.routeRules())[0].basis, '经验值');
  await err(svc.addRouteRule({ load: 'TAGANITO', disch: 'HAIPHONG', biz: ['成品销售船'], exp: 5, expMax: 6 }, biz), 403);
  const r = await svc.addRouteRule({ load: 'TAGANITO', disch: 'SINGAPORE', biz: ['大宗采购船'], exp: 5, expMax: 6 }, boss);
  assert.deepEqual([r.id, r.effP50, r.effP80], ['R-011', 5, 6]);
  await err(svc.addRouteRule({ load: 'TAGANITO', disch: 'SINGAPORE', biz: ['大宗采购船'], exp: 5, expMax: 6 }, boss), 409, /已有启用/);
  await err(svc.addRouteRule({ load: 'NOWHERE', disch: 'SINGAPORE', biz: ['火箭'], exp: 8, expMax: 6 }, boss), 422, /标准港口.*业务类型.*上限/);
  await err(svc.patchRouteRule(r.id, { load: 'JAKARTA' }, boss), 422, /不能修改字段/);
  await err(svc.patchRouteRule(r.id, { samples: 9 }, admin), 422, /不能修改字段/);
  assert.equal((await svc.patchRouteRule(r.id, { exp: 6, expMax: 8 }, boss)).effP80, 8);
  assert.equal((await svc.patchRouteRule(r.id, { status: '停用' }, boss)).status, '停用');
  await svc.addRouteRule({ load: 'TAGANITO', disch: 'SINGAPORE', biz: ['大宗采购船'], exp: 7, expMax: 8 }, boss);      // 停用后可以再建
});

test('重算航程规则：已完成航次进样本；样本≥5 切统计值；取消和异常航次不计；只有系统管理员手动触发', async () => {
  const { svc, voyages, vstore, snap } = mk();
  const mkv = async (dep: string, arr: string, extra: any = {}) => {
    const { voyage } = await voyages.create({ biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', vessel: 'MV X', cargo: [{ name: '镍矿', tons: 1 }] } as any, biz);
    await vstore.update(voyage.id, { actLoadDep: dep, actDischArr: arr, ...extra });
  };
  for (const d of [4, 5, 5, 6]) await mkv('2026-10-01 08:00', `2026-10-0${1 + d} 08:00`);
  await mkv('2026-10-01 08:00', '2026-10-02 08:00', { flags: ['取消'] });
  await err(svc.recomputeRouteRules(biz), 403);
  let r = await svc.recomputeRouteRules(admin);
  assert.equal((await svc.routeRules()).find((x) => x.id === 'R-001')!.samples, 4); assert.deepEqual(r.switched, []);
  await mkv('2026-10-01 08:00', '2026-10-08 08:00');                                               // 第 5 条：7 天
  r = await svc.recomputeRouteRules(null);
  const rule = (await svc.routeRules()).find((x) => x.id === 'R-001')!;
  assert.deepEqual([rule.samples, rule.basis, rule.p50, rule.effP50], [5, '统计值', 5, 5]); assert.deepEqual(r.switched, ['R-001']);
  assert.equal(rule.effP80, 6.2);                                                                    // [4,5,5,6,7] 线性插值 P80
  assert.equal((await snap.load()).routeRules.find((x) => x.id === 'R-001')!.samples, 5, '预测用的是新规则');
});

test('动态快照：新建航次后进入重叠船数口径（取消的不算），端口停用后不再被解析', async () => {
  const { svc, voyages, snap } = mk();
  const { voyage } = await voyages.create({ biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', planDischS: '2026-12-01', planDischE: '2026-12-03', cargo: [{ name: '镍矿', tons: 40000 }, { name: '煤', tons: 10000 }] } as any, biz);
  let s = await snap.load();
  assert.deepEqual(s.voyages.map((v) => [v.id, v.winStart, v.winEnd, v.totalTons, v.localSide]), [[voyage.id, '2026-12-01', '2026-12-03', 50000, '卸']]);
  await voyages.setFlag(voyage.id, '取消', true, biz);
  s = await snap.load(); assert.deepEqual(s.voyages[0].flags, ['取消']);
  await svc.patchPort('TIANJIN', { status: '停用' }, admin);
  assert.equal((await snap.load()).ports.some((p) => p.en === 'TIANJIN'), false);
});

test('端到端：业务员建航次 → 预测用上它 → 采纳新建待宣船航次，在列表里出现', async () => {
  const { voyages, snap } = mk();
  const pred = new PredictionService(snap, new MemoryPredictionStore(), voyages);
  const user = { userId: '业务甲', userName: '业务甲' };
  for (let i = 0; i < 3; i++) await voyages.create({ biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', planDischS: '2026-12-10', planDischE: '2026-12-12', cargo: [{ name: '镍矿', tons: 50000 }] } as any, biz);
  const r: any = await pred.predict({ biz: '大宗采购船', tons: 50000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-12-01', winEnd: '2026-12-20' } as any, user);
  assert.equal(r.status, 'ok'); assert.ok(r.result.plans.length >= 1);
  const a: any = await pred.adopt(r.runNo, 'A', user);
  const row = (await voyages.list({})).items.find((x) => x.id === a.voyage.id)!;
  assert.deepEqual([a.created, row.status, row.owner, row.tons], [true, '待宣船', '业务甲', 50000]);
});

test('数据质量：缺离装港会进清单；责任人或系统管理员能关闭，别人不行', async () => {
  const { voyages } = mk();
  const { voyage } = await voyages.create({ biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', cargo: [{ name: '镍矿', tons: 1 }] } as any, biz);
  await voyages.milestone(voyage.id, 'actDischArr', '2026-11-04 08:00', biz);
  const [issue] = await voyages.issues({ status: '待处理' });
  assert.equal(issue.owner, '业务甲');
  await err(voyages.closeIssue(issue.id, A('别人', '业务员')), 403);
  await err(voyages.closeIssue('DQ-9999', biz), 404);
  assert.equal(((await voyages.closeIssue(issue.id, biz)) as any).status, '已关闭');
  assert.equal((await voyages.issues({ status: '待处理' })).length, 0);
  await voyages.update(voyage.id, { remark: '再存' }, biz);                              // 问题关闭后同类问题再次出现 → 新开一条
  assert.equal((await voyages.issues({ status: '待处理' })).length, 1);
});

test('数据质量：责任人可以开始处理再关闭；别人不行；已关闭的不能再改处理中', async () => {
  const { voyages } = mk();
  const { voyage } = await voyages.create({ biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', cargo: [{ name: '镍矿', tons: 1 }] } as any, biz);
  await voyages.milestone(voyage.id, 'actDischArr', '2026-11-04 08:00', biz);
  const [i] = await voyages.issues({ status: '待处理' });
  await err(voyages.updateIssue(i.id, '处理中', A('别人', '业务员')), 403);
  await err(voyages.updateIssue(i.id, '乱来', biz), 422);
  assert.equal(((await voyages.updateIssue(i.id, '处理中', biz)) as any).status, '处理中');
  assert.equal(((await voyages.updateIssue(i.id, '已关闭', biz)) as any).status, '已关闭');
  await err(voyages.updateIssue(i.id, '处理中', biz), 422, /已经关闭/);
});
