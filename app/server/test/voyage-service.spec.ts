// 航次服务（A07–A16）：权限、时序校验、状态推导、变更日志、幂等、金额裁剪。内存端口，不连飞书。
import test from 'node:test';
import assert from 'node:assert/strict';
import { VoyageService } from '../modules/voyage/voyage.service';
import { MemoryVoyageStore } from '../adapters/memory/memory-voyage-store';
import { MemoryDirectory } from '../adapters/memory/memory-directory';
import type { Actor } from '../domain/voyage';

const A = (o: Partial<Actor> & { userId: string }): Actor => ({ name: o.userId, role: '业务员', dept: '大宗采购部', ...o });
const lin = A({ userId: 'u-lin', name: '林海川' }), other = A({ userId: 'u-wu', name: '吴一帆' });
const boss = A({ userId: 'u-boss', name: '主管甲', role: '部门主管' }), bossOther = A({ userId: 'u-b2', name: '主管乙', role: '部门主管', dept: '商务海运部' });
const admin = A({ userId: 'u-adm', name: '管理员', role: '系统管理员', dept: null });
const logi = A({ userId: 'u-lg', name: '物流甲', role: '物流管理员', dept: '仓储物流部' });
const wh = A({ userId: 'u-wh', name: '仓储甲', dept: '仓储物流部' });
const sale = A({ userId: 'u-sale', name: '商务甲', dept: '商务海运部' });

const mk = () => {
  const store = new MemoryVoyageStore(), svc = new VoyageService(store, new MemoryDirectory());
  svc.clock = () => new Date('2026-11-05T08:30:00Z');
  return { store, svc };
};
const bulk = { biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', planDischS: '2026-11-10', planDischE: '2026-11-12', laycanS: '2026-11-01', laycanE: '2026-11-03', vessel: 'MV TEST' };
const cargo = [{ name: '镍矿', tons: 50000 }];
const err = async (p: Promise<unknown>, http: number, re?: RegExp) => {
  await assert.rejects(p, (e: any) => { assert.equal(e.httpStatus, http, e.message); if (re) assert.match(e.message, re); return true; });
};

test('新建：负责人=当前用户，状态推导，货物明细编号，写变更日志', async () => {
  const { svc, store } = mk();
  const r = await svc.create({ ...bulk, cargo } as any, lin);
  assert.equal(r.voyage.owner, '林海川'); assert.equal(r.voyage.dept, '大宗采购部'); assert.equal(r.voyage.status, '未到装港');
  assert.equal(r.voyage.planDischS, '2026-11-10 00:00'); assert.equal(r.cargo[0].no, 'CL-0001');
  assert.equal((await store.changeLog(r.voyage.id)).length, 1);
  const noVessel = await svc.create({ ...bulk, vessel: undefined, cargo } as any, lin);
  assert.equal(noVessel.voyage.status, '待宣船');
});

test('新建：物流管理员不能建；货物缺名称或货量、日期非法一次性报全', async () => {
  const { svc } = mk();
  await err(svc.create({ ...bulk } as any, logi), 403);
  await err(svc.create({ ...bulk, planDischS: '明天', cargo: [{ name: '', tons: -1 }] } as any, lin), 422, /不是有效的日期时间.*货物名称必填|货物名称必填.*/);
});

test('修改权限：本人可改，别的业务员不行，同部门主管可改，别部门主管不行，历史只读不行', async () => {
  const { svc, store } = mk();
  const { voyage } = await svc.create({ ...bulk, cargo } as any, lin);
  await svc.update(voyage.id, { remark: '已核对' }, lin);
  await err(svc.update(voyage.id, { remark: 'x' }, other), 403);
  await svc.update(voyage.id, { remark: '主管改' }, boss);
  await err(svc.update(voyage.id, { remark: 'x' }, bossOther), 403);
  await err(svc.update(voyage.id, { remark: 'x' }, logi), 403);
  await svc.update(voyage.id, { remark: '管理员改' }, admin);
  await store.update(voyage.id, { readonly: true });
  await err(svc.update(voyage.id, { remark: 'x' }, admin), 403, /只读/);
});

test('修改：不在白名单的字段（状态、负责人、异常标记）一律拒绝', async () => {
  const { svc } = mk();
  const { voyage } = await svc.create({ ...bulk, cargo } as any, lin);
  await err(svc.update(voyage.id, { status: '已结束', owner: '别人', flags: ['取消'] }, lin), 422, /不能修改字段/);
});

test('节点时序：倒置拒绝保存；同一天只有日期不算倒置；状态随节点推进，变更日志记状态变化', async () => {
  const { svc, store } = mk();
  const { voyage } = await svc.create({ ...bulk, cargo } as any, lin);
  const id = voyage.id;
  let v: any = await svc.milestone(id, 'actLoadArr', '2026-11-02 08:00', lin);
  assert.equal(v.status, '装港装货');                                   // 大宗有实际抵装港即视为装货
  v = await svc.milestone(id, 'actLoadDep', '2026-11-03 10:00', lin); assert.equal(v.status, '航行中');
  await err(svc.milestone(id, 'actDischArr', '2026-11-02 09:00', lin), 422, /不能早于/);
  v = await svc.milestone(id, 'actDischArr', '2026-11-08 06:00', lin); assert.equal(v.status, '卸港等泊');
  v = await svc.milestone(id, 'dischBerth', '2026-11-08', lin); assert.equal(v.status, '卸港卸货');   // 同一天只有日期不算倒置
  const log = await store.changeLog(id);
  assert.ok(log.some((e) => e.field === '状态' && e.old === '未到装港' && e.nw === '装港装货'));
  await err(svc.milestone(id, 'planDischS' as any, '2026-11-01', lin), 422, /不是可记录的实际节点/);
});

test('缺离装港：已抵卸港但没有离装港时间 → 保存成功，进数据质量问题，且同对象同类问题不重复', async () => {
  const { svc, store } = mk();
  const { voyage } = await svc.create({ ...bulk, cargo } as any, lin);
  await svc.milestone(voyage.id, 'actDischArr', '2026-11-08 06:00', lin);
  await svc.update(voyage.id, { remark: '再存一次' }, lin);
  await svc.update(voyage.id, { dischBerth: '2026-11-08 12:00' }, lin);
  const issues = (await store.issues()).filter((i) => i.object === voyage.id);
  assert.equal(issues.length, 1); assert.equal(issues[0].type, '缺离装港时间'); assert.equal(issues[0].owner, '林海川');
});

test('历史数据已有的倒置不拦截无关修改，只记问题', async () => {
  const { svc, store } = mk();
  const { voyage } = await svc.create({ ...bulk, cargo } as any, lin);
  await store.update(voyage.id, { actLoadDep: '2026-11-05 10:00', actDischArr: '2026-11-04 10:00' });   // 手工造一条历史倒置
  await svc.update(voyage.id, { remark: '备注' }, lin);
  assert.ok((await store.issues()).some((i) => i.type === '节点时序倒置'));
  await err(svc.update(voyage.id, { actDischArr: '2026-11-03 10:00' }, lin), 422);                     // 动到倒置的节点才拦
});

test('ETA 修订：必须有依据；已抵卸港不能再改；写修订历史和变更日志', async () => {
  const { svc, store } = mk();
  const { voyage } = await svc.create({ ...bulk, eta: '2026-11-10 08:00', cargo } as any, lin);
  assert.equal(voyage.etaUpdated, '2026-11-05 08:30');
  await err(svc.reviseEta(voyage.id, '2026-11-11 08:00', '猜的', lin), 422, /依据/);
  await err(svc.reviseEta(voyage.id, '2026-11-10 08:00', '船代', lin), 422, /相同/);
  const v: any = await svc.reviseEta(voyage.id, '2026-11-11 08:00', '船代', lin);
  assert.equal(v.eta, '2026-11-11 08:00');
  const rev = await store.etaRevisions(voyage.id);
  assert.equal(rev.length, 1); assert.deepEqual([rev[0].old, rev[0].nw, rev[0].basis], ['2026-11-10 08:00', '2026-11-11 08:00', '船代']);
  await svc.milestone(voyage.id, 'actDischArr', '2026-11-11 09:00', lin);
  await err(svc.reviseEta(voyage.id, '2026-11-12 08:00', '电话', lin), 422, /已有实际抵卸港/);
});

test('异常标记：取消 → 已结束（取消），取消标记后恢复；重复打标不产生日志', async () => {
  const { svc, store } = mk();
  const { voyage } = await svc.create({ ...bulk, cargo } as any, lin);
  let v: any = await svc.setFlag(voyage.id, '取消', true, lin); assert.equal(v.status, '已结束（取消）');
  const n = (await store.changeLog(voyage.id)).length;
  await svc.setFlag(voyage.id, '取消', true, lin); assert.equal((await store.changeLog(voyage.id)).length, n);
  v = await svc.setFlag(voyage.id, '取消', false, lin); assert.equal(v.status, '未到装港');
  await err(svc.setFlag(voyage.id, '乱标', true, lin), 422);
});

test('货物明细：增改删有日志；改只带传入字段；不存在的行 404', async () => {
  const { svc, store } = mk();
  const { voyage } = await svc.create({ ...bulk, cargo: [{ name: '镍矿', tons: 30000, contract: 'C-1' }] } as any, lin);
  const add = await svc.addCargo(voyage.id, { name: '煤', tons: '20,000' }, lin);
  assert.equal(add.tons, 20000);
  const up = await svc.updateCargo(voyage.id, 'CL-0001', { tons: 35000 }, lin);
  assert.equal(up.tons, 35000); assert.equal(up.contract, 'C-1', '没传的字段不被覆盖');
  await svc.deleteCargo(voyage.id, 'CL-0002', lin);
  assert.equal((await store.cargo(voyage.id)).length, 1);
  await err(svc.updateCargo(voyage.id, 'CL-0099', { tons: 1 }, lin), 404);
  await err(svc.addCargo(voyage.id, { name: '煤', tons: 'abc' }, lin), 422);
  await err(svc.addCargo(voyage.id, { name: '煤', tons: 1 }, other), 403);
  assert.ok((await store.changeLog(voyage.id)).length >= 4);
});

test('卸船结算分组鉴权：仓储物流部能改作业数据、不能改费用；费用写日志但不记值；无权限的人看不到金额', async () => {
  const { svc, store } = mk();
  const { voyage } = await svc.create({ ...bulk, cargo } as any, lin);
  await svc.patchSettlement(voyage.id, { allowDays: 5, rain: 'Y' }, wh);
  await err(svc.patchSettlement(voyage.id, { demUsd: 100 }, wh), 403, /费用结算/);
  await err(svc.patchSettlement(voyage.id, { allowDays: 5, demUsd: 1 }, wh), 403);
  await err(svc.patchSettlement(voyage.id, { nonsense: 1 }, lin), 422);
  await err(svc.patchSettlement(voyage.id, { allowDays: 1 }, other), 403, /作业数据/);
  await svc.patchSettlement(voyage.id, { demUsd: 1234.5, demCur: 'USD' }, lin);
  const money = (await store.changeLog(voyage.id)).filter((e) => e.masked);
  assert.equal(money.length, 2); assert.ok(money.every((e) => e.old === null && e.nw === null));
  const asLin: any = await svc.get(voyage.id, lin), asWh: any = await svc.get(voyage.id, wh), asSale: any = await svc.get(voyage.id, sale);
  assert.equal(asLin.settlement.demUsd, 1234.5); assert.equal(asWh.settlement.demUsd, undefined); assert.equal(asWh.settlement.allowDays, 5);
  assert.equal(asSale.settlement.demUsd, undefined);
  assert.deepEqual([asLin.can.money, asWh.can.ops, asWh.can.money, asWh.can.seeMoney], [true, true, false, false]);
});

test('成品销售扩展：只对成品船，商务海运部本人可改', async () => {
  const { svc } = mk();
  const prod = await svc.create({ biz: '成品销售船', load: 'BAHODOPI', disch: 'HAIPHONG', laycanS: '2026-11-08', cargo } as any, sale);
  await err(svc.patchSalesExt(prod.voyage.id, { way: 'FOB' }, lin), 403);
  await err(svc.patchSalesExt(prod.voyage.id, { way: 'DAP' }, sale), 422, /CFR/);
  const r: any = await svc.patchSalesExt(prod.voyage.id, { way: 'CFR', contract: '' }, sale);
  assert.equal(r.way, 'CFR'); assert.equal(r.contract, null);
  const b = await svc.create({ ...bulk, cargo } as any, lin);
  await err(svc.patchSalesExt(b.voyage.id, { way: 'FOB' }, admin), 422, /成品销售船/);
  await err(svc.patchSettlement(prod.voyage.id, { allowDays: 1 }, admin), 422, /大宗/);
});

test('幂等：同一个键重复提交只创建一次', async () => {
  const { svc, store } = mk();
  const a = await svc.create({ ...bulk, cargo } as any, lin, 'k-1'), b = await svc.create({ ...bulk, cargo } as any, lin, 'k-1');
  assert.equal(a.voyage.id, b.voyage.id); assert.equal((await store.list()).length, 1);
});

test('列表：未结束在前按本港日期升序，已结束在后降序；筛选与分页', async () => {
  const { svc } = mk();
  const mkv = (o: any) => svc.create({ ...bulk, cargo, ...o } as any, lin);
  const v1 = await mkv({ planDischS: '2026-11-20' }), v2 = await mkv({ planDischS: '2026-11-10', no: 'N2' });
  const v3 = await mkv({ planDischS: '2026-10-01' }), v4 = await mkv({ planDischS: '2026-10-20' });
  await svc.setFlag(v3.voyage.id, '取消', true, lin); await svc.setFlag(v4.voyage.id, '取消', true, lin);
  const l = await svc.list({});
  assert.deepEqual(l.items.map((x) => x.id), [v2.voyage.id, v1.voyage.id, v4.voyage.id, v3.voyage.id]);
  assert.equal(l.items[0].tons, 50000);
  assert.equal((await svc.list({ status: '已结束（取消）' })).total, 2);
  assert.equal((await svc.list({ from: '2026-11-15' })).total, 1);
  assert.equal((await svc.list({ q: 'n2' })).total, 1);
  assert.equal((await svc.list({ pageSize: 1, page: 2 })).items[0].id, v1.voyage.id);
});

test('详情：不存在 404；返回时间线所需的主表、明细、修订、日志', async () => {
  const { svc } = mk();
  await err(svc.get('VY-0', lin), 404);
  const { voyage } = await svc.create({ ...bulk, cargo } as any, lin);
  const d: any = await svc.get(voyage.id, lin);
  assert.deepEqual(Object.keys(d).sort(), ['can', 'cargo', 'changeLog', 'etaRevisions', 'salesExt', 'settlement', 'voyage']);
  assert.equal(d.can.edit, true); assert.equal((await svc.get(voyage.id, other) as any).can.edit, false);
});

test('列表：多状态、只看我的、重点关注、合同号搜索；页签数与状态数各自不受自身条件影响', async () => {
  const { svc } = mk();
  const mkv = ({ contract, ...o }: any, who = lin) => svc.create({ ...bulk, cargo: [{ name: 'x', tons: 1, contract: contract || '' }], ...o } as any, who);
  const a = await mkv({ contract: 'HT-100', planDischS: '2026-11-10' }), b = await mkv({ planDischS: '2026-11-11' }, other);
  const c = await mkv({ vessel: undefined, planDischS: '2026-11-12', focus: true });
  await mkv({ biz: '成品销售船', load: 'BAHODOPI', disch: 'HAIPHONG', laycanS: '2026-11-13' } as any, sale);
  await svc.setFlag(b.voyage.id, '取消', true, other);
  assert.deepEqual((await svc.list({ status: '待宣船,已结束（取消）' }, lin)).items.map((x) => x.id).sort(), [b.voyage.id, c.voyage.id].sort());
  assert.deepEqual((await svc.list({ mine: true }, lin)).items.map((x) => x.id).sort(), [a.voyage.id, c.voyage.id].sort());
  assert.deepEqual((await svc.list({ focus: true }, lin)).items.map((x) => x.id), [c.voyage.id]);
  assert.deepEqual((await svc.list({ q: 'ht-100' }, lin)).items.map((x) => x.id), [a.voyage.id]);
  assert.deepEqual((await svc.list({ q: '待宣船' }, lin)).items.map((x) => x.id), [c.voyage.id], '没有船名的航次可按「待宣船」搜到');
  const r = await svc.list({ biz: '大宗采购船', status: '待宣船' }, lin);
  assert.deepEqual([r.total, r.counts.biz['大宗采购船'], r.counts.biz['成品销售船'], r.counts.biz.all], [1, 1, 0, 1], '页签数受状态筛选影响，不受业务类型筛选影响');
  assert.deepEqual([r.counts.status['未到装港'], r.counts.status['已结束（取消）'], r.counts.status.all], [1, 1, 3], '状态数在当前业务类型下，不受状态筛选影响');
});
