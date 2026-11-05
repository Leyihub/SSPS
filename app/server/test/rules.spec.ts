// 用手工构造的小数据逐条验证锁定规则（不依赖原型）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../engine';
import { buildRule } from '../domain/routeRules';
import { dn, iso } from '../lib/dates';

const TODAY = '2026-11-05', T = dn(TODAY), d = (n) => iso(T + n);
const berths = [['A1', 50000], ['A2', 50000], ['A3', 50000], ['A4', 50000], ['S1', 10000], ['S2', 10000], ['X1', 70000]].map(([code, capacity]) => ({ code, terminal: '北区码头', capacity, status: '启用' }));
const rule = buildRule({ id: 'R1', load: 'QHD', disch: 'BAHODOPI', biz: ['大宗采购船', '物资备件船'], exp: 8, expMax: 10, samples: 0 });
const prodRule = buildRule({ id: 'R2', load: 'BAHODOPI', disch: 'HPH', biz: ['成品销售船'], exp: 9, expMax: 11, samples: 0 });
const row = (berth, s, e, extra = {}) => ({ berth, inPool: true, start: d(s), end: d(e), eta: d(s), vessel: 'MV ' + berth + s, cargo: '煤', tons: 40000, ...extra });
// 靠船计划的覆盖范围 = 批次内最后一条预计靠泊日（原型口径）；用一条装不下 5 万吨的小泊位记录把覆盖延长，不影响 5 万吨池的占用
const cover = (n) => row('S1', n, n);
const make = (over = {}) => createEngine({ today: TODAY, berths, planRows: [], voyages: [], routeRules: [rule, prodRule], batchNo: 'BP-1', ...over });

test('CMR = 空闲泊位 ÷ 能装下的泊位；分母随货量变化；只比日期', () => {
  const E = make({ planRows: [row('A1', 3, 5), row('S1', 3, 5), row('X1', 3, 5), cover(10)] });
  const c = E.cmrDay(T + 4, E.poolFor(50000));
  assert.deepEqual([c.n, c.occ, c.cmr], [5, 2, 0.6]);                                  // 能装下 5 万吨的：A1–A4、X1；S1 装不下不计
  assert.equal(E.poolFor(10000).n, 7);
  assert.equal(E.poolFor(80000).n, 0);
  assert.equal(E.cmrDay(T + 6, E.poolFor(50000)).cmr, 1);                               // 5 号当天卸完之后才空闲
  assert.equal(E.cmrDay(T + 5, E.poolFor(50000)).occ, 2, '预计卸完当天仍算占用（占用区间含两端，只比日期）');
});

test('无数据不是 0%：超出靠船计划覆盖的日子是 nodata', () => {
  const E = make({ planRows: [row('A1', 3, 5), cover(8)] });
  assert.equal(E.cmrDay(T + 8, E.poolFor(50000)).state, 'ok');
  assert.equal(E.cmrDay(T + 9, E.poolFor(50000)).state, 'nodata', '覆盖到最后一条预计靠泊日为止');
  assert.equal(E.calendar(50000).days[12].state, 'nodata');
  assert.equal(make().cmrDay(T, make().poolFor(50000)).state, 'nodata', '没有任何靠船计划时全部无数据');
});

test('按日期分流：≤15 天靠船计划，＞15 天航次表；表外泊位和取消航次不计', () => {
  const E = make({ planRows: [row('A1', 3, 30), row('A2', 3, 30, { inPool: false }), cover(30)],
    voyages: [{ id: 'V1', flags: [], winStart: d(20), winEnd: d(22), totalTons: 50000, biz: '大宗采购船' }, { id: 'V2', flags: ['取消'], winStart: d(20), winEnd: d(22), totalTons: 50000, biz: '大宗采购船' }] });
  assert.equal(E.modeOf(T + 15), 'cmr'); assert.equal(E.modeOf(T + 16), 'density');
  assert.equal(E.cmrDay(T + 10, E.poolFor(50000)).occ, 1, '表外泊位不计');
  assert.equal(E.densityDay(T + 21, E.poolFor(50000)).count, 1, '取消航次不计');
  assert.equal(E.densityDay(T + 30, E.poolFor(50000)).state, 'nodata');
});

test('只出 Plan A / Plan B；排序用 CMR_min；B 要求余量 ≥30% 且与 A 窗口不重叠', () => {
  const rows = []; for (let day = 10; day <= 13; day++) rows.push(row('A1', day, day), row('A2', day, day), row('A3', day, day));
  const E = make({ planRows: [...rows, row('X1', 0, 15), cover(20)] });        // 10–13 日：5 个能装下的泊位只剩 1 个空闲（20%）；16 日起全空
  const r = E.predict({ biz: '大宗采购船', tons: 50000, load: 'QHD', disch: 'BAHODOPI', winStart: d(10), winEnd: d(18) });
  const [A, B] = r.plans;
  assert.equal(A.c.s, T + 16); assert.equal(A.c.metric, 1);                    // A：CMR_min 最高的窗口
  assert.equal(B, null);                                                       // 其余窗口要么与 A 重叠、要么余量 <30%，不凑数
  assert.equal(r.bMissing, true);
  const E2 = make({ planRows: [row('A1', 10, 13), row('X1', 0, 15), cover(20)] });   // 10–13 日只占 2 个泊位 → 余量 60%，B 应当出现
  const r2 = E2.predict({ biz: '大宗采购船', tons: 50000, load: 'QHD', disch: 'BAHODOPI', winStart: d(10), winEnd: d(18) });
  assert.ok(r2.plans[1] && r2.plans[1].qualifies && Math.abs(r2.plans[1].c.s - r2.plans[0].c.s) >= 3);
  assert.equal(r2.plans.length, 2, '只出 A/B，没有 C/D');
});

test('发船日 = 到港窗口最后一天 − P80；发船日早于今天的候选被剔除', () => {
  const E = make({ planRows: [row('A1', 0, 40), cover(45)] });
  const r = E.predict({ biz: '大宗采购船', tons: 50000, load: 'QHD', disch: 'BAHODOPI', winStart: d(0), winEnd: d(14) });
  assert.ok(r.plans[0].depart >= T, '发船日不早于今天');
  assert.equal(r.plans[0].depart, r.plans[0].c.e - 10);
  assert.equal(r.plans[0].etaFrom, r.plans[0].depart + 8);
  assert.ok(r.excluded.pastDepart > 0);
});

test('缺航程规则：拦截而不是编造默认航程；成品销售船不需要航程也能出方案', () => {
  const E = make({ planRows: [row('A1', 0, 40), cover(45)] });
  assert.equal(E.predict({ biz: '大宗采购船', tons: 50000, load: 'NEW', disch: 'BAHODOPI', winStart: d(5), winEnd: d(12) }).noRule, true);
  const p = E.predict({ biz: '成品销售船', tons: 50000, load: 'BAHODOPI', disch: 'HPH', winStart: d(5), winEnd: d(12) });
  assert.ok(p.plans[0] && p.plans[0].deadline === T + 12 && p.plans[0].custEta);
  assert.equal(p.run.side, '装');
});

test('入参校验：货量、窗口、窗口早于今天、超过最大泊位', () => {
  const E = make({ planRows: [row('A1', 0, 40), cover(45)] });
  const base = { biz: '大宗采购船', tons: 50000, load: 'QHD', disch: 'BAHODOPI', winStart: d(5), winEnd: d(12) };
  assert.equal(E.predict({ ...base, tons: 0 }).errors.length, 1);
  assert.equal(E.predict({ ...base, winEnd: d(2) }).errors.length, 1);
  assert.equal(E.predict({ ...base, winStart: d(-1) }).errors.length, 1);
  assert.equal(E.predict({ ...base, tons: 900000 }).errors.length, 1);
});

test('稀疏候选：只在没有完整数据候选时使用，标低可信，且仍要求有数据的天余量 ≥30%', () => {
  // 靠船计划只覆盖到 d(11)；窗口 d(10)–d(14)：每个 3 天窗口都缺数据
  const open = make({ planRows: [row('A1', 10, 11)] });
  const r = open.predict({ biz: '大宗采购船', tons: 50000, load: 'QHD', disch: 'BAHODOPI', winStart: d(10), winEnd: d(14) });
  assert.ok(r.plans[0] && r.plans[0].trust === '低可信' && r.plans[0].reasons.length);
  // 有数据的天全部拥挤（余量 <30%）：A 仍给出（并标低可信），但 B 不会选一个余量不足 30% 的稀疏候选
  const rows = []; for (const b of ['A1', 'A2', 'A3', 'A4']) rows.push(row(b, 10, 11));
  const tight = make({ planRows: rows });
  const t = tight.predict({ biz: '大宗采购船', tons: 50000, load: 'QHD', disch: 'BAHODOPI', winStart: d(10), winEnd: d(14) });
  assert.equal(t.plans[1], null);
});

test('库存断料：窗口末日不晚于「断料日 − 缓冲」；赶不上时改为最快到港并如实提示', () => {
  const E = make({ planRows: [row('A1', 0, 40), cover(45)] });
  const series = (stock0, daily) => { const s = []; let v = stock0; for (let k = 0; k <= 60; k++) { s.push([T + k, Math.max(0, v), daily]); v -= daily; } return s; };
  const ok = { name: '煤A', type: '焦煤', stock: 100000, daily: 1000, series: series(100000, 1000) };     // 第 100 天断料，模拟期外
  const r1 = E.predict({ biz: '大宗采购船', tons: 50000, load: 'QHD', disch: 'BAHODOPI', winStart: d(0), winEnd: d(40), item: ok, pathBy: 'end' });
  assert.equal(r1.stock.so, null); assert.equal(r1.urgent, false);
  const mid = { name: '煤B', type: '焦煤', stock: 30000, daily: 1000, series: series(30000, 1000) };       // 第 30 天断料 → 最晚到港第 27 天
  const r2 = E.predict({ biz: '大宗采购船', tons: 50000, load: 'QHD', disch: 'BAHODOPI', winStart: d(0), winEnd: d(40), item: mid, pathBy: 'end' });
  assert.equal(r2.stock.so, T + 30); assert.equal(r2.stock.latest, T + 27);
  assert.ok(r2.plans[0].c.e <= T + 27, '推荐方案到港窗口末日 ≤ 最晚到港日'); assert.equal(r2.plans[0].stock.state, 'safe');
  const low = { name: '煤C', type: '焦煤', stock: 6000, daily: 1000, series: series(6000, 1000) };          // 第 6 天断料：按 P80=10 天航程赶不上
  const r3 = E.predict({ biz: '大宗采购船', tons: 50000, load: 'QHD', disch: 'BAHODOPI', winStart: d(0), winEnd: d(20), item: low, pathBy: 'end' });
  assert.equal(r3.urgent, true); assert.ok(r3.plans[0].stock.state === 'out' && r3.plans[0].stock.gap > 0);
});

test('短缺口回弹：首次缺口赶不上且之后被补回 → 提示缺口，断料日取下一次', () => {
  const E = make({ planRows: [row('A1', 0, 60), cover(60)] });
  const s = []; let v = 3000; for (let k = 0; k <= 60; k++) { if (k === 5) v += 40000; s.push([T + k, Math.max(0, v), 1000]); v -= 1000; }
  const it = { name: '煤D', type: '焦煤', stock: 3000, daily: 1000, series: s };       // 第 3 天降到 0，第 5 天到货补回，约第 44 天再断
  const r = E.predict({ biz: '大宗采购船', tons: 30000, load: 'QHD', disch: 'BAHODOPI', winStart: d(0), winEnd: d(50), item: it, pathBy: 'end' });
  assert.ok(r.stock.gap && r.stock.gap.from === T + 3, '提示近期缺口');
  assert.ok(r.stock.so > T + 30, '断料日取补回后的下一次');
});

test('库存序列里的错误值（null）不参与断料判断', () => {
  const E = make({ planRows: [row('A1', 0, 40), cover(45)] });
  const it = { name: '煤E', type: '焦煤', stock: 50000, daily: 1000, series: [[T, 50000, 1000], [T + 1, null, 1000], [T + 2, 48000, 1000]] };
  assert.equal(E.effStockout(it, 3, 'QHD', 'BAHODOPI', '大宗采购船').so, null);
});
